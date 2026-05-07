import type { Express, Request, Response } from "express";
import pg from "pg";

// ── Quiz "save your progress" prompt analytics ───────────────────────────
//
// The web /start funnel and the mobile onboarding quiz both fire three
// events through the soft email-capture modal:
//   - `quiz_save_shown`     — the modal was shown to the visitor
//   - `quiz_save_submitted` — the visitor entered their email
//   - `quiz_save_dismissed` — the visitor closed it without entering an email
//
// We persist these three events locally (in addition to forwarding them
// upstream to PostHog) so the admin dashboard can compute the recovery
// rate without depending on PostHog's API. Email-gate captures arrive
// independently as rows in `quiz_leads` (split by `source`), so the same
// dashboard can show whether the soft prompt is incremental or just
// cannibalising the regular email gate.

export const QUIZ_SAVE_EVENT_NAMES = [
  "quiz_save_shown",
  "quiz_save_submitted",
  "quiz_save_dismissed",
] as const;
export type QuizSaveEventName = (typeof QUIZ_SAVE_EVENT_NAMES)[number];

export function isQuizSaveEventName(value: unknown): value is QuizSaveEventName {
  return (
    typeof value === "string" &&
    (QUIZ_SAVE_EVENT_NAMES as readonly string[]).includes(value)
  );
}

// Surface attribution: web events carry `properties.surface = "web"`; mobile
// events go through `src/lib/analytics.ts` which sets a top-level `platform`
// of "ios" / "android" / "web". We collapse anything non-web into "mobile"
// so the dashboard always shows the two surfaces it cares about.
export type Surface = "web" | "mobile";

export function classifySurface(body: unknown): Surface {
  if (!body || typeof body !== "object") return "mobile";
  const props = (body as { properties?: unknown }).properties;
  const propsSurface =
    props && typeof props === "object"
      ? (props as { surface?: unknown }).surface
      : undefined;
  if (typeof propsSurface === "string" && propsSurface.toLowerCase() === "web") {
    return "web";
  }
  const platform = (body as { platform?: unknown }).platform;
  if (typeof platform === "string" && platform.toLowerCase() === "web") {
    return "web";
  }
  return "mobile";
}

let ensureTablePromise: Promise<void> | null = null;

export function resetQuizSaveAnalyticsEnsureCache(): void {
  ensureTablePromise = null;
}

export async function ensureQuizSaveEventsTable(pool: pg.Pool): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = pool
      .query(
        `CREATE TABLE IF NOT EXISTS quiz_save_events (
           id SERIAL PRIMARY KEY,
           event VARCHAR(40) NOT NULL,
           surface VARCHAR(16) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`,
      )
      .then(() => undefined)
      .catch((err) => {
        // Reset so a transient failure doesn't permanently disable persistence.
        ensureTablePromise = null;
        throw err;
      });
  }
  await ensureTablePromise;
}

export async function recordQuizSaveEvent(
  pool: pg.Pool,
  body: unknown,
): Promise<void> {
  if (!body || typeof body !== "object") return;
  const event = (body as { event?: unknown }).event;
  if (!isQuizSaveEventName(event)) return;
  const surface = classifySurface(body);
  const distinctId = (body as { distinct_id?: unknown }).distinct_id;
  await ensureQuizSaveEventsTable(pool);
  await pool.query(
    `INSERT INTO quiz_save_events (event, surface, distinct_id)
     VALUES ($1, $2, $3)`,
    [event, surface, typeof distinctId === "string" ? distinctId : null],
  );
}

export interface QuizSaveAnalyticsOptions {
  windowDays: number;
}

export interface SurfaceMetrics {
  shown: number;
  submitted: number;
  dismissed: number;
  // submitted ÷ shown — null when shown is 0 so the UI can render "—".
  recoveryRate: number | null;
}

export interface EmailGateMetrics {
  // Direct email-gate captures (the regular post-quiz capture).
  directCaptures: number;
  // Soft prompt captures (mid-quiz "save your progress" modal submissions
  // that wrote a `web_funnel_save` row to `quiz_leads`).
  saveCaptures: number;
  // saveCaptures ÷ (directCaptures + saveCaptures) — share of total captures
  // that came from the soft prompt. High share + low direct rate would
  // suggest cannibalisation; low share + steady direct rate suggests the
  // soft prompt is purely incremental.
  saveShareOfCaptures: number | null;
  // True when the `quiz_leads` table doesn't exist yet (fresh dev DB);
  // the dashboard surfaces this so silent zeros aren't read as "no
  // captures happened" when the truth is "we don't know yet".
  unavailable: boolean;
}

export interface WeeklyMetrics {
  // Monday of the ISO week, formatted YYYY-MM-DD.
  weekStart: string;
  shown: number;
  submitted: number;
  dismissed: number;
  // submitted ÷ shown — null when shown is 0 so the UI can render "—".
  recoveryRate: number | null;
}

export interface QuizSaveAnalytics {
  windowDays: number;
  totals: SurfaceMetrics;
  bySurface: Record<Surface, SurfaceMetrics>;
  emailGate: EmailGateMetrics;
  // ISO-week buckets, oldest-first, covering the most recent 8 weeks
  // (inclusive of the current in-progress week). Weeks with no events
  // still appear as explicit zero rows so a quiet week doesn't silently
  // disappear and hide a regression. Independent of `windowDays`: this
  // series always covers 8 weeks regardless of the dashboard window so
  // trends stay comparable across visits with different ?days= values.
  weekly: WeeklyMetrics[];
}

function metricsRow(rows: Array<{ event: string; n: string | number }>): SurfaceMetrics {
  const counts: Record<string, number> = {
    quiz_save_shown: 0,
    quiz_save_submitted: 0,
    quiz_save_dismissed: 0,
  };
  for (const row of rows) {
    const n = Number(row.n) || 0;
    // The query groups by (event, surface), so the same event can appear once
    // per surface — sum so the totals row reflects every surface combined.
    if (row.event in counts) counts[row.event] += n;
  }
  const shown = counts.quiz_save_shown;
  const submitted = counts.quiz_save_submitted;
  return {
    shown,
    submitted,
    dismissed: counts.quiz_save_dismissed,
    recoveryRate: shown > 0 ? submitted / shown : null,
  };
}

export async function computeQuizSaveAnalytics(
  pool: pg.Pool,
  options: QuizSaveAnalyticsOptions,
): Promise<QuizSaveAnalytics> {
  await ensureQuizSaveEventsTable(pool);
  const windowDays = Math.max(1, Math.min(365, Math.floor(options.windowDays)));
  const interval = `${windowDays} days`;

  const eventsResult = await pool.query<{
    event: string;
    surface: string;
    n: string;
  }>(
    `SELECT event, surface, COUNT(*)::bigint AS n
       FROM quiz_save_events
      WHERE created_at >= NOW() - $1::interval
      GROUP BY event, surface`,
    [interval],
  );

  const allRows = eventsResult.rows.map((r) => ({ event: r.event, n: r.n }));
  const totals = metricsRow(allRows);
  const bySurface: Record<Surface, SurfaceMetrics> = {
    web: metricsRow(eventsResult.rows.filter((r) => r.surface === "web")),
    mobile: metricsRow(eventsResult.rows.filter((r) => r.surface !== "web")),
  };

  // Email-gate cannibalisation comparison: count `quiz_leads` rows in the
  // same window, split by whether they came from the soft prompt.
  let emailGate: EmailGateMetrics = {
    directCaptures: 0,
    saveCaptures: 0,
    saveShareOfCaptures: null,
    unavailable: false,
  };
  try {
    const leadsResult = await pool.query<{ source: string | null; n: string }>(
      `SELECT source, COUNT(*)::bigint AS n
         FROM quiz_leads
        WHERE created_at >= NOW() - $1::interval
        GROUP BY source`,
      [interval],
    );
    let direct = 0;
    let save = 0;
    for (const row of leadsResult.rows) {
      const n = Number(row.n) || 0;
      if (row.source === "web_funnel_save") save += n;
      else direct += n;
    }
    const total = direct + save;
    emailGate = {
      directCaptures: direct,
      saveCaptures: save,
      saveShareOfCaptures: total > 0 ? save / total : null,
      unavailable: false,
    };
  } catch (err: any) {
    // Only swallow the "table does not exist" case (fresh dev DB) so the
    // dashboard still renders with just the modal metrics. Postgres reports
    // this as SQLSTATE 42P01 ("undefined_table"). Anything else (timeouts,
    // permission errors, syntax bugs) should bubble up so silent zeros
    // aren't misread as "no captures happened".
    const code = err?.code;
    const message = String(err?.message ?? "");
    const isMissingRelation =
      code === "42P01" || /relation .* does not exist/i.test(message);
    if (!isMissingRelation) throw err;
    emailGate = {
      directCaptures: 0,
      saveCaptures: 0,
      saveShareOfCaptures: null,
      unavailable: true,
    };
  }

  // Weekly time series: bucket events by the ISO week of their created_at,
  // restricted to the most recent 8 weeks (Monday..Sunday, inclusive of the
  // current in-progress week). We left-join against a generated 8-row series
  // so weeks with zero events still appear as explicit zero rows — otherwise
  // a quiet week would silently disappear from the dashboard and hide a
  // regression. date_trunc('week', ...) in Postgres uses ISO week semantics
  // (Monday-start). This always covers 8 weeks regardless of the dashboard
  // `windowDays` filter so the trend chart stays comparable across visits.
  const weeklyResult = await pool.query<{
    week_start: string;
    shown: string | number;
    submitted: string | number;
    dismissed: string | number;
  }>(
    `WITH weeks AS (
       SELECT (date_trunc('week', NOW())::date
                 - (n * INTERVAL '7 days'))::date AS week_start
         FROM generate_series(0, 7) AS n
     ),
     per_week AS (
       SELECT date_trunc('week', created_at)::date AS week_start,
              COUNT(*) FILTER (WHERE event = 'quiz_save_shown')::int     AS shown,
              COUNT(*) FILTER (WHERE event = 'quiz_save_submitted')::int AS submitted,
              COUNT(*) FILTER (WHERE event = 'quiz_save_dismissed')::int AS dismissed
         FROM quiz_save_events
        WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '7 weeks'
        GROUP BY 1
     )
     SELECT to_char(w.week_start, 'YYYY-MM-DD')   AS week_start,
            COALESCE(p.shown, 0)::int             AS shown,
            COALESCE(p.submitted, 0)::int         AS submitted,
            COALESCE(p.dismissed, 0)::int         AS dismissed
       FROM weeks w
       LEFT JOIN per_week p ON p.week_start = w.week_start
      ORDER BY w.week_start ASC`,
  );
  const weekly: WeeklyMetrics[] = weeklyResult.rows.map((row) => {
    const shown = Number(row.shown) || 0;
    const submitted = Number(row.submitted) || 0;
    const dismissed = Number(row.dismissed) || 0;
    return {
      weekStart: String(row.week_start),
      shown,
      submitted,
      dismissed,
      recoveryRate: shown > 0 ? submitted / shown : null,
    };
  });

  return { windowDays, totals, bySurface, emailGate, weekly };
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

function metricsCells(m: SurfaceMetrics): string {
  return `
    <td style="text-align:right">${fmtInt(m.shown)}</td>
    <td style="text-align:right">${fmtInt(m.submitted)}</td>
    <td style="text-align:right">${fmtInt(m.dismissed)}</td>
    <td style="text-align:right"><strong>${fmtPct(m.recoveryRate)}</strong></td>
  `;
}

function renderWeeklyChartSvg(weeks: WeeklyMetrics[]): string {
  // Compact inline SVG so the dashboard stays a single static HTML file (no
  // chart library, no JS). Two stacked bars per week (impressions + submitted)
  // plus a recovery-rate line on a secondary axis.
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
      const submittedTop = yBar(w.submitted);
      const baseY = padTop + innerH;
      return `
      <g>
        <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml(
          w.weekStart,
        )}: ${fmtInt(w.shown)} shown</title></rect>
        <rect x="${cx - barW / 2}" y="${submittedTop}" width="${barW}" height="${baseY - submittedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml(
          w.weekStart,
        )}: ${fmtInt(w.submitted)} submitted</title></rect>
      </g>`;
    })
    .join("");

  // Recovery-rate line: skip weeks where shown=0 (no rate). Draw segments
  // between consecutive weeks that both have a rate so a gap of inactivity
  // doesn't fake a "drop to 0%".
  const linePoints = weeks.map((w, i) => ({
    x: xCenter(i),
    y: yRate(w.recoveryRate),
    rate: w.recoveryRate,
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
        )}: ${fmtPct(p.rate)} recovery</title></circle>`,
    )
    .join("");

  // X-axis labels: short MM-DD so 8 of them fit comfortably.
  const xLabels = weeks
    .map((w, i) => {
      const short = w.weekStart.slice(5); // MM-DD
      return `<text x="${xCenter(i)}" y="${
        padTop + innerH + 18
      }" text-anchor="middle" font-size="10" fill="#666">${escapeHtml(short)}</text>`;
    })
    .join("");

  // Y-axis labels: counts on the left, percent on the right. Keep it light
  // — just min/mid/max ticks so the chart stays readable at this size.
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
  <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Weekly save-prompt impressions, submissions, and recovery rate" style="background:#fff;border:1px solid #e5e5e5;border-radius:10px">
    ${yTicks}
    ${bars}
    ${segments.join("")}
    ${dots}
    ${xLabels}
  </svg>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#555">
    <span><span style="display:inline-block;width:10px;height:10px;background:#cfe1f7;border-radius:2px;vertical-align:middle"></span> Shown</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#0a66c2;border-radius:2px;vertical-align:middle"></span> Submitted</span>
    <span><span style="display:inline-block;width:14px;height:2px;background:#d97706;vertical-align:middle"></span> Recovery rate</span>
  </div>`;
}

function renderWeeklyTable(weeks: WeeklyMetrics[]): string {
  const rows = weeks
    .map(
      (w) => `
      <tr>
        <td><code>${escapeHtml(w.weekStart)}</code></td>
        <td style="text-align:right">${fmtInt(w.shown)}</td>
        <td style="text-align:right">${fmtInt(w.submitted)}</td>
        <td style="text-align:right">${fmtInt(w.dismissed)}</td>
        <td style="text-align:right"><strong>${fmtPct(w.recoveryRate)}</strong></td>
      </tr>`,
    )
    .join("");
  return `
  <table>
    <thead>
      <tr>
        <th>Week starting (Mon)</th>
        <th style="text-align:right">Shown</th>
        <th style="text-align:right">Submitted</th>
        <th style="text-align:right">Dismissed</th>
        <th style="text-align:right">Recovery rate</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderQuizSaveAnalyticsHtml(data: QuizSaveAnalytics): string {
  const { totals, bySurface, emailGate, windowDays, weekly } = data;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quiz save-prompt analytics</title>
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
  <h1>Quiz save-prompt analytics</h1>
  <p>Last <strong>${windowDays}</strong> days. Recovery rate = submitted ÷ shown.</p>

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
  <p class="desc">Always covers the most recent 8 ISO weeks (Mon–Sun) regardless of the window above, so trends remain comparable as you change the filter. Bars use the left axis (counts); the line uses the right axis (recovery rate).</p>
  ${renderWeeklyChartSvg(weekly)}
  ${renderWeeklyTable(weekly)}

  <h2>Save-prompt funnel by surface</h2>
  <p class="desc">Mobile fires the same event names mid-quiz from <code>app/onboarding/quiz.tsx</code>; web fires them from <code>web/src/components/QuizSaveModal.tsx</code>.</p>
  <table>
    <thead>
      <tr><th>Surface</th><th style="text-align:right">Shown</th><th style="text-align:right">Submitted</th><th style="text-align:right">Dismissed</th><th style="text-align:right">Recovery rate</th></tr>
    </thead>
    <tbody>
      <tr><td>Web</td>${metricsCells(bySurface.web)}</tr>
      <tr><td>Mobile</td>${metricsCells(bySurface.mobile)}</tr>
      <tr><td><strong>Total</strong></td>${metricsCells(totals)}</tr>
    </tbody>
  </table>

  <h2>Email-gate captures (cannibalisation check)</h2>
  <p class="desc">
    Counts <code>quiz_leads</code> rows in the same window. A high "save share"
    with a falling direct count would suggest the soft prompt is stealing from
    the regular email gate; a steady direct count means it's incremental.
  </p>
  ${
    emailGate.unavailable
      ? `<p class="desc" style="color:#a35a00;background:#fff7e6;border:1px solid #ffd591;padding:8px 12px;border-radius:6px"><strong>Email-gate data unavailable.</strong> The <code>quiz_leads</code> table doesn't exist in this database yet — the zeros below are a placeholder, not a real measurement.</p>`
      : ""
  }
  <table>
    <thead>
      <tr><th>Source</th><th style="text-align:right">Captures</th><th style="text-align:right">Share of total</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Direct email gate (post-quiz)</td>
        <td style="text-align:right">${fmtInt(emailGate.directCaptures)}</td>
        <td style="text-align:right">${fmtPct(
          emailGate.directCaptures + emailGate.saveCaptures > 0
            ? emailGate.directCaptures /
              (emailGate.directCaptures + emailGate.saveCaptures)
            : null,
        )}</td>
      </tr>
      <tr>
        <td>Save-prompt (<code>web_funnel_save</code>)</td>
        <td style="text-align:right">${fmtInt(emailGate.saveCaptures)}</td>
        <td style="text-align:right">${fmtPct(emailGate.saveShareOfCaptures)}</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top:24px;color:#888;font-size:12px">
    JSON: <code>/api/admin/quiz-save-analytics?days=${windowDays}</code>
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

export function registerQuizSaveAnalyticsRoutes(
  app: Express,
  deps: {
    requireAdminBasicAuth: (req: Request, res: Response) => boolean;
    getPool: () => pg.Pool | null;
  },
): void {
  app.get("/api/admin/quiz-save-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeQuizSaveAnalytics(pool, {
        windowDays: readWindowDays(req),
      });
      res.json(data);
    } catch (err: any) {
      console.error("Quiz save analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute quiz save analytics" });
    } finally {
      await pool.end();
    }
  });

  app.get("/admin/quiz-save-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res
        .status(503)
        .type("text/html")
        .send(
          `<h1>Quiz save analytics unavailable</h1><p>Database is not configured (set <code>DATABASE_URL</code>).</p>`,
        );
      return;
    }
    try {
      const data = await computeQuizSaveAnalytics(pool, {
        windowDays: readWindowDays(req),
      });
      res.type("text/html").send(renderQuizSaveAnalyticsHtml(data));
    } catch (err: any) {
      console.error("Quiz save analytics HTML error:", err?.message);
      res
        .status(500)
        .type("text/html")
        .send(
          `<h1>Quiz save analytics unavailable</h1><pre>${escapeHtml(
            err?.message ?? "unknown",
          )}</pre>`,
        );
    } finally {
      await pool.end();
    }
  });
}
