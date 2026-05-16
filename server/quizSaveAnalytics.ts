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

// Placement attribution: events now carry `properties.placement` so we can
// distinguish the new post-result modal (`result_screen`) from the legacy
// mid-quiz one (`mid_quiz`). Rows persisted before this column existed have
// no placement and fall through to `unknown` so legacy data stays visible
// without being misattributed.
export const PLACEMENT_BUCKETS = [
  "mid_quiz",
  "result_screen",
  "unknown",
] as const;
export type Placement = (typeof PLACEMENT_BUCKETS)[number];

export function classifyPlacement(body: unknown): Placement {
  if (!body || typeof body !== "object") return "unknown";
  const props = (body as { properties?: unknown }).properties;
  const raw =
    props && typeof props === "object"
      ? (props as { placement?: unknown }).placement
      : undefined;
  if (typeof raw !== "string") return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "mid_quiz" || lower === "result_screen") return lower;
  return "unknown";
}

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
    ensureTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS quiz_save_events (
           id SERIAL PRIMARY KEY,
           event VARCHAR(40) NOT NULL,
           surface VARCHAR(16) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`,
      );
      // Migration: add the placement column for tables created before the
      // post-result modal split. Rows persisted before this migration ran
      // keep a NULL placement and surface in the dashboard as "unknown".
      await pool.query(
        `ALTER TABLE quiz_save_events ADD COLUMN IF NOT EXISTS placement VARCHAR(32)`,
      );
      // Lazy migration for the PostHog backfill (task #70): we tag rows
      // imported from PostHog with their upstream event uuid so re-running
      // the import is idempotent. Live writes from recordQuizSaveEvent
      // leave this NULL, so we scope the unique constraint with a partial
      // index — that way we never collide with the many in-app events
      // that legitimately have no upstream id.
      await pool.query(
        `ALTER TABLE quiz_save_events
           ADD COLUMN IF NOT EXISTS posthog_event_id VARCHAR(64)`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS quiz_save_events_posthog_uid_idx
           ON quiz_save_events (posthog_event_id)
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

export async function recordQuizSaveEvent(
  pool: pg.Pool,
  body: unknown,
): Promise<void> {
  if (!body || typeof body !== "object") return;
  const event = (body as { event?: unknown }).event;
  if (!isQuizSaveEventName(event)) return;
  const surface = classifySurface(body);
  const placement = classifyPlacement(body);
  const distinctId = (body as { distinct_id?: unknown }).distinct_id;
  await ensureQuizSaveEventsTable(pool);
  // Store the placement string verbatim when known; persist NULL for
  // "unknown" so legacy rows and new-but-untagged rows share the same
  // bucket when the analytics query coalesces missing values.
  await pool.query(
    `INSERT INTO quiz_save_events (event, surface, distinct_id, placement)
     VALUES ($1, $2, $3, $4)`,
    [
      event,
      surface,
      typeof distinctId === "string" ? distinctId : null,
      placement === "unknown" ? null : placement,
    ],
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

// Per-placement counts within a single week. Kept separate from
// `SurfaceMetrics` so the weekly shape stays a flat numeric record (easier
// for the SVG renderer and JSON consumers to walk).
export interface WeeklyPlacementMetrics {
  shown: number;
  submitted: number;
  dismissed: number;
  // submitted ÷ shown — null when shown is 0 so the UI can render "—".
  recoveryRate: number | null;
}

// Per-surface counts within a single week. Same shape as
// `WeeklyPlacementMetrics` — kept as a distinct alias so the intent at the
// call site stays obvious.
export interface WeeklySurfaceMetrics {
  shown: number;
  submitted: number;
  dismissed: number;
  // submitted ÷ shown — null when shown is 0 so the UI can render "—".
  recoveryRate: number | null;
}

export interface WeeklyMetrics {
  // Monday of the ISO week, formatted YYYY-MM-DD.
  weekStart: string;
  shown: number;
  submitted: number;
  dismissed: number;
  // submitted ÷ shown — null when shown is 0 so the UI can render "—".
  recoveryRate: number | null;
  // Per-placement breakdown so the dashboard can plot the new post-result
  // modal against the legacy mid-quiz one week over week. Every week always
  // includes all three placement buckets (zero-filled) so the chart can rely
  // on a consistent shape even for quiet weeks.
  byPlacement: Record<Placement, WeeklyPlacementMetrics>;
  // Per-surface breakdown so the dashboard can plot the web funnel and the
  // mobile onboarding quiz independently — surface-level trends often
  // diverge (e.g. a web copy change shouldn't be masked by mobile noise) and
  // blending them hides the attribution. Every week always includes both
  // surface buckets (zero-filled) so the small-multiples chart can rely on a
  // consistent shape even for quiet weeks.
  bySurface: Record<Surface, WeeklySurfaceMetrics>;
}

export interface QuizSaveAnalytics {
  windowDays: number;
  totals: SurfaceMetrics;
  bySurface: Record<Surface, SurfaceMetrics>;
  // Placement split so the new post-result modal's performance can be
  // compared against the legacy mid-quiz baseline without blending them.
  // `unknown` covers rows persisted before the placement column existed
  // (or events that arrived without a placement attribute).
  byPlacement: Record<Placement, SurfaceMetrics>;
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
    placement: string | null;
    n: string;
  }>(
    `SELECT event, surface, placement, COUNT(*)::bigint AS n
       FROM quiz_save_events
      WHERE created_at >= NOW() - $1::interval
      GROUP BY event, surface, placement`,
    [interval],
  );

  const allRows = eventsResult.rows.map((r) => ({ event: r.event, n: r.n }));
  const totals = metricsRow(allRows);
  const bySurface: Record<Surface, SurfaceMetrics> = {
    web: metricsRow(eventsResult.rows.filter((r) => r.surface === "web")),
    mobile: metricsRow(eventsResult.rows.filter((r) => r.surface !== "web")),
  };
  // Coalesce NULL / unrecognised placements into the `unknown` bucket so
  // legacy rows (column was nullable, no placement attribute on the event)
  // still appear in the dashboard rather than vanishing from the split.
  const normalisePlacement = (raw: string | null): Placement => {
    if (raw === "mid_quiz" || raw === "result_screen") return raw;
    return "unknown";
  };
  const byPlacement: Record<Placement, SurfaceMetrics> = {
    mid_quiz: metricsRow(
      eventsResult.rows.filter((r) => normalisePlacement(r.placement) === "mid_quiz"),
    ),
    result_screen: metricsRow(
      eventsResult.rows.filter(
        (r) => normalisePlacement(r.placement) === "result_screen",
      ),
    ),
    unknown: metricsRow(
      eventsResult.rows.filter((r) => normalisePlacement(r.placement) === "unknown"),
    ),
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
  // We also break each week down by placement so the dashboard can plot the
  // new post-result modal against the legacy mid-quiz one week over week.
  // The grid CROSS JOIN guarantees every (week, placement) cell exists even
  // when no events landed for that combination — otherwise a quiet bucket
  // would silently drop out of the series and break the small-multiples
  // chart alignment.
  const weeklyResult = await pool.query<{
    week_start: string;
    placement: string;
    surface: string;
    shown: string | number;
    submitted: string | number;
    dismissed: string | number;
  }>(
    `WITH weeks AS (
       SELECT (date_trunc('week', NOW())::date
                 - (n * INTERVAL '7 days'))::date AS week_start
         FROM generate_series(0, 7) AS n
     ),
     placements AS (
       SELECT unnest(ARRAY['mid_quiz', 'result_screen', 'unknown']) AS placement
     ),
     surfaces AS (
       SELECT unnest(ARRAY['web', 'mobile']) AS surface
     ),
     grid AS (
       SELECT w.week_start, pl.placement, s.surface
         FROM weeks w CROSS JOIN placements pl CROSS JOIN surfaces s
     ),
     per_week AS (
       -- Normalise unexpected placement values into 'unknown' so legacy
       -- or malformed strings still reconcile against the fixed grid
       -- placements above and don't silently drop out of the weekly
       -- totals. This mirrors normalisePlacement() in TypeScript.
       -- Similarly collapse any non-'web' surface into 'mobile' so the
       -- two grid buckets always reconcile (matches classifySurface()).
       SELECT date_trunc('week', created_at)::date AS week_start,
              CASE
                WHEN placement IN ('mid_quiz', 'result_screen') THEN placement
                ELSE 'unknown'
              END                                  AS placement,
              CASE WHEN surface = 'web' THEN 'web' ELSE 'mobile' END
                                                   AS surface,
              COUNT(*) FILTER (WHERE event = 'quiz_save_shown')::int     AS shown,
              COUNT(*) FILTER (WHERE event = 'quiz_save_submitted')::int AS submitted,
              COUNT(*) FILTER (WHERE event = 'quiz_save_dismissed')::int AS dismissed
         FROM quiz_save_events
        WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '7 weeks'
        GROUP BY 1, 2, 3
     )
     SELECT to_char(g.week_start, 'YYYY-MM-DD')   AS week_start,
            g.placement                            AS placement,
            g.surface                              AS surface,
            COALESCE(p.shown, 0)::int             AS shown,
            COALESCE(p.submitted, 0)::int         AS submitted,
            COALESCE(p.dismissed, 0)::int         AS dismissed
       FROM grid g
       LEFT JOIN per_week p
         ON p.week_start = g.week_start
        AND p.placement = g.placement
        AND p.surface = g.surface
      ORDER BY g.week_start ASC, g.surface ASC, g.placement ASC`,
  );

  const emptyPlacement = (): WeeklyPlacementMetrics => ({
    shown: 0,
    submitted: 0,
    dismissed: 0,
    recoveryRate: null,
  });
  const emptySurface = (): WeeklySurfaceMetrics => ({
    shown: 0,
    submitted: 0,
    dismissed: 0,
    recoveryRate: null,
  });
  // Per-placement counts accumulate across surfaces; per-surface counts
  // accumulate across placements. We keep raw running totals during the
  // walk and finalise `recoveryRate` once both sums are complete, so a
  // row-by-row update can't divide before the denominator is final.
  const weeklyMap = new Map<string, WeeklyMetrics>();
  const placementSums = new Map<string, Record<Placement, WeeklyPlacementMetrics>>();
  const surfaceSums = new Map<string, Record<Surface, WeeklySurfaceMetrics>>();
  for (const row of weeklyResult.rows) {
    const weekStart = String(row.week_start);
    const placement = normalisePlacement(
      typeof row.placement === "string" ? row.placement : null,
    );
    const surface: Surface =
      typeof row.surface === "string" && row.surface.toLowerCase() === "web"
        ? "web"
        : "mobile";
    const shown = Number(row.shown) || 0;
    const submitted = Number(row.submitted) || 0;
    const dismissed = Number(row.dismissed) || 0;
    let bucket = weeklyMap.get(weekStart);
    if (!bucket) {
      bucket = {
        weekStart,
        shown: 0,
        submitted: 0,
        dismissed: 0,
        recoveryRate: null,
        byPlacement: {
          mid_quiz: emptyPlacement(),
          result_screen: emptyPlacement(),
          unknown: emptyPlacement(),
        },
        bySurface: {
          web: emptySurface(),
          mobile: emptySurface(),
        },
      };
      weeklyMap.set(weekStart, bucket);
      placementSums.set(weekStart, {
        mid_quiz: emptyPlacement(),
        result_screen: emptyPlacement(),
        unknown: emptyPlacement(),
      });
      surfaceSums.set(weekStart, {
        web: emptySurface(),
        mobile: emptySurface(),
      });
    }
    const pSum = placementSums.get(weekStart)!;
    pSum[placement].shown += shown;
    pSum[placement].submitted += submitted;
    pSum[placement].dismissed += dismissed;
    const sSum = surfaceSums.get(weekStart)!;
    sSum[surface].shown += shown;
    sSum[surface].submitted += submitted;
    sSum[surface].dismissed += dismissed;
    bucket.shown += shown;
    bucket.submitted += submitted;
    bucket.dismissed += dismissed;
  }
  const finaliseRate = <T extends { shown: number; submitted: number }>(
    m: T,
  ): T & { recoveryRate: number | null } => ({
    ...m,
    recoveryRate: m.shown > 0 ? m.submitted / m.shown : null,
  });
  const weekly: WeeklyMetrics[] = Array.from(weeklyMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => {
      const pSum = placementSums.get(w.weekStart)!;
      const sSum = surfaceSums.get(w.weekStart)!;
      return {
        ...w,
        recoveryRate: w.shown > 0 ? w.submitted / w.shown : null,
        byPlacement: {
          mid_quiz: finaliseRate(pSum.mid_quiz),
          result_screen: finaliseRate(pSum.result_screen),
          unknown: finaliseRate(pSum.unknown),
        },
        bySurface: {
          web: finaliseRate(sSum.web),
          mobile: finaliseRate(sSum.mobile),
        },
      };
    });

  return { windowDays, totals, bySurface, byPlacement, emailGate, weekly };
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

  // Recovery-rate lines: one per placement plus the combined total, so the
  // new post-result modal can be visually compared against the legacy
  // mid-quiz prompt week over week. Each series skips weeks where shown=0
  // (no rate) and only draws segments between consecutive weeks that both
  // have a rate so a gap of inactivity doesn't fake a "drop to 0%".
  const RATE_SERIES: Array<{
    key: "total" | Placement;
    label: string;
    color: string;
    get: (w: WeeklyMetrics) => number | null;
    radius: number;
    strokeWidth: number;
  }> = [
    {
      key: "total",
      label: "All placements",
      color: "#d97706",
      get: (w) => w.recoveryRate,
      radius: 3.5,
      strokeWidth: 2,
    },
    {
      key: "mid_quiz",
      label: PLACEMENT_LABELS.mid_quiz,
      color: "#0a66c2",
      get: (w) => w.byPlacement.mid_quiz.recoveryRate,
      radius: 3,
      strokeWidth: 1.5,
    },
    {
      key: "result_screen",
      label: PLACEMENT_LABELS.result_screen,
      color: "#138a52",
      get: (w) => w.byPlacement.result_screen.recoveryRate,
      radius: 3,
      strokeWidth: 1.5,
    },
  ];
  const seriesSvg = RATE_SERIES.map((series) => {
    const points = weeks.map((w, i) => ({
      x: xCenter(i),
      y: yRate(series.get(w)),
      rate: series.get(w),
      weekStart: w.weekStart,
    }));
    const segs: string[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a.y !== null && b.y !== null) {
        segs.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${series.color}" stroke-width="${series.strokeWidth}" />`,
        );
      }
    }
    const dotMarks = points
      .filter((p) => p.y !== null)
      .map(
        (p) =>
          `<circle cx="${p.x}" cy="${p.y}" r="${series.radius}" fill="${
            series.color
          }"><title>${escapeHtml(p.weekStart)} — ${escapeHtml(series.label)}: ${fmtPct(
            p.rate,
          )} recovery</title></circle>`,
      )
      .join("");
    return `<g>${segs.join("")}${dotMarks}</g>`;
  }).join("");

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

  const placementLegend = RATE_SERIES.filter((s) => s.key !== "total")
    .map(
      (s) =>
        `<span><span style="display:inline-block;width:14px;height:2px;background:${s.color};vertical-align:middle"></span> ${escapeHtml(
          s.label,
        )} recovery</span>`,
    )
    .join("");
  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Weekly save-prompt impressions, submissions, and recovery rate split by placement" style="background:#fff;border:1px solid #e5e5e5;border-radius:10px">
    ${yTicks}
    ${bars}
    ${seriesSvg}
    ${xLabels}
  </svg>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#555">
    <span><span style="display:inline-block;width:10px;height:10px;background:#cfe1f7;border-radius:2px;vertical-align:middle"></span> Shown</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#0a66c2;border-radius:2px;vertical-align:middle"></span> Submitted</span>
    <span><span style="display:inline-block;width:14px;height:2px;background:#d97706;vertical-align:middle"></span> Overall recovery rate</span>
    ${placementLegend}
  </div>`;
}

const SURFACE_LABELS: Record<Surface, string> = {
  web: "Web funnel",
  mobile: "Mobile quiz",
};

// Compact per-surface trend chart. Renders the same shown/submitted bars
// plus a recovery-rate line, but scoped to a single surface so the
// dashboard can show web and mobile side-by-side as small multiples. Each
// chart is independently scaled so a quiet surface still reads — surface
// trends are compared by shape week-over-week, not by absolute height
// against the other surface.
function renderWeeklySurfaceChartSvg(
  weeks: WeeklyMetrics[],
  surface: Surface,
): string {
  const width = 360;
  const height = 160;
  const padLeft = 36;
  const padRight = 36;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const n = weeks.length;
  const series = weeks.map((w) => w.bySurface[surface]);
  const maxShown = Math.max(1, ...series.map((s) => s.shown));
  const slot = innerW / Math.max(n, 1);
  const barW = Math.max(4, Math.min(18, slot * 0.55));
  const yBar = (v: number) => padTop + innerH - (v / maxShown) * innerH;
  const xCenter = (i: number) => padLeft + slot * (i + 0.5);
  const yRate = (r: number | null) =>
    r === null ? null : padTop + innerH - r * innerH;

  const bars = weeks
    .map((w, i) => {
      const s = w.bySurface[surface];
      const cx = xCenter(i);
      const shownTop = yBar(s.shown);
      const submittedTop = yBar(s.submitted);
      const baseY = padTop + innerH;
      return `
        <g>
          <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml(
            w.weekStart,
          )} (${escapeHtml(SURFACE_LABELS[surface])}): ${fmtInt(s.shown)} shown</title></rect>
          <rect x="${cx - barW / 2}" y="${submittedTop}" width="${barW}" height="${baseY - submittedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml(
            w.weekStart,
          )} (${escapeHtml(SURFACE_LABELS[surface])}): ${fmtInt(s.submitted)} submitted</title></rect>
        </g>`;
    })
    .join("");

  const points = weeks.map((w, i) => ({
    x: xCenter(i),
    y: yRate(w.bySurface[surface].recoveryRate),
    rate: w.bySurface[surface].recoveryRate,
    weekStart: w.weekStart,
  }));
  const segs: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.y !== null && b.y !== null) {
      segs.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d97706" stroke-width="1.75" />`,
      );
    }
  }
  const dots = points
    .filter((p) => p.y !== null)
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#d97706"><title>${escapeHtml(
          p.weekStart,
        )} — ${escapeHtml(SURFACE_LABELS[surface])}: ${fmtPct(p.rate)} recovery</title></circle>`,
    )
    .join("");

  const xLabels = weeks
    .map((w, i) => {
      const short = w.weekStart.slice(5);
      return `<text x="${xCenter(i)}" y="${padTop + innerH + 14}" text-anchor="middle" font-size="9" fill="#666">${escapeHtml(short)}</text>`;
    })
    .join("");
  const yTicks = [0, 0.5, 1]
    .map((frac) => {
      const y = padTop + innerH - frac * innerH;
      const count = Math.round(maxShown * frac);
      const pct = `${Math.round(frac * 100)}%`;
      return `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + innerW}" y2="${y}" stroke="#eee" stroke-width="1" />
        <text x="${padLeft - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#666">${fmtInt(count)}</text>
        <text x="${padLeft + innerW + 4}" y="${y + 3}" text-anchor="start" font-size="9" fill="#d97706">${pct}</text>`;
    })
    .join("");

  return `
    <figure style="margin:0;flex:1 1 320px;min-width:280px">
      <figcaption style="font-size:12px;font-weight:600;color:#333;margin-bottom:4px">${escapeHtml(SURFACE_LABELS[surface])}</figcaption>
      <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeHtml(SURFACE_LABELS[surface])} weekly save-prompt impressions, submissions, and recovery rate" style="background:#fff;border:1px solid #e5e5e5;border-radius:10px">
        ${yTicks}
        ${bars}
        <g>${segs.join("")}${dots}</g>
        ${xLabels}
      </svg>
    </figure>`;
}

function renderWeeklySurfaceCharts(weeks: WeeklyMetrics[]): string {
  return `
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">
    ${renderWeeklySurfaceChartSvg(weeks, "web")}
    ${renderWeeklySurfaceChartSvg(weeks, "mobile")}
  </div>`;
}

function renderWeeklyTable(weeks: WeeklyMetrics[]): string {
  // We render the per-placement recovery rates alongside the combined
  // totals so the dashboard reader can see the new post-result modal trend
  // numerically (small multiples) without leaving the chart context.
  const rows = weeks
    .map(
      (w) => `
      <tr>
        <td><code>${escapeHtml(w.weekStart)}</code></td>
        <td style="text-align:right">${fmtInt(w.shown)}</td>
        <td style="text-align:right">${fmtInt(w.submitted)}</td>
        <td style="text-align:right">${fmtInt(w.dismissed)}</td>
        <td style="text-align:right"><strong>${fmtPct(w.recoveryRate)}</strong></td>
        <td style="text-align:right">${fmtPct(
          w.byPlacement.mid_quiz.recoveryRate,
        )} <span style="color:#888">(${fmtInt(
          w.byPlacement.mid_quiz.submitted,
        )}/${fmtInt(w.byPlacement.mid_quiz.shown)})</span></td>
        <td style="text-align:right">${fmtPct(
          w.byPlacement.result_screen.recoveryRate,
        )} <span style="color:#888">(${fmtInt(
          w.byPlacement.result_screen.submitted,
        )}/${fmtInt(w.byPlacement.result_screen.shown)})</span></td>
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
        <th style="text-align:right">${escapeHtml(PLACEMENT_LABELS.mid_quiz)} recovery</th>
        <th style="text-align:right">${escapeHtml(PLACEMENT_LABELS.result_screen)} recovery</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const PLACEMENT_LABELS: Record<Placement, string> = {
  mid_quiz: "Mid-quiz (legacy)",
  result_screen: "Result screen (new)",
  unknown: "Unknown / pre-migration",
};

export interface QuizSaveBackfillBanner {
  fetched: number;
  inserted: number;
  skipped: number;
}

export function renderQuizSaveAnalyticsHtml(
  data: QuizSaveAnalytics,
  banner: QuizSaveBackfillBanner | null = null,
): string {
  const { totals, bySurface, byPlacement, emailGate, windowDays, weekly } = data;
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
  ${bannerHtml}
  <details style="margin:12px 0 16px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:10px 14px;">
    <summary style="cursor:pointer;font-weight:600;">Backfill from PostHog</summary>
    <p style="color:#555;font-size:13px;margin-top:8px">
      Imports historical <code>quiz_save_shown</code>,
      <code>quiz_save_submitted</code>, and <code>quiz_save_dismissed</code>
      events from PostHog into the local <code>quiz_save_events</code> table,
      preserving the original timestamps and surface/placement attribution.
      Idempotent — events already imported (matched by upstream uuid) are
      skipped, not duplicated. Leave "since" blank to pull the full history.
      Requires <code>POSTHOG_PROJECT_ID</code> and
      <code>POSTHOG_PERSONAL_API_KEY</code> to be set on the server.
    </p>
    <form method="post" action="/api/admin/quiz-save-analytics/backfill" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:12px;color:#555;">
        Since (optional, ISO date):
        <input type="text" name="since" placeholder="2026-01-01" style="padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font:inherit;" />
      </label>
      <button type="submit" style="padding:6px 14px;background:#0a66c2;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;">
        Run backfill
      </button>
    </form>
  </details>
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

  <h2>Weekly trend (last 8 weeks) <a href="/api/admin/quiz-save-analytics.csv" style="font-size:12px;font-weight:normal;margin-left:8px;color:#0a66c2;text-decoration:none">Download CSV</a></h2>
  <p class="desc">Always covers the most recent 8 ISO weeks (Mon–Sun) regardless of the window above, so trends remain comparable as you change the filter. Bars use the left axis (counts); the lines use the right axis (recovery rate). The orange line is the combined rate; the blue and green lines split it by placement so the new post-result modal can be compared against the legacy mid-quiz prompt over time.</p>
  ${renderWeeklyChartSvg(weekly)}

  <h2>Weekly trend by surface</h2>
  <p class="desc">Same 8-week window, split into web and mobile so a surface-specific change (e.g. a web copy edit) isn't masked by movement on the other surface. Each chart is scaled independently; compare shapes week-over-week, not absolute heights between charts.</p>
  ${renderWeeklySurfaceCharts(weekly)}

  ${renderWeeklyTable(weekly)}

  <h2>Save-prompt funnel by placement</h2>
  <p class="desc">
    Mobile fires <code>placement: "result_screen"</code> from the new
    post-result modal in <code>src/components/QuizSaveModal.tsx</code>; web
    still fires <code>placement: "mid_quiz"</code> from
    <code>web/src/components/QuizSaveModal.tsx</code>. Rows persisted before
    this column existed have a NULL placement and appear under
    <em>Unknown / pre-migration</em>.
  </p>
  <table>
    <thead>
      <tr><th>Placement</th><th style="text-align:right">Shown</th><th style="text-align:right">Submitted</th><th style="text-align:right">Dismissed</th><th style="text-align:right">Recovery rate</th></tr>
    </thead>
    <tbody>
      <tr><td>${escapeHtml(PLACEMENT_LABELS.mid_quiz)}</td>${metricsCells(byPlacement.mid_quiz)}</tr>
      <tr><td>${escapeHtml(PLACEMENT_LABELS.result_screen)}</td>${metricsCells(byPlacement.result_screen)}</tr>
      <tr><td>${escapeHtml(PLACEMENT_LABELS.unknown)}</td>${metricsCells(byPlacement.unknown)}</tr>
      <tr><td><strong>Total</strong></td>${metricsCells(totals)}</tr>
    </tbody>
  </table>

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

// CSV escape: quote any field containing a comma, quote, or newline, and
// double any embedded quotes. Kept inline so the analytics module has no
// new dependencies for a one-off export route.
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "number" ? String(value) : value;
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Round to 4 decimal places for spreadsheet-friendly recovery rates while
// keeping enough precision to distinguish small differences (0.0123 vs
// 0.0124). Empty when the rate is null so a quiet week renders blank
// rather than as "0" in the spreadsheet.
function csvRate(rate: number | null): string {
  if (rate === null) return "";
  return rate.toFixed(4);
}

export function renderQuizSaveAnalyticsWeeklyCsv(
  weeks: WeeklyMetrics[],
): string {
  const header = [
    "week_start",
    "shown",
    "submitted",
    "dismissed",
    "recovery_rate",
    "mid_quiz_shown",
    "mid_quiz_submitted",
    "mid_quiz_recovery_rate",
    "result_screen_shown",
    "result_screen_submitted",
    "result_screen_recovery_rate",
    "unknown_shown",
    "unknown_submitted",
    "unknown_recovery_rate",
  ];
  const lines = [header.join(",")];
  for (const w of weeks) {
    lines.push(
      [
        csvCell(w.weekStart),
        csvCell(w.shown),
        csvCell(w.submitted),
        csvCell(w.dismissed),
        csvRate(w.recoveryRate),
        csvCell(w.byPlacement.mid_quiz.shown),
        csvCell(w.byPlacement.mid_quiz.submitted),
        csvRate(w.byPlacement.mid_quiz.recoveryRate),
        csvCell(w.byPlacement.result_screen.shown),
        csvCell(w.byPlacement.result_screen.submitted),
        csvRate(w.byPlacement.result_screen.recoveryRate),
        csvCell(w.byPlacement.unknown.shown),
        csvCell(w.byPlacement.unknown.submitted),
        csvRate(w.byPlacement.unknown.recoveryRate),
      ].join(","),
    );
  }
  // Trailing newline keeps the file POSIX-friendly for spreadsheet importers.
  return `${lines.join("\n")}\n`;
}

function readWindowDays(req: Request): number {
  const raw = req.query.days;
  if (typeof raw !== "string") return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, n);
}

// ── PostHog backfill (task #70) ──────────────────────────────────────────
//
// The `quiz_save_events` table only sees events that arrive after it was
// first created. Anything fired before that — or anything that failed to
// persist locally — lives only upstream in PostHog (the analytics store
// the `/api/analytics` proxy forwards to). This backfill walks the PostHog
// HogQL API for all three save-prompt events and inserts them into the
// local table, preserving the original `timestamp` as `created_at` and
// the original surface / placement attribution.
//
// Idempotency is enforced via the `posthog_event_id` column + partial
// unique index added by ensureQuizSaveEventsTable — duplicate runs hit
// ON CONFLICT DO NOTHING and report `skipped` in the summary.

export interface QuizSavePostHogBackfillOptions {
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

export interface QuizSavePostHogBackfillSummary {
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

// HogQL query: project the seven fields we need, ordered by timestamp
// (then uuid as a stable tiebreaker) so OFFSET pagination is deterministic
// even when many events share the same millisecond. Surface and placement
// both live under `properties.*` in PostHog (the mobile client stamps
// `platform` and `surface`; the web client stamps `surface`).
function buildHogQLQuery(since: string | null, limit: number, offset: number): string {
  const sinceClause = since
    ? ` AND timestamp >= toDateTime('${since.replace(/'/g, "")}')`
    : "";
  return (
    `SELECT uuid, event, timestamp, ` +
    `properties.surface AS surface, ` +
    `properties.platform AS platform, ` +
    `properties.placement AS placement, ` +
    `distinct_id ` +
    `FROM events ` +
    `WHERE event IN ('quiz_save_shown', 'quiz_save_submitted', 'quiz_save_dismissed')${sinceClause} ` +
    `ORDER BY timestamp ASC, uuid ASC ` +
    `LIMIT ${limit} OFFSET ${offset}`
  );
}

function classifySurfaceFromRow(
  surfaceRaw: unknown,
  platformRaw: unknown,
): Surface {
  // Mirror classifySurface(): explicit "web" wins on either field, anything
  // else collapses to "mobile".
  if (typeof surfaceRaw === "string" && surfaceRaw.toLowerCase() === "web") {
    return "web";
  }
  if (typeof platformRaw === "string" && platformRaw.toLowerCase() === "web") {
    return "web";
  }
  return "mobile";
}

function classifyPlacementFromRow(placementRaw: unknown): Placement {
  if (typeof placementRaw !== "string") return "unknown";
  const lower = placementRaw.toLowerCase();
  if (lower === "mid_quiz" || lower === "result_screen") return lower;
  return "unknown";
}

export async function backfillQuizSaveEventsFromPostHog(
  pool: pg.Pool,
  options: QuizSavePostHogBackfillOptions = {},
): Promise<QuizSavePostHogBackfillSummary> {
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

  await ensureQuizSaveEventsTable(pool);

  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(
    projectId,
  )}/query/`;

  const summary: QuizSavePostHogBackfillSummary = {
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
      const [
        uuidRaw,
        eventRaw,
        timestampRaw,
        surfaceRaw,
        platformRaw,
        placementRaw,
        distinctIdRaw,
      ] = row;
      if (typeof uuidRaw !== "string" || uuidRaw.length === 0) continue;
      if (!isQuizSaveEventName(eventRaw)) continue;
      // PostHog returns timestamps as ISO strings; normalize to Date so pg
      // casts on insert and preserves the original event time.
      const tsDate =
        typeof timestampRaw === "string" || typeof timestampRaw === "number"
          ? new Date(timestampRaw)
          : timestampRaw instanceof Date
            ? timestampRaw
            : null;
      if (!tsDate || Number.isNaN(tsDate.getTime())) continue;
      const surface = classifySurfaceFromRow(surfaceRaw, platformRaw);
      const placement = classifyPlacementFromRow(placementRaw);
      const distinctId =
        typeof distinctIdRaw === "string" && distinctIdRaw.length > 0
          ? distinctIdRaw.slice(0, 255)
          : null;
      const uuid = uuidRaw.slice(0, 64);

      const ins = await pool.query<{ id: number }>(
        `INSERT INTO quiz_save_events
           (event, surface, distinct_id, placement, created_at, posthog_event_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (posthog_event_id)
           WHERE posthog_event_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          eventRaw,
          surface,
          distinctId,
          placement === "unknown" ? null : placement,
          tsDate,
          uuid,
        ],
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

  return summary;
}

export function registerQuizSaveAnalyticsRoutes(
  app: Express,
  deps: {
    requireAdminBasicAuth: (req: Request, res: Response) => boolean;
    getPool: () => pg.Pool | null;
  },
): void {
  app.get("/api/admin/quiz-save-analytics.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured");
      return;
    }
    try {
      const data = await computeQuizSaveAnalytics(pool, {
        windowDays: readWindowDays(req),
      });
      const csv = renderQuizSaveAnalyticsWeeklyCsv(data.weekly);
      // Suggest a dated filename so repeated downloads don't collide in the
      // user's Downloads folder. Date is derived from the most recent week
      // start when available, otherwise today's UTC date.
      const stamp =
        data.weekly.length > 0
          ? data.weekly[data.weekly.length - 1].weekStart
          : new Date().toISOString().slice(0, 10);
      res
        .type("text/csv; charset=utf-8")
        .set(
          "Content-Disposition",
          `attachment; filename="quiz-save-weekly-${stamp}.csv"`,
        )
        .send(csv);
    } catch (err: any) {
      console.error("Quiz save analytics CSV error:", err?.message);
      res.status(500).type("text/plain").send("Failed to compute CSV");
    } finally {
      await pool.end();
    }
  });

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

  app.post("/api/admin/quiz-save-analytics/backfill", async (req, res) => {
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
    // Validate the `since` value before forwarding it to HogQL. The query is
    // string-interpolated (HogQL doesn't bind parameters the way Postgres
    // does), so we keep operator typos from producing a confusing upstream
    // 400 — and harden the surface against accidental injection — by
    // requiring an ISO-8601 prefix (date or full timestamp).
    if (since !== null && !/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(since)) {
      res.status(400).json({
        error: `Invalid 'since' value: expected YYYY-MM-DD or ISO-8601 timestamp, got ${since}`,
      });
      await pool.end();
      return;
    }
    try {
      const summary = await backfillQuizSaveEventsFromPostHog(pool, { since });
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
        res.redirect(`/admin/quiz-save-analytics?${params.toString()}`);
        return;
      }
      res.json(summary);
    } catch (err: any) {
      console.error("Quiz-save backfill error:", err?.message);
      const status = err instanceof PostHogBackfillConfigError ? 400 : 500;
      res.status(status).json({
        error: err?.message ?? "Failed to backfill quiz-save events",
      });
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
      res.type("text/html").send(renderQuizSaveAnalyticsHtml(data, banner));
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
