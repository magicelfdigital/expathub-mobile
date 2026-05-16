import type { Express, Request, Response } from "express";
import pg from "pg";

// ── Auth-prompt (signup nudge) analytics ─────────────────────────────────
//
// Task #89 introduced two events fired around the auth modal that anonymous
// users land on when they tap a gated surface (worksheet list, worksheet
// detail, etc):
//   - `auth_prompt_shown`     — the auth modal mounted with an entry_point
//   - `auth_prompt_converted` — the user successfully registered / signed in
//                                from that prompt
//
// Both events carry `properties.entry_point` (e.g. `worksheet_list_anon`,
// `worksheet_detail_anon`) so we can compare which nudge placements are
// actually pulling their weight. We persist them locally — in addition to
// forwarding upstream to PostHog — so the admin dashboard can compute
// conversion rates without depending on PostHog's API.

export const AUTH_PROMPT_EVENT_NAMES = [
  "auth_prompt_shown",
  "auth_prompt_converted",
] as const;
export type AuthPromptEventName = (typeof AUTH_PROMPT_EVENT_NAMES)[number];

export function isAuthPromptEventName(
  value: unknown,
): value is AuthPromptEventName {
  return (
    typeof value === "string" &&
    (AUTH_PROMPT_EVENT_NAMES as readonly string[]).includes(value)
  );
}

// Entry points are an open set defined by callers (mostly `app/auth.tsx`).
// We don't hard-code them: anything that arrives as a non-empty string is
// stored verbatim; missing / non-string values bucket into `unknown` so a
// caller that forgets to pass an entry_point doesn't silently disappear
// from the dashboard.
export const UNKNOWN_ENTRY_POINT = "unknown";

export function extractEntryPoint(body: unknown): string {
  if (!body || typeof body !== "object") return UNKNOWN_ENTRY_POINT;
  const props = (body as { properties?: unknown }).properties;
  const raw =
    props && typeof props === "object"
      ? (props as { entry_point?: unknown }).entry_point
      : undefined;
  if (typeof raw !== "string") return UNKNOWN_ENTRY_POINT;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return UNKNOWN_ENTRY_POINT;
  // Keep the stored value bounded — the column is VARCHAR(64).
  return trimmed.slice(0, 64);
}

let ensureTablePromise: Promise<void> | null = null;

export function resetAuthPromptAnalyticsEnsureCache(): void {
  ensureTablePromise = null;
}

export async function ensureAuthPromptEventsTable(pool: pg.Pool): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_prompt_events (
           id SERIAL PRIMARY KEY,
           event VARCHAR(40) NOT NULL,
           entry_point VARCHAR(64) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`,
      );
      // Lazy migration for the PostHog backfill (task #95): we tag rows
      // imported from PostHog with their upstream event uuid so re-running
      // the import is idempotent. Live writes from recordAuthPromptEvent
      // leave this NULL, so we scope the unique constraint with a partial
      // index — that way we never collide with the millions of in-app
      // events that legitimately have no upstream id.
      await pool.query(
        `ALTER TABLE auth_prompt_events
           ADD COLUMN IF NOT EXISTS posthog_event_id VARCHAR(64)`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_prompt_events_posthog_uid_idx
           ON auth_prompt_events (posthog_event_id)
         WHERE posthog_event_id IS NOT NULL`,
      );
    })().catch((err) => {
      // Reset so a transient failure doesn't permanently disable persistence.
      ensureTablePromise = null;
      throw err;
    });
  }
  await ensureTablePromise;
}

export async function recordAuthPromptEvent(
  pool: pg.Pool,
  body: unknown,
): Promise<void> {
  if (!body || typeof body !== "object") return;
  const event = (body as { event?: unknown }).event;
  if (!isAuthPromptEventName(event)) return;
  const entryPoint = extractEntryPoint(body);
  const distinctId = (body as { distinct_id?: unknown }).distinct_id;
  await ensureAuthPromptEventsTable(pool);
  await pool.query(
    `INSERT INTO auth_prompt_events (event, entry_point, distinct_id)
     VALUES ($1, $2, $3)`,
    [event, entryPoint, typeof distinctId === "string" ? distinctId : null],
  );
}

export interface AuthPromptAnalyticsOptions {
  windowDays: number;
}

export interface EntryPointMetrics {
  entryPoint: string;
  shown: number;
  converted: number;
  // converted ÷ shown — null when shown is 0 so the UI can render "—".
  conversionRate: number | null;
}

export interface AuthPromptWeeklyMetrics {
  weekStart: string;
  shown: number;
  converted: number;
  conversionRate: number | null;
}

export interface AuthPromptAnalytics {
  windowDays: number;
  totals: EntryPointMetrics;
  byEntryPoint: EntryPointMetrics[];
  // ISO-week buckets, oldest-first, covering the most recent 8 weeks
  // (inclusive of the current in-progress week). Independent of
  // `windowDays` so the trend stays comparable across visits.
  weekly: AuthPromptWeeklyMetrics[];
}

function aggregate(
  rows: Array<{ event: string; n: string | number }>,
  entryPoint: string,
): EntryPointMetrics {
  let shown = 0;
  let converted = 0;
  for (const row of rows) {
    const n = Number(row.n) || 0;
    if (row.event === "auth_prompt_shown") shown += n;
    else if (row.event === "auth_prompt_converted") converted += n;
  }
  return {
    entryPoint,
    shown,
    converted,
    conversionRate: shown > 0 ? converted / shown : null,
  };
}

export async function computeAuthPromptAnalytics(
  pool: pg.Pool,
  options: AuthPromptAnalyticsOptions,
): Promise<AuthPromptAnalytics> {
  await ensureAuthPromptEventsTable(pool);
  const windowDays = Math.max(1, Math.min(365, Math.floor(options.windowDays)));
  const interval = `${windowDays} days`;

  const eventsResult = await pool.query<{
    event: string;
    entry_point: string;
    n: string;
  }>(
    `SELECT event, entry_point, COUNT(*)::bigint AS n
       FROM auth_prompt_events
      WHERE created_at >= NOW() - $1::interval
      GROUP BY event, entry_point`,
    [interval],
  );

  const totals = aggregate(
    eventsResult.rows.map((r) => ({ event: r.event, n: r.n })),
    "all",
  );

  const entryPoints = Array.from(
    new Set(eventsResult.rows.map((r) => r.entry_point)),
  );
  const byEntryPoint = entryPoints
    .map((ep) =>
      aggregate(
        eventsResult.rows.filter((r) => r.entry_point === ep),
        ep,
      ),
    )
    // Sort by impressions desc so the highest-volume placement leads —
    // ties broken alphabetically for a stable rendering.
    .sort((a, b) => {
      if (b.shown !== a.shown) return b.shown - a.shown;
      return a.entryPoint.localeCompare(b.entryPoint);
    });

  const weeklyResult = await pool.query<{
    week_start: string;
    shown: string | number;
    converted: string | number;
  }>(
    `WITH weeks AS (
       SELECT (date_trunc('week', NOW())::date
                 - (n * INTERVAL '7 days'))::date AS week_start
         FROM generate_series(0, 7) AS n
     ),
     per_week AS (
       SELECT date_trunc('week', created_at)::date AS week_start,
              COUNT(*) FILTER (WHERE event = 'auth_prompt_shown')::int     AS shown,
              COUNT(*) FILTER (WHERE event = 'auth_prompt_converted')::int AS converted
         FROM auth_prompt_events
        WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '7 weeks'
        GROUP BY 1
     )
     SELECT to_char(w.week_start, 'YYYY-MM-DD')   AS week_start,
            COALESCE(p.shown, 0)::int             AS shown,
            COALESCE(p.converted, 0)::int         AS converted
       FROM weeks w
       LEFT JOIN per_week p ON p.week_start = w.week_start
      ORDER BY w.week_start ASC`,
  );
  const weekly: AuthPromptWeeklyMetrics[] = weeklyResult.rows.map((row) => {
    const shown = Number(row.shown) || 0;
    const converted = Number(row.converted) || 0;
    return {
      weekStart: String(row.week_start),
      shown,
      converted,
      conversionRate: shown > 0 ? converted / shown : null,
    };
  });

  return { windowDays, totals, byEntryPoint, weekly };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function metricsCells(m: EntryPointMetrics): string {
  return `
    <td style="text-align:right">${fmtInt(m.shown)}</td>
    <td style="text-align:right">${fmtInt(m.converted)}</td>
    <td style="text-align:right"><strong>${fmtPct(m.conversionRate)}</strong></td>
  `;
}

function renderWeeklyChartSvg(weeks: AuthPromptWeeklyMetrics[]): string {
  // Compact inline SVG so the dashboard stays a single static HTML file
  // (no chart library, no JS). Two bars per week (shown + converted) plus
  // a conversion-rate line on a secondary axis.
  const width = 720;
  const height = 220;
  const padLeft = 44;
  const padRight = 44;
  const padTop = 16;
  const padBottom = 36;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const n = weeks.length;
  const maxShown = Math.max(1, ...weeks.map((w) => w.shown));
  const slot = innerW / Math.max(n, 1);
  const barW = Math.max(6, Math.min(28, slot * 0.55));

  const yBar = (v: number) => padTop + innerH - (v / maxShown) * innerH;
  const xCenter = (i: number) => padLeft + slot * (i + 0.5);
  const yRate = (r: number | null) =>
    r === null ? null : padTop + innerH - r * innerH;

  const bars = weeks
    .map((w, i) => {
      const cx = xCenter(i);
      const shownTop = yBar(w.shown);
      const convertedTop = yBar(w.converted);
      const baseY = padTop + innerH;
      return `
      <g>
        <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml(
          w.weekStart,
        )}: ${fmtInt(w.shown)} shown</title></rect>
        <rect x="${cx - barW / 2}" y="${convertedTop}" width="${barW}" height="${baseY - convertedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml(
          w.weekStart,
        )}: ${fmtInt(w.converted)} converted</title></rect>
      </g>`;
    })
    .join("");

  const linePoints = weeks.map((w, i) => ({
    x: xCenter(i),
    y: yRate(w.conversionRate),
    rate: w.conversionRate,
    weekStart: w.weekStart,
  }));
  const segments: string[] = [];
  for (let i = 1; i < linePoints.length; i++) {
    const a = linePoints[i - 1];
    const b = linePoints[i];
    if (a.y !== null && b.y !== null) {
      segments.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d97706" stroke-width="2" />`,
      );
    }
  }
  const dots = linePoints
    .filter((p) => p.y !== null)
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#d97706"><title>${escapeHtml(
          p.weekStart,
        )}: ${fmtPct(p.rate)} conversion</title></circle>`,
    )
    .join("");

  const xLabels = weeks
    .map((w, i) => {
      const short = w.weekStart.slice(5);
      return `<text x="${xCenter(i)}" y="${
        padTop + innerH + 18
      }" text-anchor="middle" font-size="10" fill="#666">${escapeHtml(short)}</text>`;
    })
    .join("");

  const yTicks = [0, 0.5, 1].map((frac) => {
    const y = padTop + innerH - frac * innerH;
    const count = Math.round(maxShown * frac);
    const pct = `${Math.round(frac * 100)}%`;
    return `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + innerW}" y2="${y}" stroke="#eee" stroke-width="1" />
      <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#666">${fmtInt(count)}</text>
      <text x="${padLeft + innerW + 6}" y="${y + 3}" text-anchor="start" font-size="10" fill="#d97706">${pct}</text>
    `;
  }).join("");

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Weekly auth-prompt impressions, conversions, and conversion rate" style="background:#fff;border:1px solid #e5e5e5;border-radius:10px">
    ${yTicks}
    ${bars}
    ${segments.join("")}
    ${dots}
    ${xLabels}
  </svg>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#555">
    <span><span style="display:inline-block;width:10px;height:10px;background:#cfe1f7;border-radius:2px;vertical-align:middle"></span> Shown</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#0a66c2;border-radius:2px;vertical-align:middle"></span> Converted</span>
    <span><span style="display:inline-block;width:14px;height:2px;background:#d97706;vertical-align:middle"></span> Conversion rate</span>
  </div>`;
}

function renderWeeklyTable(weeks: AuthPromptWeeklyMetrics[]): string {
  const rows = weeks
    .map(
      (w) => `
      <tr>
        <td><code>${escapeHtml(w.weekStart)}</code></td>
        <td style="text-align:right">${fmtInt(w.shown)}</td>
        <td style="text-align:right">${fmtInt(w.converted)}</td>
        <td style="text-align:right"><strong>${fmtPct(w.conversionRate)}</strong></td>
      </tr>`,
    )
    .join("");
  return `
  <table>
    <thead>
      <tr>
        <th>Week starting (Mon)</th>
        <th style="text-align:right">Shown</th>
        <th style="text-align:right">Converted</th>
        <th style="text-align:right">Conversion rate</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Defuse CSV formula injection: spreadsheet apps treat cells beginning
  // with =, +, -, @, tab, or CR as formulas. `entry_point` is caller-
  // supplied so prefix any such leading character with a single quote.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtRateForCsv(rate: number | null): string {
  if (rate === null) return "";
  // Four decimal places preserves enough precision for spreadsheet recompute
  // while staying compact (e.g. 0.2000 rather than 0.20000000000000001).
  return rate.toFixed(4);
}

export function renderAuthPromptAnalyticsCsv(data: AuthPromptAnalytics): string {
  const { windowDays, totals, byEntryPoint, weekly } = data;
  const lines: string[] = [];
  lines.push(`# Auth-prompt analytics — last ${windowDays} days`);
  lines.push("");
  lines.push("section,key,shown,converted,conversion_rate");
  for (const m of byEntryPoint) {
    lines.push(
      [
        "entry_point",
        csvEscape(m.entryPoint),
        m.shown,
        m.converted,
        fmtRateForCsv(m.conversionRate),
      ].join(","),
    );
  }
  lines.push(
    [
      "entry_point",
      "__total__",
      totals.shown,
      totals.converted,
      fmtRateForCsv(totals.conversionRate),
    ].join(","),
  );
  for (const w of weekly) {
    lines.push(
      [
        "weekly",
        csvEscape(w.weekStart),
        w.shown,
        w.converted,
        fmtRateForCsv(w.conversionRate),
      ].join(","),
    );
  }
  // Trailing newline keeps tools like `tail` and Excel happy.
  return lines.join("\n") + "\n";
}

export interface BackfillBanner {
  fetched: number;
  inserted: number;
  skipped: number;
}

export function renderAuthPromptAnalyticsHtml(
  data: AuthPromptAnalytics,
  banner: BackfillBanner | null = null,
  backfillRuns: BackfillRunRecord[] = [],
): string {
  const { totals, byEntryPoint, windowDays, weekly } = data;
  const entryPointRows = byEntryPoint.length
    ? byEntryPoint
        .map(
          (m) => `
        <tr>
          <td><code>${escapeHtml(m.entryPoint)}</code></td>
          ${metricsCells(m)}
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="text-align:center;color:#888;padding:20px">No auth-prompt events in this window.</td></tr>`;

  const bannerHtml = banner
    ? `<div style="background:#e7f5ec;border:1px solid #b8dec5;color:#1b5e3a;padding:10px 14px;border-radius:8px;margin:12px 0;">
         PostHog backfill complete — fetched <strong>${fmtInt(banner.fetched)}</strong>,
         inserted <strong>${fmtInt(banner.inserted)}</strong>,
         already-present (skipped) <strong>${fmtInt(banner.skipped)}</strong>.
       </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Auth-prompt analytics</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; max-width: 960px; color: #111; background: #fafafa; }
    h1 { margin: 0 0 4px; }
    h2 { margin: 32px 0 8px; font-size: 16px; }
    p { color: #555; }
    .nav { margin-bottom: 16px; }
    .nav a { color: #0a66c2; text-decoration: none; }
    .nav a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
    th { background: #f7f7f7; text-align: left; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .filter { margin: 16px 0; }
    .filter a { display: inline-block; padding: 4px 10px; margin-right: 6px; border: 1px solid #d0d0d0; border-radius: 999px; color: #333; text-decoration: none; font-size: 12px; background: #fff; }
    .filter a.active { background: #0a66c2; color: #fff; border-color: #0a66c2; }
    .desc { color: #666; font-size: 12px; margin: -4px 0 12px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">← Admin tools</a></div>
  <h1>Auth-prompt (signup nudge) analytics</h1>
  ${bannerHtml}
  ${renderBackfillHistory(backfillRuns)}
  <details style="margin:12px 0 16px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:10px 14px;">
    <summary style="cursor:pointer;font-weight:600;">Backfill from PostHog</summary>
    <p style="color:#555;font-size:13px;margin-top:8px">
      Imports historical <code>auth_prompt_shown</code> and
      <code>auth_prompt_converted</code> events from PostHog into the local
      <code>auth_prompt_events</code> table. Idempotent — events already
      imported (matched by upstream uuid) are skipped, not duplicated. Leave
      "since" blank to pull the full history. Requires
      <code>POSTHOG_PROJECT_ID</code> and <code>POSTHOG_PERSONAL_API_KEY</code>
      to be set on the server.
    </p>
    <form method="post" action="/api/admin/auth-prompt-analytics/backfill" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:12px;color:#555;">
        Since (optional, ISO date):
        <input type="text" name="since" placeholder="2026-01-01" style="padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font:inherit;" />
      </label>
      <button type="submit" style="padding:6px 14px;background:#0a66c2;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;">
        Run backfill
      </button>
    </form>
  </details>
  <p>Last <strong>${windowDays}</strong> days. Conversion rate = <code>auth_prompt_converted</code> ÷ <code>auth_prompt_shown</code>, grouped by <code>entry_point</code>.</p>

  <div class="filter">
    Window:
    ${[7, 14, 30, 60, 90]
      .map(
        (d) =>
          `<a href="?days=${d}" class="${d === windowDays ? "active" : ""}">${d}d</a>`,
      )
      .join("")}
  </div>

  <h2>Weekly trend (last 8 weeks)</h2>
  <p class="desc">Always covers the most recent 8 ISO weeks (Mon–Sun) regardless of the window above, so trends remain comparable as you change the filter. Bars use the left axis (counts); the line uses the right axis (conversion rate).</p>
  ${renderWeeklyChartSvg(weekly)}
  ${renderWeeklyTable(weekly)}

  <h2>Conversion by entry point</h2>
  <p class="desc">
    Each row is a unique <code>entry_point</code> value as fired from
    <code>app/auth.tsx</code> (e.g. <code>worksheet_list_anon</code>,
    <code>worksheet_detail_anon</code>). Events that arrived without an
    entry_point bucket into <code>${escapeHtml(UNKNOWN_ENTRY_POINT)}</code>.
    Rows are sorted by impressions, highest first.
  </p>
  <table>
    <thead>
      <tr>
        <th>Entry point</th>
        <th style="text-align:right">Shown</th>
        <th style="text-align:right">Converted</th>
        <th style="text-align:right">Conversion rate</th>
      </tr>
    </thead>
    <tbody>
      ${entryPointRows}
      <tr><td><strong>Total</strong></td>${metricsCells(totals)}</tr>
    </tbody>
  </table>

  <p style="margin-top:24px;color:#888;font-size:12px">
    JSON: <code>/api/admin/auth-prompt-analytics?days=${windowDays}</code>
    · <a href="/admin/auth-prompt-analytics.csv?days=${windowDays}">Download CSV</a>
  </p>
</body>
</html>`;
}

function readWindowDays(req: Request): number {
  const raw = req.query.days;
  if (typeof raw !== "string") return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, n);
}

// ── PostHog backfill (task #95) ──────────────────────────────────────────
//
// The `auth_prompt_events` table only sees events that arrive after it was
// first created. Anything fired before that — or anything that failed to
// persist locally — lives only in PostHog (the upstream analytics store).
// This backfill walks the PostHog HogQL API for both auth_prompt events
// and inserts them into the local table, preserving the original
// `timestamp` as `created_at` and the original `properties.entry_point`.
//
// Idempotency is enforced via the `posthog_event_id` column + partial
// unique index added by ensureAuthPromptEventsTable — duplicate runs
// hit ON CONFLICT DO NOTHING and report `skipped` in the summary.

export interface PostHogBackfillOptions {
  // Optional ISO date string — only events with timestamp >= this point
  // are pulled. Defaults to no lower bound (full history).
  since?: string | null;
  // Per-page row count. PostHog's HogQL endpoint has a hard cap around
  // 10k, so we keep this conservative and paginate via OFFSET.
  pageSize?: number;
  // Hard ceiling on total rows fetched so a misconfigured backfill can't
  // walk a multi-million-event project until the request times out.
  maxRows?: number;
  // Injectable for tests.
  fetchImpl?: typeof fetch;
  // Injectable for tests / overrides. Falls back to env (see below).
  posthogHost?: string;
  posthogProjectId?: string;
  posthogApiKey?: string;
}

export interface PostHogBackfillSummary {
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  // ISO timestamps of the first and last event we touched in this run —
  // useful for confirming the historical window actually landed.
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export class PostHogBackfillConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostHogBackfillConfigError";
  }
}

// HogQL query: we project the five fields we need, ordered by timestamp
// (then uuid as a stable tiebreaker) so OFFSET pagination is deterministic
// even when many events share the same millisecond.
function buildHogQLQuery(since: string | null, limit: number, offset: number): string {
  const sinceClause = since
    ? ` AND timestamp >= toDateTime('${since.replace(/'/g, "")}')`
    : "";
  return (
    `SELECT uuid, event, timestamp, properties.entry_point AS entry_point, distinct_id ` +
    `FROM events ` +
    `WHERE event IN ('auth_prompt_shown', 'auth_prompt_converted')${sinceClause} ` +
    `ORDER BY timestamp ASC, uuid ASC ` +
    `LIMIT ${limit} OFFSET ${offset}`
  );
}

function normalizeEntryPointRaw(value: unknown): string {
  if (typeof value !== "string") return UNKNOWN_ENTRY_POINT;
  const trimmed = value.trim();
  if (trimmed.length === 0) return UNKNOWN_ENTRY_POINT;
  return trimmed.slice(0, 64);
}

export async function backfillAuthPromptEventsFromPostHog(
  pool: pg.Pool,
  options: PostHogBackfillOptions = {},
): Promise<PostHogBackfillSummary> {
  const host =
    options.posthogHost ?? process.env.POSTHOG_HOST ?? "https://us.posthog.com";
  const projectId =
    options.posthogProjectId ?? process.env.POSTHOG_PROJECT_ID ?? "";
  const apiKey =
    options.posthogApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY ?? "";
  if (!projectId || !apiKey) {
    throw new PostHogBackfillConfigError(
      "PostHog backfill requires POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = Math.max(1, Math.min(10000, options.pageSize ?? 1000));
  const maxRows = Math.max(pageSize, options.maxRows ?? 200_000);
  const since = options.since ?? null;

  await ensureAuthPromptEventsTable(pool);

  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(
    projectId,
  )}/query/`;

  const summary: PostHogBackfillSummary = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    pages: 0,
    firstEventAt: null,
    lastEventAt: null,
  };

  let offset = 0;
  while (summary.fetched < maxRows) {
    const limit = Math.min(pageSize, maxRows - summary.fetched);
    const body = {
      query: { kind: "HogQLQuery", query: buildHogQLQuery(since, limit, offset) },
    };
    const resp = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `PostHog query failed: ${resp.status} ${resp.statusText} ${text.slice(0, 200)}`,
      );
    }
    const payload = (await resp.json()) as {
      results?: unknown[][];
    };
    const rows = Array.isArray(payload.results) ? payload.results : [];
    summary.pages += 1;
    if (rows.length === 0) break;

    for (const row of rows) {
      const [uuidRaw, eventRaw, timestampRaw, entryPointRaw, distinctIdRaw] = row;
      if (typeof uuidRaw !== "string" || uuidRaw.length === 0) continue;
      if (!isAuthPromptEventName(eventRaw)) continue;
      // PostHog returns timestamps either as ISO strings or as objects with
      // a serialized form, depending on the column. We normalize to a Date
      // and let pg cast on insert.
      const tsDate =
        typeof timestampRaw === "string" || typeof timestampRaw === "number"
          ? new Date(timestampRaw)
          : timestampRaw instanceof Date
            ? timestampRaw
            : null;
      if (!tsDate || Number.isNaN(tsDate.getTime())) continue;
      const entryPoint = normalizeEntryPointRaw(entryPointRaw);
      const distinctId =
        typeof distinctIdRaw === "string" && distinctIdRaw.length > 0
          ? distinctIdRaw.slice(0, 255)
          : null;
      const uuid = uuidRaw.slice(0, 64);

      const ins = await pool.query<{ id: number }>(
        `INSERT INTO auth_prompt_events
           (event, entry_point, distinct_id, created_at, posthog_event_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (posthog_event_id)
           WHERE posthog_event_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [eventRaw, entryPoint, distinctId, tsDate, uuid],
      );
      summary.fetched += 1;
      if (ins.rowCount && ins.rowCount > 0) {
        summary.inserted += 1;
      } else {
        summary.skipped += 1;
      }
      const iso = tsDate.toISOString();
      if (!summary.firstEventAt || iso < summary.firstEventAt) {
        summary.firstEventAt = iso;
      }
      if (!summary.lastEventAt || iso > summary.lastEventAt) {
        summary.lastEventAt = iso;
      }
    }

    if (rows.length < limit) break;
    offset += rows.length;
  }

  // Persist a run summary so the dashboard can show *when* the table was
  // last reconciled with PostHog without re-running the import. Recording
  // lives here (inside the backfill operation) rather than at any single
  // call site so every caller — the admin POST route, the scheduled
  // self-heal, ad-hoc scripts — gets the same history entry consistently.
  // A recording failure must never mask a successful backfill.
  try {
    await recordAuthPromptBackfillRun(pool, summary, since);
  } catch (recordErr: any) {
    console.error(
      "Failed to record auth-prompt backfill run:",
      recordErr?.message,
    );
  }

  return summary;
}

// ── Backfill run history (task #106) ─────────────────────────────────────
//
// Each time the PostHog backfill runs we persist a small summary row so
// the dashboard can show *when* the local table was last reconciled with
// PostHog without re-running the import. The table is intentionally
// narrow — just the counts that operators care about and the `since`
// filter used so a partial backfill is distinguishable from a full one.

export interface BackfillRunRecord {
  id: number;
  ranAt: string;
  fetched: number;
  inserted: number;
  skipped: number;
  since: string | null;
}

let ensureRunsTablePromise: Promise<void> | null = null;

export function resetAuthPromptBackfillRunsEnsureCache(): void {
  ensureRunsTablePromise = null;
}

export async function ensureAuthPromptBackfillRunsTable(
  pool: pg.Pool,
): Promise<void> {
  if (!ensureRunsTablePromise) {
    ensureRunsTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_prompt_backfill_runs (
           id SERIAL PRIMARY KEY,
           ran_at TIMESTAMP NOT NULL DEFAULT NOW(),
           fetched INTEGER NOT NULL DEFAULT 0,
           inserted INTEGER NOT NULL DEFAULT 0,
           skipped INTEGER NOT NULL DEFAULT 0,
           since_value VARCHAR(64)
         )`,
      );
    })().catch((err) => {
      ensureRunsTablePromise = null;
      throw err;
    });
  }
  await ensureRunsTablePromise;
}

export async function recordAuthPromptBackfillRun(
  pool: pg.Pool,
  summary: { fetched: number; inserted: number; skipped: number },
  since: string | null,
): Promise<void> {
  await ensureAuthPromptBackfillRunsTable(pool);
  const sinceValue =
    since && since.trim().length > 0 ? since.trim().slice(0, 64) : null;
  await pool.query(
    `INSERT INTO auth_prompt_backfill_runs
       (fetched, inserted, skipped, since_value)
     VALUES ($1, $2, $3, $4)`,
    [summary.fetched, summary.inserted, summary.skipped, sinceValue],
  );
}

export async function getRecentAuthPromptBackfillRuns(
  pool: pg.Pool,
  limit = 5,
): Promise<BackfillRunRecord[]> {
  await ensureAuthPromptBackfillRunsTable(pool);
  const capped = Math.max(1, Math.min(50, Math.floor(limit)));
  const result = await pool.query<{
    id: number;
    ran_at: Date | string;
    fetched: number | string;
    inserted: number | string;
    skipped: number | string;
    since_value: string | null;
  }>(
    `SELECT id, ran_at, fetched, inserted, skipped, since_value
       FROM auth_prompt_backfill_runs
      ORDER BY ran_at DESC, id DESC
      LIMIT $1`,
    [capped],
  );
  return result.rows.map((row) => {
    const ranAt =
      row.ran_at instanceof Date
        ? row.ran_at.toISOString()
        : new Date(String(row.ran_at)).toISOString();
    return {
      id: Number(row.id),
      ranAt,
      fetched: Number(row.fetched) || 0,
      inserted: Number(row.inserted) || 0,
      skipped: Number(row.skipped) || 0,
      since: row.since_value ?? null,
    };
  });
}

function renderBackfillHistory(runs: BackfillRunRecord[]): string {
  if (runs.length === 0) {
    return `
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;margin:12px 0;color:#555;font-size:13px;">
    No PostHog backfill has run yet. Use the form above to import historical events.
  </div>`;
  }
  const [latest, ...rest] = runs;
  const latestRanAt = escapeHtml(latest.ranAt);
  const latestSince = latest.since
    ? ` (since <code>${escapeHtml(latest.since)}</code>)`
    : " (full history)";
  const historyRows = rest
    .map(
      (run) => `
      <tr>
        <td><code>${escapeHtml(run.ranAt)}</code></td>
        <td>${run.since ? `<code>${escapeHtml(run.since)}</code>` : '<span style="color:#888">full history</span>'}</td>
        <td style="text-align:right">${fmtInt(run.fetched)}</td>
        <td style="text-align:right">${fmtInt(run.inserted)}</td>
        <td style="text-align:right">${fmtInt(run.skipped)}</td>
      </tr>`,
    )
    .join("");
  const historyTable =
    rest.length > 0
      ? `
    <details style="margin-top:10px;">
      <summary style="cursor:pointer;font-size:12px;color:#555;">Previous runs (${rest.length})</summary>
      <table style="margin-top:8px;">
        <thead>
          <tr>
            <th>Ran at (UTC)</th>
            <th>Since</th>
            <th style="text-align:right">Fetched</th>
            <th style="text-align:right">Inserted</th>
            <th style="text-align:right">Skipped</th>
          </tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>
    </details>`
      : "";
  return `
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;margin:12px 0;">
    <div style="font-size:13px;color:#555;">
      Last PostHog backfill: <strong><time datetime="${latestRanAt}">${latestRanAt}</time></strong>${latestSince}
      — fetched <strong>${fmtInt(latest.fetched)}</strong>,
      inserted <strong>${fmtInt(latest.inserted)}</strong>,
      skipped <strong>${fmtInt(latest.skipped)}</strong>.
    </div>
    ${historyTable}
  </div>`;
}

export function registerAuthPromptAnalyticsRoutes(
  app: Express,
  deps: {
    requireAdminBasicAuth: (req: Request, res: Response) => boolean;
    getPool: () => pg.Pool | null;
  },
): void {
  app.get("/api/admin/auth-prompt-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeAuthPromptAnalytics(pool, {
        windowDays: readWindowDays(req),
      });
      res.json(data);
    } catch (err: any) {
      console.error("Auth-prompt analytics error:", err?.message);
      res
        .status(500)
        .json({ error: "Failed to compute auth-prompt analytics" });
    } finally {
      await pool.end();
    }
  });

  const sendCsv = async (req: Request, res: Response) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res
        .status(503)
        .type("text/plain")
        .send("Database not configured (set DATABASE_URL).");
      return;
    }
    try {
      const windowDays = readWindowDays(req);
      const data = await computeAuthPromptAnalytics(pool, { windowDays });
      const filename = `auth-prompt-analytics-${windowDays}d.csv`;
      res
        .type("text/csv; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        )
        .send(renderAuthPromptAnalyticsCsv(data));
    } catch (err: any) {
      console.error("Auth-prompt analytics CSV error:", err?.message);
      res
        .status(500)
        .type("text/plain")
        .send(`Failed to compute auth-prompt analytics: ${err?.message ?? "unknown"}`);
    } finally {
      await pool.end();
    }
  };

  app.get("/admin/auth-prompt-analytics.csv", sendCsv);

  app.post("/api/admin/auth-prompt-analytics/backfill", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    // `since` may arrive on the query string (from the HTML form on the
    // dashboard) or in a JSON body (from curl / scripts). Both shapes are
    // ISO-ish date strings; we pass through verbatim and let HogQL parse.
    const sinceRaw =
      (typeof req.query.since === "string" && req.query.since) ||
      (req.body && typeof (req.body as any).since === "string"
        ? (req.body as any).since
        : "");
    const since = sinceRaw && sinceRaw.trim().length > 0 ? sinceRaw.trim() : null;
    try {
      // backfillAuthPromptEventsFromPostHog persists a row to
      // auth_prompt_backfill_runs internally so every caller (this route,
      // the scheduled self-heal, ad-hoc scripts) contributes to history.
      const summary = await backfillAuthPromptEventsFromPostHog(pool, { since });
      // HTML form submissions expect to land back on the dashboard with a
      // human-readable summary; programmatic callers (Accept: application/json)
      // get the raw object.
      const wantsHtml =
        typeof req.headers.accept === "string" &&
        req.headers.accept.includes("text/html");
      if (wantsHtml) {
        const params = new URLSearchParams({
          backfill: "ok",
          fetched: String(summary.fetched),
          inserted: String(summary.inserted),
          skipped: String(summary.skipped),
        });
        res.redirect(`/admin/auth-prompt-analytics?${params.toString()}`);
        return;
      }
      res.json(summary);
    } catch (err: any) {
      console.error("Auth-prompt backfill error:", err?.message);
      const status = err instanceof PostHogBackfillConfigError ? 400 : 500;
      res.status(status).json({
        error: err?.message ?? "Failed to backfill auth-prompt events",
      });
    } finally {
      await pool.end();
    }
  });

  app.get("/admin/auth-prompt-analytics", async (req, res) => {
    if (req.query.format === "csv") {
      await sendCsv(req, res);
      return;
    }
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res
        .status(503)
        .type("text/html")
        .send(
          `<h1>Auth-prompt analytics unavailable</h1><p>Database is not configured (set <code>DATABASE_URL</code>).</p>`,
        );
      return;
    }
    try {
      const data = await computeAuthPromptAnalytics(pool, {
        windowDays: readWindowDays(req),
      });
      // When the backfill POST handler redirects back here it appends a
      // `backfill=ok&fetched=…&inserted=…&skipped=…` query string. Render
      // those numbers in a success banner so the operator sees the result
      // of the run without having to flip over to the JSON endpoint.
      const banner =
        req.query.backfill === "ok"
          ? {
              fetched: Number(req.query.fetched) || 0,
              inserted: Number(req.query.inserted) || 0,
              skipped: Number(req.query.skipped) || 0,
            }
          : null;
      // Fetch a short history (last 5 runs) so operators can see when
      // the table was last reconciled with PostHog without re-running.
      // A failure here should not break the dashboard — degrade to an
      // empty list so the rest of the page still renders.
      let recentRuns: BackfillRunRecord[] = [];
      try {
        recentRuns = await getRecentAuthPromptBackfillRuns(pool, 5);
      } catch (runsErr: any) {
        console.error(
          "Failed to load auth-prompt backfill run history:",
          runsErr?.message,
        );
      }
      res
        .type("text/html")
        .send(renderAuthPromptAnalyticsHtml(data, banner, recentRuns));
    } catch (err: any) {
      console.error("Auth-prompt analytics HTML error:", err?.message);
      res
        .status(500)
        .type("text/html")
        .send(
          `<h1>Auth-prompt analytics unavailable</h1><pre>${escapeHtml(
            err?.message ?? "unknown",
          )}</pre>`,
        );
    } finally {
      await pool.end();
    }
  });
}
