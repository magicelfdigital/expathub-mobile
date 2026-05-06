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

export interface QuizSaveAnalytics {
  windowDays: number;
  totals: SurfaceMetrics;
  bySurface: Record<Surface, SurfaceMetrics>;
  emailGate: EmailGateMetrics;
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

  return { windowDays, totals, bySurface, emailGate };
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

export function renderQuizSaveAnalyticsHtml(data: QuizSaveAnalytics): string {
  const { totals, bySurface, emailGate, windowDays } = data;
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
