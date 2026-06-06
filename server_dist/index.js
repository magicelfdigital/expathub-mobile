var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/quizSaveBackfillScheduler.ts
var quizSaveBackfillScheduler_exports = {};
__export(quizSaveBackfillScheduler_exports, {
  DEFAULT_BACKFILL_INITIAL_DELAY_MS: () => DEFAULT_BACKFILL_INITIAL_DELAY_MS,
  DEFAULT_BACKFILL_INTERVAL_MS: () => DEFAULT_BACKFILL_INTERVAL_MS,
  DEFAULT_BACKFILL_WINDOW_DAYS: () => DEFAULT_BACKFILL_WINDOW_DAYS,
  ensureQuizSaveBackfillRunsTable: () => ensureQuizSaveBackfillRunsTable,
  getLatestQuizSaveBackfillRun: () => getLatestQuizSaveBackfillRun,
  recordQuizSaveBackfillRun: () => recordQuizSaveBackfillRun,
  resetQuizSaveBackfillRunsEnsureCache: () => resetQuizSaveBackfillRunsEnsureCache,
  startQuizSaveBackfillSchedule: () => startQuizSaveBackfillSchedule
});
function resetQuizSaveBackfillRunsEnsureCache() {
  ensureRunsTablePromise = null;
}
async function ensureQuizSaveBackfillRunsTable(pool) {
  if (!ensureRunsTablePromise) {
    ensureRunsTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS quiz_save_backfill_runs (
           id SERIAL PRIMARY KEY,
           ran_at TIMESTAMPTZ NOT NULL,
           duration_ms INTEGER NOT NULL DEFAULT 0,
           fetched INTEGER NOT NULL DEFAULT 0,
           inserted INTEGER NOT NULL DEFAULT 0,
           skipped INTEGER NOT NULL DEFAULT 0,
           pages INTEGER NOT NULL DEFAULT 0,
           since_value TEXT,
           error TEXT
         )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS quiz_save_backfill_runs_ran_at_idx
           ON quiz_save_backfill_runs (ran_at DESC)`
      );
    })().catch((err) => {
      ensureRunsTablePromise = null;
      throw err;
    });
  }
  await ensureRunsTablePromise;
}
async function recordQuizSaveBackfillRun(pool, run) {
  await ensureQuizSaveBackfillRunsTable(pool);
  await pool.query(
    `INSERT INTO quiz_save_backfill_runs
       (ran_at, duration_ms, fetched, inserted, skipped, pages, since_value, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      run.ranAt,
      run.durationMs,
      run.summary?.fetched ?? 0,
      run.summary?.inserted ?? 0,
      run.summary?.skipped ?? 0,
      run.summary?.pages ?? 0,
      run.since,
      run.error
    ]
  );
}
async function getLatestQuizSaveBackfillRun(pool) {
  await ensureQuizSaveBackfillRunsTable(pool);
  const result = await pool.query(
    `SELECT ran_at, duration_ms, fetched, inserted, skipped, pages,
            since_value, error
       FROM quiz_save_backfill_runs
      ORDER BY ran_at DESC
      LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  const ranAt = row.ran_at instanceof Date ? row.ran_at.toISOString() : String(row.ran_at);
  return {
    ranAt,
    durationMs: Number(row.duration_ms) || 0,
    fetched: Number(row.fetched) || 0,
    inserted: Number(row.inserted) || 0,
    skipped: Number(row.skipped) || 0,
    pages: Number(row.pages) || 0,
    since: row.since_value,
    error: row.error
  };
}
function isoNow(now) {
  return now().toISOString();
}
function formatSince(now, windowDays) {
  const ms = now().getTime() - windowDays * 24 * 60 * 60 * 1e3;
  return new Date(ms).toISOString();
}
function startQuizSaveBackfillSchedule(options) {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_BACKFILL_INITIAL_DELAY_MS;
  const windowDays = Math.max(
    1,
    options.windowDays ?? DEFAULT_BACKFILL_WINDOW_DAYS
  );
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const setTimeoutFn = options.setTimeoutImpl ?? setTimeout;
  const setIntervalFn = options.setIntervalImpl ?? setInterval;
  const clearTimeoutFn = options.clearTimeoutImpl ?? clearTimeout;
  const clearIntervalFn = options.clearIntervalImpl ?? clearInterval;
  const runBackfill = options.backfillImpl ?? backfillQuizSaveEventsFromPostHog;
  let lastResult = null;
  let stopped = false;
  let initialTimer = null;
  let intervalTimer = null;
  async function persistResult(result, since, pool) {
    try {
      await ensureQuizSaveEventsTable(pool);
      await recordQuizSaveBackfillRun(pool, { ...result, since });
    } catch (err) {
      console.error(
        `[quiz-save-backfill] failed to persist run record: ${err?.message ?? err}`
      );
    }
  }
  async function runOnce() {
    const ranAt = isoNow(now);
    const started = now().getTime();
    const pool = options.getPool();
    if (!pool) {
      const result = {
        ranAt,
        durationMs: 0,
        summary: null,
        error: "Database not configured (DATABASE_URL missing)"
      };
      console.warn(
        "[quiz-save-backfill] skipped scheduled run \u2014 DATABASE_URL not set"
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    }
    const since = formatSince(now, windowDays);
    try {
      const summary = await runBackfill(pool, { since });
      const durationMs = now().getTime() - started;
      const result = {
        ranAt,
        durationMs,
        summary,
        error: null
      };
      console.log(
        `[quiz-save-backfill] scheduled run ok \u2014 since=${since} fetched=${summary.fetched} inserted=${summary.inserted} skipped=${summary.skipped} pages=${summary.pages} duration=${durationMs}ms`
      );
      lastResult = result;
      await persistResult(result, since, pool);
      options.onResult?.(result);
      return result;
    } catch (err) {
      const durationMs = now().getTime() - started;
      const message = err instanceof PostHogBackfillConfigError ? `config error: ${err.message}` : err?.message ?? String(err);
      const result = {
        ranAt,
        durationMs,
        summary: null,
        error: message
      };
      console.error(
        `[quiz-save-backfill] scheduled run FAILED \u2014 since=${since} duration=${durationMs}ms error="${message}"`
      );
      lastResult = result;
      await persistResult(result, since, pool);
      options.onResult?.(result);
      return result;
    } finally {
      try {
        await pool.end();
      } catch {
      }
    }
  }
  initialTimer = setTimeoutFn(() => {
    initialTimer = null;
    if (stopped) return;
    void runOnce();
  }, initialDelayMs);
  initialTimer?.unref?.();
  intervalTimer = setIntervalFn(() => {
    if (stopped) return;
    void runOnce();
  }, intervalMs);
  intervalTimer?.unref?.();
  return {
    stop: () => {
      stopped = true;
      if (initialTimer) clearTimeoutFn(initialTimer);
      if (intervalTimer) clearIntervalFn(intervalTimer);
      initialTimer = null;
      intervalTimer = null;
    },
    runNow: runOnce,
    getLastResult: () => lastResult
  };
}
var DEFAULT_BACKFILL_INTERVAL_MS, DEFAULT_BACKFILL_WINDOW_DAYS, DEFAULT_BACKFILL_INITIAL_DELAY_MS, ensureRunsTablePromise;
var init_quizSaveBackfillScheduler = __esm({
  "server/quizSaveBackfillScheduler.ts"() {
    "use strict";
    init_quizSaveAnalytics();
    DEFAULT_BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1e3;
    DEFAULT_BACKFILL_WINDOW_DAYS = 7;
    DEFAULT_BACKFILL_INITIAL_DELAY_MS = 60 * 1e3;
    ensureRunsTablePromise = null;
  }
});

// server/quizSavePromptHealth.ts
var quizSavePromptHealth_exports = {};
__export(quizSavePromptHealth_exports, {
  QUIZ_SAVE_PROMPT_HEALTH_CONFIG: () => QUIZ_SAVE_PROMPT_HEALTH_CONFIG,
  computeQuizSavePromptHealth: () => computeQuizSavePromptHealth,
  evaluateQuizSavePromptHealth: () => evaluateQuizSavePromptHealth,
  unavailableQuizSavePromptHealthSnapshot: () => unavailableQuizSavePromptHealthSnapshot
});
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function evaluateQuizSavePromptHealth(series, config = QUIZ_SAVE_PROMPT_HEALTH_CONFIG) {
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const base = {
    placement: config.placement,
    config,
    generated_at: generatedAt
  };
  if (series.length === 0) {
    return {
      ...base,
      healthy: true,
      reason: "insufficient_baseline",
      evaluated_day: { date: null, shown: 0 },
      trailing: { days: 0, median: 0, floor: 0, counts: [] }
    };
  }
  const evaluated = series[series.length - 1];
  const trailing = series.slice(0, series.length - 1);
  const trailingCounts = trailing.map((d) => d.shown);
  const trailingMedian = median(trailingCounts);
  const floor = trailingMedian * config.floorRatio;
  const trailingBlock = {
    days: trailing.length,
    median: trailingMedian,
    floor,
    counts: trailing
  };
  const evaluatedBlock = { date: evaluated.date, shown: evaluated.shown };
  if (trailing.length === 0 || trailingMedian === 0) {
    return {
      ...base,
      healthy: true,
      reason: "insufficient_baseline",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock
    };
  }
  if (evaluated.shown === 0) {
    return {
      ...base,
      healthy: false,
      reason: "zero_today",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock
    };
  }
  if (evaluated.shown < floor) {
    return {
      ...base,
      healthy: false,
      reason: "below_median_floor",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock
    };
  }
  return {
    ...base,
    healthy: true,
    reason: "ok",
    evaluated_day: evaluatedBlock,
    trailing: trailingBlock
  };
}
function unavailableQuizSavePromptHealthSnapshot(config = QUIZ_SAVE_PROMPT_HEALTH_CONFIG) {
  return {
    healthy: false,
    reason: "probe_unavailable",
    placement: config.placement,
    evaluated_day: { date: null, shown: 0 },
    trailing: { days: 0, median: 0, floor: 0, counts: [] },
    config,
    generated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function computeQuizSavePromptHealth(pool, config = QUIZ_SAVE_PROMPT_HEALTH_CONFIG) {
  await ensureQuizSaveEventsTable(pool);
  const totalDays = Math.max(2, Math.floor(config.trailingDays) + 1);
  const result = await pool.query(
    `WITH days AS (
       SELECT (CURRENT_DATE - (g.n || ' days')::interval)::date AS day
         FROM generate_series(1, $1::int) AS g(n)
     ),
     counts AS (
       SELECT created_at::date AS day, COUNT(*)::int AS shown
         FROM quiz_save_events
        WHERE event = 'quiz_save_shown'
          AND placement = $2
          AND created_at >= CURRENT_DATE - ($1::int || ' days')::interval
          AND created_at < CURRENT_DATE
        GROUP BY 1
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(c.shown, 0)::int   AS shown
       FROM days d
       LEFT JOIN counts c ON c.day = d.day
      ORDER BY d.day ASC`,
    [totalDays, config.placement]
  );
  const series = result.rows.map((r) => ({
    date: String(r.date),
    shown: Number(r.shown) || 0
  }));
  return evaluateQuizSavePromptHealth(series, config);
}
var QUIZ_SAVE_PROMPT_HEALTH_CONFIG;
var init_quizSavePromptHealth = __esm({
  "server/quizSavePromptHealth.ts"() {
    "use strict";
    init_quizSaveAnalytics();
    QUIZ_SAVE_PROMPT_HEALTH_CONFIG = {
      placement: "result_screen",
      trailingDays: 7,
      floorRatio: 0.4
    };
  }
});

// server/quizSaveAnalytics.ts
function isQuizSaveEventName(value) {
  return typeof value === "string" && QUIZ_SAVE_EVENT_NAMES.includes(value);
}
function classifyPlacement(body) {
  if (!body || typeof body !== "object") return "unknown";
  const props = body.properties;
  const raw = props && typeof props === "object" ? props.placement : void 0;
  if (typeof raw !== "string") return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "mid_quiz" || lower === "result_screen") return lower;
  return "unknown";
}
function classifySurface(body) {
  if (!body || typeof body !== "object") return "mobile";
  const props = body.properties;
  const propsSurface = props && typeof props === "object" ? props.surface : void 0;
  if (typeof propsSurface === "string" && propsSurface.toLowerCase() === "web") {
    return "web";
  }
  const platform = body.platform;
  if (typeof platform === "string" && platform.toLowerCase() === "web") {
    return "web";
  }
  return "mobile";
}
async function ensureQuizSaveEventsTable(pool) {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS quiz_save_events (
           id SERIAL PRIMARY KEY,
           event VARCHAR(40) NOT NULL,
           surface VARCHAR(16) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`
      );
      await pool.query(
        `ALTER TABLE quiz_save_events ADD COLUMN IF NOT EXISTS placement VARCHAR(32)`
      );
      await pool.query(
        `ALTER TABLE quiz_save_events
           ADD COLUMN IF NOT EXISTS posthog_event_id VARCHAR(64)`
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS quiz_save_events_posthog_uid_idx
           ON quiz_save_events (posthog_event_id)
         WHERE posthog_event_id IS NOT NULL`
      );
    })().catch((err) => {
      ensureTablePromise = null;
      throw err;
    });
  }
  await ensureTablePromise;
}
async function recordQuizSaveEvent(pool, body) {
  if (!body || typeof body !== "object") return;
  const event = body.event;
  if (!isQuizSaveEventName(event)) return;
  const surface = classifySurface(body);
  const placement = classifyPlacement(body);
  const distinctId = body.distinct_id;
  await ensureQuizSaveEventsTable(pool);
  await pool.query(
    `INSERT INTO quiz_save_events (event, surface, distinct_id, placement)
     VALUES ($1, $2, $3, $4)`,
    [
      event,
      surface,
      typeof distinctId === "string" ? distinctId : null,
      placement === "unknown" ? null : placement
    ]
  );
}
function metricsRow(rows) {
  const counts = {
    quiz_save_shown: 0,
    quiz_save_submitted: 0,
    quiz_save_dismissed: 0
  };
  for (const row of rows) {
    const n = Number(row.n) || 0;
    if (row.event in counts) counts[row.event] += n;
  }
  const shown = counts.quiz_save_shown;
  const submitted = counts.quiz_save_submitted;
  return {
    shown,
    submitted,
    dismissed: counts.quiz_save_dismissed,
    recoveryRate: shown > 0 ? submitted / shown : null
  };
}
async function computeQuizSaveAnalytics(pool, options) {
  await ensureQuizSaveEventsTable(pool);
  const windowDays = Math.max(1, Math.min(365, Math.floor(options.windowDays)));
  const interval = `${windowDays} days`;
  const eventsResult = await pool.query(
    `SELECT event, surface, placement, COUNT(*)::bigint AS n
       FROM quiz_save_events
      WHERE created_at >= NOW() - $1::interval
      GROUP BY event, surface, placement`,
    [interval]
  );
  const allRows = eventsResult.rows.map((r) => ({ event: r.event, n: r.n }));
  const totals = metricsRow(allRows);
  const bySurface = {
    web: metricsRow(eventsResult.rows.filter((r) => r.surface === "web")),
    mobile: metricsRow(eventsResult.rows.filter((r) => r.surface !== "web"))
  };
  const normalisePlacement = (raw) => {
    if (raw === "mid_quiz" || raw === "result_screen") return raw;
    return "unknown";
  };
  const byPlacement = {
    mid_quiz: metricsRow(
      eventsResult.rows.filter((r) => normalisePlacement(r.placement) === "mid_quiz")
    ),
    result_screen: metricsRow(
      eventsResult.rows.filter(
        (r) => normalisePlacement(r.placement) === "result_screen"
      )
    ),
    unknown: metricsRow(
      eventsResult.rows.filter((r) => normalisePlacement(r.placement) === "unknown")
    )
  };
  let emailGate = {
    directCaptures: 0,
    saveCaptures: 0,
    saveShareOfCaptures: null,
    unavailable: false
  };
  try {
    const leadsResult = await pool.query(
      `SELECT source, COUNT(*)::bigint AS n
         FROM quiz_leads
        WHERE created_at >= NOW() - $1::interval
        GROUP BY source`,
      [interval]
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
      unavailable: false
    };
  } catch (err) {
    const code = err?.code;
    const message = String(err?.message ?? "");
    const isMissingRelation = code === "42P01" || /relation .* does not exist/i.test(message);
    if (!isMissingRelation) throw err;
    emailGate = {
      directCaptures: 0,
      saveCaptures: 0,
      saveShareOfCaptures: null,
      unavailable: true
    };
  }
  const weeklyResult = await pool.query(
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
      ORDER BY g.week_start ASC, g.surface ASC, g.placement ASC`
  );
  const emptyPlacement = () => ({
    shown: 0,
    submitted: 0,
    dismissed: 0,
    recoveryRate: null
  });
  const emptySurface = () => ({
    shown: 0,
    submitted: 0,
    dismissed: 0,
    recoveryRate: null
  });
  const weeklyMap = /* @__PURE__ */ new Map();
  const placementSums = /* @__PURE__ */ new Map();
  const surfaceSums = /* @__PURE__ */ new Map();
  for (const row of weeklyResult.rows) {
    const weekStart = String(row.week_start);
    const placement = normalisePlacement(
      typeof row.placement === "string" ? row.placement : null
    );
    const surface = typeof row.surface === "string" && row.surface.toLowerCase() === "web" ? "web" : "mobile";
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
          unknown: emptyPlacement()
        },
        bySurface: {
          web: emptySurface(),
          mobile: emptySurface()
        }
      };
      weeklyMap.set(weekStart, bucket);
      placementSums.set(weekStart, {
        mid_quiz: emptyPlacement(),
        result_screen: emptyPlacement(),
        unknown: emptyPlacement()
      });
      surfaceSums.set(weekStart, {
        web: emptySurface(),
        mobile: emptySurface()
      });
    }
    const pSum = placementSums.get(weekStart);
    pSum[placement].shown += shown;
    pSum[placement].submitted += submitted;
    pSum[placement].dismissed += dismissed;
    const sSum = surfaceSums.get(weekStart);
    sSum[surface].shown += shown;
    sSum[surface].submitted += submitted;
    sSum[surface].dismissed += dismissed;
    bucket.shown += shown;
    bucket.submitted += submitted;
    bucket.dismissed += dismissed;
  }
  const finaliseRate = (m) => ({
    ...m,
    recoveryRate: m.shown > 0 ? m.submitted / m.shown : null
  });
  const weekly = Array.from(weeklyMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((w) => {
    const pSum = placementSums.get(w.weekStart);
    const sSum = surfaceSums.get(w.weekStart);
    return {
      ...w,
      recoveryRate: w.shown > 0 ? w.submitted / w.shown : null,
      byPlacement: {
        mid_quiz: finaliseRate(pSum.mid_quiz),
        result_screen: finaliseRate(pSum.result_screen),
        unknown: finaliseRate(pSum.unknown)
      },
      bySurface: {
        web: finaliseRate(sSum.web),
        mobile: finaliseRate(sSum.mobile)
      }
    };
  });
  return { windowDays, totals, bySurface, byPlacement, emailGate, weekly };
}
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtPct(rate) {
  if (rate === null) return "\u2014";
  return `${(rate * 100).toFixed(1)}%`;
}
function fmtInt(n) {
  return n.toLocaleString("en-US");
}
function metricsCells(m) {
  return `
    <td style="text-align:right">${fmtInt(m.shown)}</td>
    <td style="text-align:right">${fmtInt(m.submitted)}</td>
    <td style="text-align:right">${fmtInt(m.dismissed)}</td>
    <td style="text-align:right"><strong>${fmtPct(m.recoveryRate)}</strong></td>
  `;
}
function renderWeeklyChartSvg(weeks) {
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
  const yBar = (v) => padTop + innerH - v / maxShown * innerH;
  const xCenter = (i) => padLeft + slot * (i + 0.5);
  const yRate = (r) => r === null ? null : padTop + innerH - r * innerH;
  const bars = weeks.map((w, i) => {
    const cx = xCenter(i);
    const shownTop = yBar(w.shown);
    const submittedTop = yBar(w.submitted);
    const baseY = padTop + innerH;
    return `
      <g>
        <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml2(
      w.weekStart
    )}: ${fmtInt(w.shown)} shown</title></rect>
        <rect x="${cx - barW / 2}" y="${submittedTop}" width="${barW}" height="${baseY - submittedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml2(
      w.weekStart
    )}: ${fmtInt(w.submitted)} submitted</title></rect>
      </g>`;
  }).join("");
  const RATE_SERIES = [
    {
      key: "total",
      label: "All placements",
      color: "#d97706",
      get: (w) => w.recoveryRate,
      radius: 3.5,
      strokeWidth: 2
    },
    {
      key: "mid_quiz",
      label: PLACEMENT_LABELS.mid_quiz,
      color: "#0a66c2",
      get: (w) => w.byPlacement.mid_quiz.recoveryRate,
      radius: 3,
      strokeWidth: 1.5
    },
    {
      key: "result_screen",
      label: PLACEMENT_LABELS.result_screen,
      color: "#138a52",
      get: (w) => w.byPlacement.result_screen.recoveryRate,
      radius: 3,
      strokeWidth: 1.5
    }
  ];
  const seriesSvg = RATE_SERIES.map((series) => {
    const points = weeks.map((w, i) => ({
      x: xCenter(i),
      y: yRate(series.get(w)),
      rate: series.get(w),
      weekStart: w.weekStart
    }));
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a.y !== null && b.y !== null) {
        segs.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${series.color}" stroke-width="${series.strokeWidth}" />`
        );
      }
    }
    const dotMarks = points.filter((p) => p.y !== null).map(
      (p) => `<circle cx="${p.x}" cy="${p.y}" r="${series.radius}" fill="${series.color}"><title>${escapeHtml2(p.weekStart)} \u2014 ${escapeHtml2(series.label)}: ${fmtPct(
        p.rate
      )} recovery</title></circle>`
    ).join("");
    return `<g>${segs.join("")}${dotMarks}</g>`;
  }).join("");
  const xLabels = weeks.map((w, i) => {
    const short = w.weekStart.slice(5);
    return `<text x="${xCenter(i)}" y="${padTop + innerH + 18}" text-anchor="middle" font-size="10" fill="#666">${escapeHtml2(short)}</text>`;
  }).join("");
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
  const placementLegend = RATE_SERIES.filter((s) => s.key !== "total").map(
    (s) => `<span><span style="display:inline-block;width:14px;height:2px;background:${s.color};vertical-align:middle"></span> ${escapeHtml2(
      s.label
    )} recovery</span>`
  ).join("");
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
function renderWeeklySurfaceChartSvg(weeks, surface) {
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
  const yBar = (v) => padTop + innerH - v / maxShown * innerH;
  const xCenter = (i) => padLeft + slot * (i + 0.5);
  const yRate = (r) => r === null ? null : padTop + innerH - r * innerH;
  const bars = weeks.map((w, i) => {
    const s = w.bySurface[surface];
    const cx = xCenter(i);
    const shownTop = yBar(s.shown);
    const submittedTop = yBar(s.submitted);
    const baseY = padTop + innerH;
    return `
        <g>
          <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml2(
      w.weekStart
    )} (${escapeHtml2(SURFACE_LABELS[surface])}): ${fmtInt(s.shown)} shown</title></rect>
          <rect x="${cx - barW / 2}" y="${submittedTop}" width="${barW}" height="${baseY - submittedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml2(
      w.weekStart
    )} (${escapeHtml2(SURFACE_LABELS[surface])}): ${fmtInt(s.submitted)} submitted</title></rect>
        </g>`;
  }).join("");
  const points = weeks.map((w, i) => ({
    x: xCenter(i),
    y: yRate(w.bySurface[surface].recoveryRate),
    rate: w.bySurface[surface].recoveryRate,
    weekStart: w.weekStart
  }));
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.y !== null && b.y !== null) {
      segs.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d97706" stroke-width="1.75" />`
      );
    }
  }
  const dots = points.filter((p) => p.y !== null).map(
    (p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#d97706"><title>${escapeHtml2(
      p.weekStart
    )} \u2014 ${escapeHtml2(SURFACE_LABELS[surface])}: ${fmtPct(p.rate)} recovery</title></circle>`
  ).join("");
  const xLabels = weeks.map((w, i) => {
    const short = w.weekStart.slice(5);
    return `<text x="${xCenter(i)}" y="${padTop + innerH + 14}" text-anchor="middle" font-size="9" fill="#666">${escapeHtml2(short)}</text>`;
  }).join("");
  const yTicks = [0, 0.5, 1].map((frac) => {
    const y = padTop + innerH - frac * innerH;
    const count = Math.round(maxShown * frac);
    const pct = `${Math.round(frac * 100)}%`;
    return `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + innerW}" y2="${y}" stroke="#eee" stroke-width="1" />
        <text x="${padLeft - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#666">${fmtInt(count)}</text>
        <text x="${padLeft + innerW + 4}" y="${y + 3}" text-anchor="start" font-size="9" fill="#d97706">${pct}</text>`;
  }).join("");
  return `
    <figure style="margin:0;flex:1 1 320px;min-width:280px">
      <figcaption style="font-size:12px;font-weight:600;color:#333;margin-bottom:4px">${escapeHtml2(SURFACE_LABELS[surface])}</figcaption>
      <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeHtml2(SURFACE_LABELS[surface])} weekly save-prompt impressions, submissions, and recovery rate" style="background:#fff;border:1px solid #e5e5e5;border-radius:10px">
        ${yTicks}
        ${bars}
        <g>${segs.join("")}${dots}</g>
        ${xLabels}
      </svg>
    </figure>`;
}
function renderWeeklySurfaceCharts(weeks) {
  return `
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">
    ${renderWeeklySurfaceChartSvg(weeks, "web")}
    ${renderWeeklySurfaceChartSvg(weeks, "mobile")}
  </div>`;
}
function renderWeeklyTable(weeks) {
  const rows = weeks.map(
    (w) => `
      <tr>
        <td><code>${escapeHtml2(w.weekStart)}</code></td>
        <td style="text-align:right">${fmtInt(w.shown)}</td>
        <td style="text-align:right">${fmtInt(w.submitted)}</td>
        <td style="text-align:right">${fmtInt(w.dismissed)}</td>
        <td style="text-align:right"><strong>${fmtPct(w.recoveryRate)}</strong></td>
        <td style="text-align:right">${fmtPct(
      w.byPlacement.mid_quiz.recoveryRate
    )} <span style="color:#888">(${fmtInt(
      w.byPlacement.mid_quiz.submitted
    )}/${fmtInt(w.byPlacement.mid_quiz.shown)})</span></td>
        <td style="text-align:right">${fmtPct(
      w.byPlacement.result_screen.recoveryRate
    )} <span style="color:#888">(${fmtInt(
      w.byPlacement.result_screen.submitted
    )}/${fmtInt(w.byPlacement.result_screen.shown)})</span></td>
      </tr>`
  ).join("");
  return `
  <table>
    <thead>
      <tr>
        <th>Week starting (Mon)</th>
        <th style="text-align:right">Shown</th>
        <th style="text-align:right">Submitted</th>
        <th style="text-align:right">Dismissed</th>
        <th style="text-align:right">Recovery rate</th>
        <th style="text-align:right">${escapeHtml2(PLACEMENT_LABELS.mid_quiz)} recovery</th>
        <th style="text-align:right">${escapeHtml2(PLACEMENT_LABELS.result_screen)} recovery</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}
function formatAgo(iso, now = /* @__PURE__ */ new Date()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const deltaSec = Math.max(0, Math.round((now.getTime() - then) / 1e3));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.round(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 48) return `${deltaHr}h ago`;
  const deltaDay = Math.round(deltaHr / 24);
  return `${deltaDay}d ago`;
}
function renderLastBackfillSummary(last, now = /* @__PURE__ */ new Date()) {
  if (!last) {
    return `<p style="margin:4px 0 0;color:#777;font-size:12px">Last backfill: <em>never run yet</em>.</p>`;
  }
  const when = `${escapeHtml2(formatAgo(last.ranAt, now))} (${escapeHtml2(last.ranAt)})`;
  if (last.error) {
    return `<p style="margin:4px 0 0;color:#a35a00;font-size:12px">Last backfill: ${when} \u2014 <strong>failed</strong>: ${escapeHtml2(
      last.error
    )}</p>`;
  }
  return `<p style="margin:4px 0 0;color:#555;font-size:12px">Last backfill: ${when} \xB7 inserted <strong>${fmtInt(
    last.inserted
  )}</strong> / skipped <strong>${fmtInt(last.skipped)}</strong> (fetched ${fmtInt(
    last.fetched
  )})</p>`;
}
function fmtNum(n) {
  return Number.isInteger(n) ? fmtInt(n) : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
function renderQuizSavePromptHealthBanner(health) {
  if (!health) return "";
  const p = PROMPT_HEALTH_PRESENTATION[health.reason];
  const ev = health.evaluated_day;
  const t = health.trailing;
  const detail = `Placement <code>${escapeHtml2(health.placement)}</code> \xB7 evaluated day <code>${escapeHtml2(ev.date ?? "\u2014")}</code>: <strong>${fmtInt(ev.shown)}</strong> shown \xB7 trailing median <strong>${fmtNum(t.median)}</strong> over ${fmtInt(
    t.days
  )} day(s) \xB7 floor <strong>${fmtNum(t.floor)}</strong>`;
  return `
  <div style="background:${p.bg};border:1px solid ${p.border};color:${p.fg};padding:12px 14px;border-radius:8px;margin:12px 0;">
    <div style="font-weight:600;">
      <span aria-hidden="true" style="margin-right:6px;">\u25CF</span>Save-prompt health: ${escapeHtml2(
    p.label
  )}
    </div>
    <div style="font-size:13px;margin-top:4px;">${escapeHtml2(p.summary)}</div>
    <div style="font-size:12px;margin-top:6px;opacity:0.9;">${detail}</div>
    <div style="font-size:12px;margin-top:6px;opacity:0.8;">
      Probe: <code>/api/_internal/quiz-save-prompt-health</code>
    </div>
  </div>`;
}
function renderQuizSaveAnalyticsHtml(data, banner = null, lastBackfill = null, promptHealth = null) {
  const { totals, bySurface, byPlacement, emailGate, windowDays, weekly } = data;
  const bannerHtml = banner ? `<div style="background:#e7f5ec;border:1px solid #b8dec5;color:#1b5e3a;padding:10px 14px;border-radius:8px;margin:12px 0;">
         PostHog backfill complete \u2014 fetched <strong>${fmtInt(banner.fetched)}</strong>,
         inserted <strong>${fmtInt(banner.inserted)}</strong>,
         already-present (skipped) <strong>${fmtInt(banner.skipped)}</strong>.
       </div>` : "";
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
  <div class="nav"><a href="/admin">\u2190 Admin tools</a></div>
  <h1>Quiz save-prompt analytics</h1>
  ${bannerHtml}
  ${renderQuizSavePromptHealthBanner(promptHealth)}
  <details style="margin:12px 0 16px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:10px 14px;">
    <summary style="cursor:pointer;font-weight:600;">Backfill from PostHog</summary>
    <p style="color:#555;font-size:13px;margin-top:8px">
      Imports historical <code>quiz_save_shown</code>,
      <code>quiz_save_submitted</code>, and <code>quiz_save_dismissed</code>
      events from PostHog into the local <code>quiz_save_events</code> table,
      preserving the original timestamps and surface/placement attribution.
      Idempotent \u2014 events already imported (matched by upstream uuid) are
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
    ${renderLastBackfillSummary(lastBackfill)}
  </details>
  <p>Last <strong>${windowDays}</strong> days. Recovery rate = submitted \xF7 shown.</p>

  <div class="filter">
    Window:
    ${[7, 14, 30, 60, 90].map(
    (d) => `<a href="?days=${d}" class="${d === windowDays ? "active" : ""}">${d}d</a>`
  ).join("")}
  </div>

  <h2>Weekly trend (last 8 weeks) <a href="/admin/quiz-save-analytics.csv?days=${windowDays}" style="font-size:12px;font-weight:normal;margin-left:8px;color:#0a66c2;text-decoration:none">Download CSV</a></h2>
  <p class="desc">Always covers the most recent 8 ISO weeks (Mon\u2013Sun) regardless of the window above, so trends remain comparable as you change the filter. Bars use the left axis (counts); the lines use the right axis (recovery rate). The orange line is the combined rate; the blue and green lines split it by placement so the new post-result modal can be compared against the legacy mid-quiz prompt over time.</p>
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
      <tr><td>${escapeHtml2(PLACEMENT_LABELS.mid_quiz)}</td>${metricsCells(byPlacement.mid_quiz)}</tr>
      <tr><td>${escapeHtml2(PLACEMENT_LABELS.result_screen)}</td>${metricsCells(byPlacement.result_screen)}</tr>
      <tr><td>${escapeHtml2(PLACEMENT_LABELS.unknown)}</td>${metricsCells(byPlacement.unknown)}</tr>
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
  ${emailGate.unavailable ? `<p class="desc" style="color:#a35a00;background:#fff7e6;border:1px solid #ffd591;padding:8px 12px;border-radius:6px"><strong>Email-gate data unavailable.</strong> The <code>quiz_leads</code> table doesn't exist in this database yet \u2014 the zeros below are a placeholder, not a real measurement.</p>` : ""}
  <table>
    <thead>
      <tr><th>Source</th><th style="text-align:right">Captures</th><th style="text-align:right">Share of total</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Direct email gate (post-quiz)</td>
        <td style="text-align:right">${fmtInt(emailGate.directCaptures)}</td>
        <td style="text-align:right">${fmtPct(
    emailGate.directCaptures + emailGate.saveCaptures > 0 ? emailGate.directCaptures / (emailGate.directCaptures + emailGate.saveCaptures) : null
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
    \xB7 <a href="/admin/quiz-save-analytics.csv?days=${windowDays}">Download CSV</a>
  </p>
</body>
</html>`;
}
function csvCell(value) {
  if (value === null || value === void 0) return "";
  const str = typeof value === "number" ? String(value) : value;
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function csvRate(rate) {
  if (rate === null) return "";
  return rate.toFixed(4);
}
function renderQuizSaveAnalyticsCsv(data) {
  const { windowDays, totals, bySurface, byPlacement, weekly } = data;
  const sections = [];
  sections.push([`# Quiz save-prompt analytics \u2014 last ${windowDays} days`]);
  const funnel = [
    "section,key,shown,submitted,dismissed,recovery_rate"
  ];
  funnel.push(
    [
      "totals",
      "all",
      totals.shown,
      totals.submitted,
      totals.dismissed,
      csvRate(totals.recoveryRate)
    ].join(",")
  );
  for (const surface of ["web", "mobile"]) {
    const m = bySurface[surface];
    funnel.push(
      [
        "surface",
        surface,
        m.shown,
        m.submitted,
        m.dismissed,
        csvRate(m.recoveryRate)
      ].join(",")
    );
  }
  for (const placement of ["mid_quiz", "result_screen", "unknown"]) {
    const m = byPlacement[placement];
    funnel.push(
      [
        "placement",
        placement,
        m.shown,
        m.submitted,
        m.dismissed,
        csvRate(m.recoveryRate)
      ].join(",")
    );
  }
  sections.push(funnel);
  const weeklyCsv = renderQuizSaveAnalyticsWeeklyCsv(weekly).trimEnd();
  sections.push(weeklyCsv.split("\n"));
  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}
function renderQuizSaveAnalyticsWeeklyCsv(weeks) {
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
    "unknown_recovery_rate"
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
        csvRate(w.byPlacement.unknown.recoveryRate)
      ].join(",")
    );
  }
  return `${lines.join("\n")}
`;
}
function readWindowDays(req) {
  const raw = req.query.days;
  if (typeof raw !== "string") return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, n);
}
function buildHogQLQuery(since, limit, offset) {
  const sinceClause = since ? ` AND timestamp >= toDateTime('${since.replace(/'/g, "")}')` : "";
  return `SELECT uuid, event, timestamp, properties.surface AS surface, properties.platform AS platform, properties.placement AS placement, distinct_id FROM events WHERE event IN ('quiz_save_shown', 'quiz_save_submitted', 'quiz_save_dismissed')${sinceClause} ORDER BY timestamp ASC, uuid ASC LIMIT ${limit} OFFSET ${offset}`;
}
function classifySurfaceFromRow(surfaceRaw, platformRaw) {
  if (typeof surfaceRaw === "string" && surfaceRaw.toLowerCase() === "web") {
    return "web";
  }
  if (typeof platformRaw === "string" && platformRaw.toLowerCase() === "web") {
    return "web";
  }
  return "mobile";
}
function classifyPlacementFromRow(placementRaw) {
  if (typeof placementRaw !== "string") return "unknown";
  const lower = placementRaw.toLowerCase();
  if (lower === "mid_quiz" || lower === "result_screen") return lower;
  return "unknown";
}
async function backfillQuizSaveEventsFromPostHog(pool, options = {}) {
  const host = options.posthogHost ?? process.env.POSTHOG_HOST ?? "https://us.posthog.com";
  const projectId = options.posthogProjectId ?? process.env.POSTHOG_PROJECT_ID ?? "";
  const apiKey = options.posthogApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY ?? "";
  if (!projectId || !apiKey) {
    throw new PostHogBackfillConfigError(
      "PostHog backfill requires POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY"
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = Math.max(1, Math.min(1e4, options.pageSize ?? 1e3));
  const maxRows = Math.max(pageSize, options.maxRows ?? 2e5);
  const since = options.since ?? null;
  await ensureQuizSaveEventsTable(pool);
  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(
    projectId
  )}/query/`;
  const summary = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    pages: 0,
    firstEventAt: null,
    lastEventAt: null
  };
  let offset = 0;
  while (summary.fetched < maxRows) {
    const limit = Math.min(pageSize, maxRows - summary.fetched);
    const body = {
      query: { kind: "HogQLQuery", query: buildHogQLQuery(since, limit, offset) }
    };
    const resp = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `PostHog query failed: ${resp.status} ${resp.statusText} ${text.slice(0, 200)}`
      );
    }
    const payload = await resp.json();
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
        distinctIdRaw
      ] = row;
      if (typeof uuidRaw !== "string" || uuidRaw.length === 0) continue;
      if (!isQuizSaveEventName(eventRaw)) continue;
      const tsDate = typeof timestampRaw === "string" || typeof timestampRaw === "number" ? new Date(timestampRaw) : timestampRaw instanceof Date ? timestampRaw : null;
      if (!tsDate || Number.isNaN(tsDate.getTime())) continue;
      const surface = classifySurfaceFromRow(surfaceRaw, platformRaw);
      const placement = classifyPlacementFromRow(placementRaw);
      const distinctId = typeof distinctIdRaw === "string" && distinctIdRaw.length > 0 ? distinctIdRaw.slice(0, 255) : null;
      const uuid = uuidRaw.slice(0, 64);
      const ins = await pool.query(
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
          uuid
        ]
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
function registerQuizSaveAnalyticsRoutes(app2, deps) {
  const sendCsv = async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured");
      return;
    }
    try {
      const windowDays = readWindowDays(req);
      const data = await computeQuizSaveAnalytics(pool, { windowDays });
      const csv = renderQuizSaveAnalyticsCsv(data);
      const stamp = data.weekly.length > 0 ? data.weekly[data.weekly.length - 1].weekStart : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      res.type("text/csv; charset=utf-8").set(
        "Content-Disposition",
        `attachment; filename="quiz-save-analytics-${windowDays}d-${stamp}.csv"`
      ).send(csv);
    } catch (err) {
      console.error("Quiz save analytics CSV error:", err?.message);
      res.status(500).type("text/plain").send("Failed to compute CSV");
    } finally {
      await pool.end();
    }
  };
  app2.get("/admin/quiz-save-analytics.csv", sendCsv);
  app2.get("/api/admin/quiz-save-analytics.csv", sendCsv);
  app2.get("/api/admin/quiz-save-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeQuizSaveAnalytics(pool, {
        windowDays: readWindowDays(req)
      });
      res.json(data);
    } catch (err) {
      console.error("Quiz save analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute quiz save analytics" });
    } finally {
      await pool.end();
    }
  });
  app2.post("/api/admin/quiz-save-analytics/backfill", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const sinceRaw = typeof req.query.since === "string" && req.query.since || (req.body && typeof req.body.since === "string" ? req.body.since : "");
    const since = sinceRaw && sinceRaw.trim().length > 0 ? sinceRaw.trim() : null;
    if (since !== null && !/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(since)) {
      res.status(400).json({
        error: `Invalid 'since' value: expected YYYY-MM-DD or ISO-8601 timestamp, got ${since}`
      });
      await pool.end();
      return;
    }
    const manualStarted = Date.now();
    const manualRanAt = new Date(manualStarted).toISOString();
    try {
      const summary = await backfillQuizSaveEventsFromPostHog(pool, { since });
      try {
        const { recordQuizSaveBackfillRun: recordQuizSaveBackfillRun2 } = await Promise.resolve().then(() => (init_quizSaveBackfillScheduler(), quizSaveBackfillScheduler_exports));
        await recordQuizSaveBackfillRun2(pool, {
          ranAt: manualRanAt,
          durationMs: Date.now() - manualStarted,
          summary,
          error: null,
          since
        });
      } catch (logErr) {
        console.error(
          "Quiz-save backfill: failed to persist manual run record:",
          logErr?.message ?? logErr
        );
      }
      const wantsHtml = typeof req.headers.accept === "string" && req.headers.accept.includes("text/html");
      if (wantsHtml) {
        const params = new URLSearchParams({
          backfill: "ok",
          fetched: String(summary.fetched),
          inserted: String(summary.inserted),
          skipped: String(summary.skipped)
        });
        res.redirect(`/admin/quiz-save-analytics?${params.toString()}`);
        return;
      }
      res.json(summary);
    } catch (err) {
      console.error("Quiz-save backfill error:", err?.message);
      try {
        const { recordQuizSaveBackfillRun: recordQuizSaveBackfillRun2 } = await Promise.resolve().then(() => (init_quizSaveBackfillScheduler(), quizSaveBackfillScheduler_exports));
        const message = err instanceof PostHogBackfillConfigError ? `config error: ${err.message}` : err?.message ?? String(err);
        await recordQuizSaveBackfillRun2(pool, {
          ranAt: manualRanAt,
          durationMs: Date.now() - manualStarted,
          summary: null,
          error: message,
          since
        });
      } catch (logErr) {
        console.error(
          "Quiz-save backfill: failed to persist manual failure record:",
          logErr?.message ?? logErr
        );
      }
      const status = err instanceof PostHogBackfillConfigError ? 400 : 500;
      res.status(status).json({
        error: err?.message ?? "Failed to backfill quiz-save events"
      });
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin/quiz-save-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/html").send(
        `<h1>Quiz save analytics unavailable</h1><p>Database is not configured (set <code>DATABASE_URL</code>).</p>`
      );
      return;
    }
    try {
      const data = await computeQuizSaveAnalytics(pool, {
        windowDays: readWindowDays(req)
      });
      const banner = req.query.backfill === "ok" ? {
        fetched: Number(req.query.fetched) || 0,
        inserted: Number(req.query.inserted) || 0,
        skipped: Number(req.query.skipped) || 0
      } : null;
      let lastBackfill = null;
      try {
        const { getLatestQuizSaveBackfillRun: getLatestQuizSaveBackfillRun2 } = await Promise.resolve().then(() => (init_quizSaveBackfillScheduler(), quizSaveBackfillScheduler_exports));
        const latest = await getLatestQuizSaveBackfillRun2(pool);
        if (latest) {
          lastBackfill = {
            ranAt: latest.ranAt,
            inserted: latest.inserted,
            skipped: latest.skipped,
            fetched: latest.fetched,
            error: latest.error
          };
        }
      } catch (err) {
        console.warn(
          `[quiz-save-analytics] could not read last backfill run: ${err?.message ?? err}`
        );
      }
      let promptHealth = null;
      try {
        const { computeQuizSavePromptHealth: computeQuizSavePromptHealth2 } = await Promise.resolve().then(() => (init_quizSavePromptHealth(), quizSavePromptHealth_exports));
        promptHealth = await computeQuizSavePromptHealth2(pool);
      } catch (err) {
        console.warn(
          `[quiz-save-analytics] could not compute prompt health: ${err?.message ?? err}`
        );
      }
      res.type("text/html").send(
        renderQuizSaveAnalyticsHtml(data, banner, lastBackfill, promptHealth)
      );
    } catch (err) {
      console.error("Quiz save analytics HTML error:", err?.message);
      res.status(500).type("text/html").send(
        `<h1>Quiz save analytics unavailable</h1><pre>${escapeHtml2(
          err?.message ?? "unknown"
        )}</pre>`
      );
    } finally {
      await pool.end();
    }
  });
}
var QUIZ_SAVE_EVENT_NAMES, ensureTablePromise, SURFACE_LABELS, PLACEMENT_LABELS, PROMPT_HEALTH_PRESENTATION, PostHogBackfillConfigError;
var init_quizSaveAnalytics = __esm({
  "server/quizSaveAnalytics.ts"() {
    "use strict";
    QUIZ_SAVE_EVENT_NAMES = [
      "quiz_save_shown",
      "quiz_save_submitted",
      "quiz_save_dismissed"
    ];
    ensureTablePromise = null;
    SURFACE_LABELS = {
      web: "Web funnel",
      mobile: "Mobile quiz"
    };
    PLACEMENT_LABELS = {
      mid_quiz: "Mid-quiz (legacy)",
      result_screen: "Result screen (new)",
      unknown: "Unknown / pre-migration"
    };
    PROMPT_HEALTH_PRESENTATION = {
      ok: {
        label: "Healthy",
        bg: "#e7f5ec",
        border: "#b8dec5",
        fg: "#1b5e3a",
        summary: "The result-screen prompt is firing at a normal rate."
      },
      insufficient_baseline: {
        label: "Insufficient baseline",
        bg: "#f4f4f5",
        border: "#d4d4d8",
        fg: "#52525b",
        summary: "Not enough trailing history to judge yet \u2014 treated as healthy so quiet or fresh environments don't alert."
      },
      zero_today: {
        label: "Prompt silent (zero today)",
        bg: "#fdeceb",
        border: "#f5b5b0",
        fg: "#a12a21",
        summary: "The most recent complete day saw zero prompts while the baseline was non-zero \u2014 the prompt may have stopped firing."
      },
      below_median_floor: {
        label: "Below median floor",
        bg: "#fff7e6",
        border: "#ffd591",
        fg: "#a35a00",
        summary: "The most recent complete day fell well below the trailing median \u2014 a partial regression worth investigating."
      },
      probe_unavailable: {
        label: "Probe unavailable",
        bg: "#fdeceb",
        border: "#f5b5b0",
        fg: "#a12a21",
        summary: "The health probe could not read the data (no database, or the query failed)."
      }
    };
    PostHogBackfillConfigError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "PostHogBackfillConfigError";
      }
    };
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import pg from "pg";

// shared/planSteps.ts
var GENERIC_PLAN_STEP_IDS = [
  "research_quiz",
  "shortlist_built",
  "visa_pathway",
  "visa_selected",
  "finances_reviewed",
  "tax_research",
  "housing_research",
  "school_research",
  "flight_booked",
  "move_date_set"
];

// server/plannerAnalytics.ts
var STEP_TO_STAGE = {
  research_quiz: "research",
  shortlist_built: "research",
  visa_pathway: "visa",
  visa_selected: "visa",
  finances_reviewed: "money",
  tax_research: "money",
  housing_research: "logistics",
  school_research: "logistics",
  flight_booked: "logistics",
  move_date_set: "logistics"
};
var STAGE_ORDER = [
  "research",
  "visa",
  "money",
  "logistics"
];
var STAGE_TITLES = {
  research: "Research",
  visa: "Visa & Legal",
  money: "Money & Tax",
  logistics: "Logistics & Move"
};
var STEP_TITLES = {
  research_quiz: "Take the readiness quiz",
  shortlist_built: "Build your shortlist",
  visa_pathway: "Identify a visa pathway",
  visa_selected: "Submit your visa application",
  finances_reviewed: "Review your finances",
  tax_research: "Plan your tax strategy",
  housing_research: "Research housing",
  school_research: "Research schools (if applicable)",
  flight_booked: "Book your flight",
  move_date_set: "Set your move date"
};
var USER_PROGRESS_CREATED_AT_MIGRATION = "user_progress_created_at";
var DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN = 3;
var createdAtColumnPromise = null;
var createdAtBackfillPromise = null;
function ensureUserProgressCreatedAt(pool) {
  if (createdAtColumnPromise) return createdAtColumnPromise;
  createdAtColumnPromise = (async () => {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TIMESTAMP NOT NULL
         )`
      );
      await pool.query(
        `DO $do$
         DECLARE
           migration_ts timestamp;
         BEGIN
           -- Serialize across concurrent app processes so the
           -- column-existence check and the ALTER TABLE that follows
           -- run as a single critical section. The transaction-scoped
           -- advisory lock is released automatically on COMMIT.
           PERFORM pg_advisory_xact_lock(
             hashtext('${USER_PROGRESS_CREATED_AT_MIGRATION}')
           );
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_name = 'user_progress'
                AND column_name = 'created_at'
           ) THEN
             migration_ts := now();
             ALTER TABLE user_progress ADD COLUMN created_at TIMESTAMP;
             UPDATE user_progress
                SET created_at = migration_ts
              WHERE created_at IS NULL;
             ALTER TABLE user_progress
               ALTER COLUMN created_at SET DEFAULT NOW();
             INSERT INTO schema_migrations (name, applied_at)
                  VALUES ('${USER_PROGRESS_CREATED_AT_MIGRATION}', migration_ts)
             ON CONFLICT (name) DO NOTHING;
           END IF;
         END $do$;`
      );
      await backfillUserProgressMigrationCreatedAt(pool);
    } catch (err) {
      createdAtColumnPromise = null;
      throw err;
    }
  })();
  return createdAtColumnPromise;
}
function backfillUserProgressMigrationCreatedAt(pool) {
  if (createdAtBackfillPromise) return createdAtBackfillPromise;
  createdAtBackfillPromise = (async () => {
    try {
      const recorded = await pool.query(
        `SELECT applied_at
           FROM schema_migrations
          WHERE name = $1`,
        [USER_PROGRESS_CREATED_AT_MIGRATION]
      );
      if (recorded.rows.length === 0) {
        return;
      }
      const ts = recorded.rows[0].applied_at;
      await pool.query(
        `UPDATE user_progress AS up
            SET created_at = sub.first_completion
           FROM (
             SELECT user_id,
                    target_country,
                    MIN(completed_at) AS first_completion
               FROM user_progress
              WHERE completed_at IS NOT NULL
              GROUP BY user_id, target_country
           ) AS sub
          WHERE up.created_at = $1
            AND up.user_id = sub.user_id
            AND up.target_country = sub.target_country`,
        [ts]
      );
      await pool.query(
        `UPDATE user_progress
            SET created_at = NULL
          WHERE created_at = $1`,
        [ts]
      );
    } catch (err) {
      createdAtBackfillPromise = null;
      throw err;
    }
  })();
  return createdAtBackfillPromise;
}
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDateRange(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("..");
  if (parts.length !== 2) return null;
  const [start, end] = parts.map((p) => p.trim());
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return null;
  const startDate = /* @__PURE__ */ new Date(`${start}T00:00:00Z`);
  const endDate = /* @__PURE__ */ new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  if (startDate.getTime() > endDate.getTime()) return null;
  return { start, end };
}
function endExclusive(end) {
  const d = /* @__PURE__ */ new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
async function computeRangeMetrics(pool, stepIds, totalSteps, country, range) {
  const params = [
    stepIds,
    totalSteps,
    range.start,
    endExclusive(range.end)
  ];
  let countryClause = "";
  if (country) {
    params.push(country);
    countryClause = ` AND target_country = $${params.length}`;
  }
  const result = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])${countryClause}
        GROUP BY user_id, target_country
     )
     SELECT
       COUNT(*) FILTER (
         WHERE started_at >= $3::date AND started_at < $4::date
       )::int AS plans_started,
       COUNT(*) FILTER (
         WHERE done_steps = $2
           AND started_at >= $3::date AND started_at < $4::date
       )::int AS plans_completed,
       COUNT(*) FILTER (
         WHERE done_steps = $2
           AND started_at IS NOT NULL
           AND started_at >= $3::date AND started_at < $4::date
       )::int AS median_sample_size,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at)) / 86400.0
       ) FILTER (
         WHERE done_steps = $2
           AND started_at IS NOT NULL
           AND started_at >= $3::date AND started_at < $4::date
       ) AS median_days
     FROM per_plan`,
    params
  );
  const row = result.rows[0] ?? {};
  const plansStarted = Number(row.plans_started) || 0;
  const plansCompleted = Number(row.plans_completed) || 0;
  const medianSampleSize = Number(row.median_sample_size) || 0;
  const medianRaw = row.median_days;
  const medianDays = medianRaw === null || medianRaw === void 0 ? null : Math.round(Number(medianRaw) * 10) / 10;
  return {
    start: range.start,
    end: range.end,
    plansStarted,
    plansCompleted,
    completionRatePct: plansStarted > 0 ? Math.round(plansCompleted / plansStarted * 1e3) / 10 : 0,
    medianDaysToCompletion: medianDays,
    medianSampleSize
  };
}
function computeRangeDelta(rangeA, rangeB) {
  const plansStartedDelta = rangeA.plansStarted - rangeB.plansStarted;
  const plansCompletedDelta = rangeA.plansCompleted - rangeB.plansCompleted;
  const completionRateDelta = Math.round((rangeA.completionRatePct - rangeB.completionRatePct) * 10) / 10;
  const medianDelta = rangeA.medianDaysToCompletion === null || rangeB.medianDaysToCompletion === null ? null : Math.round(
    (rangeA.medianDaysToCompletion - rangeB.medianDaysToCompletion) * 10
  ) / 10;
  const pct = (a, b) => b === 0 ? null : Math.round((a - b) / b * 1e3) / 10;
  return {
    plansStarted: plansStartedDelta,
    plansStartedPct: pct(rangeA.plansStarted, rangeB.plansStarted),
    plansCompleted: plansCompletedDelta,
    plansCompletedPct: pct(rangeA.plansCompleted, rangeB.plansCompleted),
    completionRatePctPoints: completionRateDelta,
    medianDaysToCompletion: medianDelta,
    medianDaysToCompletionPct: rangeA.medianDaysToCompletion === null || rangeB.medianDaysToCompletion === null ? null : pct(rangeA.medianDaysToCompletion, rangeB.medianDaysToCompletion)
  };
}
async function computeRangeMetricsByCountry(pool, stepIds, totalSteps, country, range) {
  const params = [
    stepIds,
    totalSteps,
    range.start,
    endExclusive(range.end)
  ];
  let countryClause = "";
  if (country) {
    params.push(country);
    countryClause = ` AND target_country = $${params.length}`;
  }
  const result = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])
          AND target_country IS NOT NULL${countryClause}
        GROUP BY user_id, target_country
     )
     SELECT target_country,
       COUNT(*) FILTER (
         WHERE started_at >= $3::date AND started_at < $4::date
       )::int AS plans_started,
       COUNT(*) FILTER (
         WHERE done_steps = $2
           AND started_at >= $3::date AND started_at < $4::date
       )::int AS plans_completed,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at)) / 86400.0
       ) FILTER (
         WHERE done_steps = $2
           AND started_at IS NOT NULL
           AND started_at >= $3::date AND started_at < $4::date
       ) AS median_days
     FROM per_plan
     GROUP BY target_country`,
    params
  );
  const map = /* @__PURE__ */ new Map();
  for (const row of result.rows) {
    const median2 = row.median_days === null || row.median_days === void 0 ? null : Math.round(Number(row.median_days) * 10) / 10;
    map.set(String(row.target_country), {
      plansStarted: Number(row.plans_started) || 0,
      plansCompleted: Number(row.plans_completed) || 0,
      medianDaysToCompletion: median2
    });
  }
  return map;
}
function mergeCountryRangeComparison(aRows, bRows) {
  const pct = (a, b) => b === 0 ? null : Math.round((a - b) / b * 1e3) / 10;
  const emptyBucket = () => ({
    plansStarted: 0,
    plansCompleted: 0,
    medianDaysToCompletion: null
  });
  const countries = /* @__PURE__ */ new Set([...aRows.keys(), ...bRows.keys()]);
  const out = [];
  for (const country of countries) {
    const a = aRows.get(country) ?? emptyBucket();
    const b = bRows.get(country) ?? emptyBucket();
    if (a.plansStarted === 0 && a.plansCompleted === 0 && b.plansStarted === 0 && b.plansCompleted === 0) {
      continue;
    }
    const medianDelta = a.medianDaysToCompletion === null || b.medianDaysToCompletion === null ? null : Math.round(
      (a.medianDaysToCompletion - b.medianDaysToCompletion) * 10
    ) / 10;
    out.push({
      country,
      rangeA: a,
      rangeB: b,
      delta: {
        plansStarted: a.plansStarted - b.plansStarted,
        plansStartedPct: pct(a.plansStarted, b.plansStarted),
        plansCompleted: a.plansCompleted - b.plansCompleted,
        plansCompletedPct: pct(a.plansCompleted, b.plansCompleted),
        medianDaysToCompletion: medianDelta
      }
    });
  }
  out.sort((x, y) => {
    const diff = Math.abs(y.delta.plansStarted) - Math.abs(x.delta.plansStarted);
    if (diff !== 0) return diff;
    return x.country.localeCompare(y.country);
  });
  return out;
}
function normalizeCountry(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
async function computePlannerAnalytics(pool, options = {}) {
  await ensureUserProgressCreatedAt(pool);
  const stepIds = [...GENERIC_PLAN_STEP_IDS];
  const totalSteps = stepIds.length;
  const country = normalizeCountry(options.country ?? null);
  const minPlans = Math.max(
    1,
    Math.floor(
      options.minPlansForCountryBreakdown ?? DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN
    )
  );
  const perStepParams = [stepIds];
  let perStepCountryClause = "";
  if (country) {
    perStepParams.push(country);
    perStepCountryClause = ` AND target_country = $${perStepParams.length}`;
  }
  const perStep = await pool.query(
    `SELECT step_id,
            COUNT(*) FILTER (WHERE completed)::int AS completed,
            COUNT(*)::int                          AS started
       FROM user_progress
      WHERE step_id = ANY($1::text[])${perStepCountryClause}
      GROUP BY step_id`,
    perStepParams
  );
  const stepRows = /* @__PURE__ */ new Map();
  for (const row of perStep.rows) {
    stepRows.set(row.step_id, {
      completed: Number(row.completed) || 0,
      started: Number(row.started) || 0
    });
  }
  const perPlanParams = [stepIds, totalSteps];
  let perPlanCountryClause = "";
  if (country) {
    perPlanParams.push(country);
    perPlanCountryClause = ` AND target_country = $${perPlanParams.length}`;
  }
  const perPlan = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])${perPlanCountryClause}
        GROUP BY user_id, target_country
     )
     SELECT
       COUNT(*)::int                                    AS plans_started,
       COUNT(*) FILTER (WHERE done_steps = $2)::int     AS plans_completed,
       COUNT(*) FILTER (
         WHERE done_steps = $2 AND started_at IS NOT NULL
       )::int                                           AS median_sample_size,
       COUNT(*) FILTER (
         WHERE done_steps = $2 AND started_at IS NULL
       )::int                                           AS median_excluded_unknown_start,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at)) / 86400.0
       ) FILTER (WHERE done_steps = $2 AND started_at IS NOT NULL)
                                                        AS median_days
     FROM per_plan`,
    perPlanParams
  );
  const plansStarted = Number(perPlan.rows[0]?.plans_started ?? 0);
  const plansCompleted = Number(perPlan.rows[0]?.plans_completed ?? 0);
  const medianSampleSize = Number(perPlan.rows[0]?.median_sample_size ?? 0);
  const medianExcludedUnknownStart = Number(
    perPlan.rows[0]?.median_excluded_unknown_start ?? 0
  );
  const medianExcludedUnknownStartPct = plansCompleted > 0 ? Math.round(medianExcludedUnknownStart / plansCompleted * 1e3) / 10 : 0;
  const medianDaysRaw = perPlan.rows[0]?.median_days;
  const medianDaysToCompletion = medianDaysRaw === null || medianDaysRaw === void 0 ? null : Math.round(Number(medianDaysRaw) * 10) / 10;
  const stepCompletion = stepIds.map((stepId) => {
    const row = stepRows.get(stepId) ?? { completed: 0, started: 0 };
    const denom = row.started || plansStarted;
    return {
      stepId,
      title: STEP_TITLES[stepId] ?? stepId,
      stage: STEP_TO_STAGE[stepId] ?? "other",
      completed: row.completed,
      started: denom,
      completionRatePct: denom > 0 ? Math.round(row.completed / denom * 1e3) / 10 : 0
    };
  });
  const stageDropOffPromises = STAGE_ORDER.map(async (stage) => {
    const stageSteps = stepIds.filter((id) => STEP_TO_STAGE[id] === stage);
    if (stageSteps.length === 0) {
      return {
        stage,
        title: STAGE_TITLES[stage] ?? stage,
        stepCount: 0,
        averageStepCompletionRatePct: 0,
        plansFinishingStage: 0,
        plansFinishingStagePct: 0
      };
    }
    const stageCompletionRates = stageSteps.map((id) => {
      const r = stepRows.get(id) ?? { completed: 0, started: 0 };
      const denom = r.started || plansStarted;
      return denom > 0 ? r.completed / denom : 0;
    });
    const avgRate = stageCompletionRates.reduce((a, b) => a + b, 0) / stageCompletionRates.length;
    const stageParams = [stageSteps, stageSteps.length];
    let stageCountryClause = "";
    if (country) {
      stageParams.push(country);
      stageCountryClause = ` AND target_country = $${stageParams.length}`;
    }
    const stageDone = await pool.query(
      `WITH per_plan AS (
         SELECT user_id, target_country,
                COUNT(*) FILTER (WHERE completed)::int AS done
           FROM user_progress
          WHERE step_id = ANY($1::text[])${stageCountryClause}
          GROUP BY user_id, target_country
       )
       SELECT COUNT(*) FILTER (WHERE done = $2)::int AS finished
         FROM per_plan`,
      stageParams
    );
    const finished = Number(stageDone.rows[0]?.finished ?? 0);
    return {
      stage,
      title: STAGE_TITLES[stage] ?? stage,
      stepCount: stageSteps.length,
      averageStepCompletionRatePct: Math.round(avgRate * 1e3) / 10,
      plansFinishingStage: finished,
      plansFinishingStagePct: plansStarted > 0 ? Math.round(finished / plansStarted * 1e3) / 10 : 0
    };
  });
  const stageDropOff = await Promise.all(stageDropOffPromises);
  const weeklyParams = [stepIds, totalSteps];
  let weeklyCountryClause = "";
  if (country) {
    weeklyParams.push(country);
    weeklyCountryClause = ` AND target_country = $${weeklyParams.length}`;
  }
  const weeklyRows = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])${weeklyCountryClause}
        GROUP BY user_id, target_country
     ),
     weeks AS (
       SELECT (date_trunc('week', NOW())::date
                 - (n * INTERVAL '7 days'))::date AS week_start
         FROM generate_series(0, 7) AS n
     ),
     per_week AS (
       SELECT date_trunc('week', started_at)::date AS week_start,
              COUNT(*)::int                        AS plans_started,
              COUNT(*) FILTER (WHERE done_steps = $2)::int AS plans_completed,
              PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at))
                         / 86400.0
              ) FILTER (WHERE done_steps = $2) AS median_days
         FROM per_plan
        WHERE started_at IS NOT NULL
        GROUP BY 1
     )
     SELECT to_char(w.week_start, 'YYYY-MM-DD')        AS week_start,
            COALESCE(p.plans_started, 0)::int          AS plans_started,
            COALESCE(p.plans_completed, 0)::int        AS plans_completed,
            p.median_days                              AS median_days
       FROM weeks w
       LEFT JOIN per_week p ON p.week_start = w.week_start
      ORDER BY w.week_start ASC`,
    weeklyParams
  );
  const weekly = weeklyRows.rows.map((row) => {
    const median2 = row.median_days === null || row.median_days === void 0 ? null : Math.round(Number(row.median_days) * 10) / 10;
    return {
      weekStart: String(row.week_start),
      plansStarted: Number(row.plans_started) || 0,
      plansCompleted: Number(row.plans_completed) || 0,
      medianDaysToCompletion: median2
    };
  });
  const byCountryParams = [stepIds, totalSteps];
  let byCountryWhere = "";
  let byCountryHaving = "";
  if (country) {
    byCountryParams.push(country);
    byCountryWhere = ` AND target_country = $${byCountryParams.length}`;
  } else {
    byCountryParams.push(minPlans);
    byCountryHaving = `
     HAVING COUNT(*) >= $${byCountryParams.length}`;
  }
  const byCountryQuery = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])
          AND target_country IS NOT NULL${byCountryWhere}
        GROUP BY user_id, target_country
     )
     SELECT target_country,
            COUNT(*)::int                                  AS plans_started,
            COUNT(*) FILTER (WHERE done_steps = $2)::int   AS plans_completed,
            COUNT(*) FILTER (
              WHERE done_steps = $2 AND started_at IS NOT NULL
            )::int                                         AS median_sample_size,
            COUNT(*) FILTER (
              WHERE done_steps = $2 AND started_at IS NULL
            )::int                                         AS median_excluded_unknown_start,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at)) / 86400.0
            ) FILTER (WHERE done_steps = $2 AND started_at IS NOT NULL)
                                                           AS median_days
       FROM per_plan
      GROUP BY target_country${byCountryHaving}
      ORDER BY plans_started DESC, target_country ASC`,
    byCountryParams
  );
  const byCountry = byCountryQuery.rows.map((row) => {
    const started = Number(row.plans_started) || 0;
    const completed = Number(row.plans_completed) || 0;
    const median2 = row.median_days === null || row.median_days === void 0 ? null : Math.round(Number(row.median_days) * 10) / 10;
    return {
      country: String(row.target_country),
      plansStarted: started,
      plansCompleted: completed,
      completionRatePct: started > 0 ? Math.round(completed / started * 1e3) / 10 : 0,
      medianDaysToCompletion: median2,
      medianSampleSize: Number(row.median_sample_size) || 0,
      medianExcludedUnknownStart: Number(row.median_excluded_unknown_start) || 0
    };
  });
  const allCountriesQuery = await pool.query(
    `SELECT DISTINCT target_country
       FROM user_progress
      WHERE step_id = ANY($1::text[])
        AND target_country IS NOT NULL
      ORDER BY target_country`,
    [stepIds]
  );
  const countries = allCountriesQuery.rows.map((row) => String(row.target_country)).filter((c) => c.length > 0);
  const rangeA = options.rangeA ?? null;
  const rangeB = options.rangeB ?? null;
  let comparison = null;
  if (rangeA && rangeB) {
    const [a, b, aByCountry, bByCountry] = await Promise.all([
      computeRangeMetrics(pool, stepIds, totalSteps, country, rangeA),
      computeRangeMetrics(pool, stepIds, totalSteps, country, rangeB),
      computeRangeMetricsByCountry(pool, stepIds, totalSteps, country, rangeA),
      computeRangeMetricsByCountry(pool, stepIds, totalSteps, country, rangeB)
    ]);
    comparison = {
      rangeA: a,
      rangeB: b,
      delta: computeRangeDelta(a, b),
      byCountry: mergeCountryRangeComparison(aByCountry, bByCountry)
    };
  }
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    totalSteps,
    filter: {
      country,
      minPlansForCountryBreakdown: minPlans,
      rangeA,
      rangeB
    },
    countries,
    totals: {
      plansStarted,
      plansCompleted,
      completionRatePct: plansStarted > 0 ? Math.round(plansCompleted / plansStarted * 1e3) / 10 : 0,
      medianDaysToCompletion,
      medianSampleSize,
      medianExcludedUnknownStart,
      medianExcludedUnknownStartPct
    },
    stepCompletion,
    stageDropOff,
    weekly,
    byCountry,
    comparison
  };
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatDelta(value, unit = "") {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "\xB1";
  const magnitude = Math.abs(value);
  const formatted = Math.abs(magnitude - Math.round(magnitude)) < 1e-9 ? magnitude.toLocaleString() : magnitude.toFixed(1);
  return `${sign}${formatted}${unit}`;
}
function formatDeltaPct(value) {
  if (value === null) return "\u2014";
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "\xB1";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}
function deltaDirection(value) {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}
function renderComparisonSection(data) {
  const { comparison, filter } = data;
  const formRangeA = filter.rangeA ? { start: filter.rangeA.start, end: filter.rangeA.end } : { start: "", end: "" };
  const formRangeB = filter.rangeB ? { start: filter.rangeB.start, end: filter.rangeB.end } : { start: "", end: "" };
  const activeCountry = filter.country;
  const hiddenCountry = activeCountry ? `<input type="hidden" name="country" value="${escapeHtml(activeCountry)}" />` : "";
  const clearHref = activeCountry ? `/admin/planner-analytics?country=${encodeURIComponent(activeCountry)}` : `/admin/planner-analytics`;
  const formHtml = `
  <form class="range-form" method="get" action="/admin/planner-analytics">
    ${hiddenCountry}
    <fieldset>
      <legend>Range A</legend>
      <label>Start <input type="date" name="rangeAStart" value="${escapeHtml(formRangeA.start)}" required /></label>
      <label>End <input type="date" name="rangeAEnd" value="${escapeHtml(formRangeA.end)}" required /></label>
    </fieldset>
    <fieldset>
      <legend>Range B (baseline)</legend>
      <label>Start <input type="date" name="rangeBStart" value="${escapeHtml(formRangeB.start)}" required /></label>
      <label>End <input type="date" name="rangeBEnd" value="${escapeHtml(formRangeB.end)}" required /></label>
    </fieldset>
    <div class="range-form-actions">
      <button type="submit">Compare</button>
      ${comparison ? `<a href="${escapeHtml(clearHref)}"><button type="button" class="secondary">Clear</button></a>` : ""}
    </div>
    <p class="meta range-form-hint">
      Plans are bucketed by their start date. Both ranges are inclusive.
      Delta is Range A \u2212 Range B; percentages use Range B as the baseline.
      Equivalent JSON: <code>?rangeA=YYYY-MM-DD..YYYY-MM-DD&amp;rangeB=YYYY-MM-DD..YYYY-MM-DD</code>.
    </p>
  </form>`;
  if (!comparison) {
    return `
  <h2>Compare two date ranges</h2>
  <p class="meta">
    Pick two date ranges to see plans started, plans reaching 100%, and
    median time-to-100% side by side with a delta column.
  </p>
  ${formHtml}`;
  }
  const { rangeA, rangeB, delta } = comparison;
  const labelA = `${rangeA.start} \u2192 ${rangeA.end}`;
  const labelB = `${rangeB.start} \u2192 ${rangeB.end}`;
  const medianACell = rangeA.medianDaysToCompletion === null ? "\u2014" : `${rangeA.medianDaysToCompletion.toFixed(1)} days`;
  const medianBCell = rangeB.medianDaysToCompletion === null ? "\u2014" : `${rangeB.medianDaysToCompletion.toFixed(1)} days`;
  function deltaCell(absolute, pct, direction, goodWhen) {
    let tone = "neutral";
    if (direction !== "neutral" && goodWhen !== "either") {
      tone = direction === goodWhen ? "good" : "bad";
    }
    return `<td class="num delta delta-${tone}"><span class="delta-abs">${escapeHtml(absolute)}</span><span class="delta-pct">${escapeHtml(pct)}</span></td>`;
  }
  const plansStartedDelta = deltaCell(
    formatDelta(delta.plansStarted),
    formatDeltaPct(delta.plansStartedPct),
    deltaDirection(delta.plansStarted),
    "up"
  );
  const plansCompletedDelta = deltaCell(
    formatDelta(delta.plansCompleted),
    formatDeltaPct(delta.plansCompletedPct),
    deltaDirection(delta.plansCompleted),
    "up"
  );
  const completionRateDelta = deltaCell(
    formatDelta(delta.completionRatePctPoints, " pp"),
    "",
    deltaDirection(delta.completionRatePctPoints),
    "up"
  );
  const medianDelta = deltaCell(
    delta.medianDaysToCompletion === null ? "\u2014" : formatDelta(delta.medianDaysToCompletion, " days"),
    formatDeltaPct(delta.medianDaysToCompletionPct),
    deltaDirection(delta.medianDaysToCompletion),
    "down"
  );
  const comparisonCsvParts = [];
  if (activeCountry) {
    comparisonCsvParts.push(`country=${encodeURIComponent(activeCountry)}`);
  }
  comparisonCsvParts.push(
    `rangeA=${encodeURIComponent(`${rangeA.start}..${rangeA.end}`)}`
  );
  comparisonCsvParts.push(
    `rangeB=${encodeURIComponent(`${rangeB.start}..${rangeB.end}`)}`
  );
  const comparisonCsvHref = `/admin/planner-analytics-comparison.csv?${comparisonCsvParts.join("&")}`;
  const countryRowsHtml = comparison.byCountry.map((row) => {
    const medianACell2 = row.rangeA.medianDaysToCompletion === null ? "\u2014" : `${row.rangeA.medianDaysToCompletion.toFixed(1)}`;
    const medianBCell2 = row.rangeB.medianDaysToCompletion === null ? "\u2014" : `${row.rangeB.medianDaysToCompletion.toFixed(1)}`;
    const startedDeltaCell = deltaCell(
      formatDelta(row.delta.plansStarted),
      formatDeltaPct(row.delta.plansStartedPct),
      deltaDirection(row.delta.plansStarted),
      "up"
    );
    const completedDeltaCell = deltaCell(
      formatDelta(row.delta.plansCompleted),
      formatDeltaPct(row.delta.plansCompletedPct),
      deltaDirection(row.delta.plansCompleted),
      "up"
    );
    const medianDeltaCell = deltaCell(
      row.delta.medianDaysToCompletion === null ? "\u2014" : formatDelta(row.delta.medianDaysToCompletion, " days"),
      "",
      deltaDirection(row.delta.medianDaysToCompletion),
      "down"
    );
    return `
      <tr>
        <td>${escapeHtml(titleCaseCountry(row.country))}</td>
        <td class="num">${row.rangeA.plansStarted.toLocaleString()}</td>
        <td class="num">${row.rangeB.plansStarted.toLocaleString()}</td>
        ${startedDeltaCell}
        <td class="num">${row.rangeA.plansCompleted.toLocaleString()}</td>
        <td class="num">${row.rangeB.plansCompleted.toLocaleString()}</td>
        ${completedDeltaCell}
        <td class="num">${escapeHtml(medianACell2)}</td>
        <td class="num">${escapeHtml(medianBCell2)}</td>
        ${medianDeltaCell}
      </tr>`;
  }).join("");
  const byCountryComparisonHtml = comparison.byCountry.length ? `
  <h3 class="comparison-country-heading">By country</h3>
  <p class="meta">
    Which countries drove the change. Sorted by absolute change in plans
    started; countries with no activity in either range are omitted.
  </p>
  <table class="comparison comparison-country">
    <thead>
      <tr>
        <th rowspan="2">Country</th>
        <th class="num" colspan="3">Plans started</th>
        <th class="num" colspan="3">Reached 100%</th>
        <th class="num" colspan="3">Median time-to-100%</th>
      </tr>
      <tr>
        <th class="num sub">A</th>
        <th class="num sub">B</th>
        <th class="num sub">\u0394</th>
        <th class="num sub">A</th>
        <th class="num sub">B</th>
        <th class="num sub">\u0394</th>
        <th class="num sub">A</th>
        <th class="num sub">B</th>
        <th class="num sub">\u0394</th>
      </tr>
    </thead>
    <tbody>${countryRowsHtml}</tbody>
  </table>` : `
  <h3 class="comparison-country-heading">By country</h3>
  <p class="meta empty">No country had any plans started in either range.</p>`;
  return `
  <h2>Range comparison</h2>
  <p class="meta">
    Range A: <strong>${escapeHtml(labelA)}</strong> \xB7
    Range B (baseline): <strong>${escapeHtml(labelB)}</strong>.
    Plans are bucketed by start date; delta is Range A \u2212 Range B.
    <a href="${escapeHtml(comparisonCsvHref)}">Download CSV</a>
  </p>
  <table class="comparison">
    <thead>
      <tr>
        <th>Metric</th>
        <th class="num">Range A</th>
        <th class="num">Range B</th>
        <th class="num">\u0394 (A \u2212 B)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Plans started</td>
        <td class="num">${rangeA.plansStarted.toLocaleString()}</td>
        <td class="num">${rangeB.plansStarted.toLocaleString()}</td>
        ${plansStartedDelta}
      </tr>
      <tr>
        <td>Reached 100%</td>
        <td class="num">${rangeA.plansCompleted.toLocaleString()}</td>
        <td class="num">${rangeB.plansCompleted.toLocaleString()}</td>
        ${plansCompletedDelta}
      </tr>
      <tr>
        <td>% reaching 100%</td>
        <td class="num">${rangeA.completionRatePct.toFixed(1)}%</td>
        <td class="num">${rangeB.completionRatePct.toFixed(1)}%</td>
        ${completionRateDelta}
      </tr>
      <tr>
        <td>Median time-to-100%
          <div class="meta">Sample: ${rangeA.medianSampleSize.toLocaleString()} vs ${rangeB.medianSampleSize.toLocaleString()} plan${rangeB.medianSampleSize === 1 ? "" : "s"}</div>
        </td>
        <td class="num">${escapeHtml(medianACell)}</td>
        <td class="num">${escapeHtml(medianBCell)}</td>
        ${medianDelta}
      </tr>
    </tbody>
  </table>
  ${byCountryComparisonHtml}
  ${formHtml}`;
}
function titleCaseCountry(country) {
  return country.split(/[\s_-]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}
function renderPlannerAnalyticsHtml(data) {
  const median2 = data.totals.medianDaysToCompletion === null ? "\u2014" : `${data.totals.medianDaysToCompletion.toFixed(1)} days`;
  const {
    medianSampleSize,
    medianExcludedUnknownStart,
    medianExcludedUnknownStartPct
  } = data.totals;
  const sampleNoun = medianSampleSize === 1 ? "plan" : "plans";
  const medianBasis = `Based on ${medianSampleSize.toLocaleString()} ${sampleNoun}`;
  const medianExclusionNote = medianExcludedUnknownStart > 0 ? `${medianExcludedUnknownStart.toLocaleString()} completed ${medianExcludedUnknownStart === 1 ? "plan" : "plans"} excluded (unknown start, ${medianExcludedUnknownStartPct.toFixed(
    1
  )}% of completed)` : "0 completed plans excluded";
  const stepRowsHtml = data.stepCompletion.map(
    (s) => `
      <tr>
        <td><code>${escapeHtml(s.stepId)}</code></td>
        <td>${escapeHtml(s.title)}</td>
        <td>${escapeHtml(STAGE_TITLES[s.stage] ?? s.stage)}</td>
        <td class="num">${s.completed.toLocaleString()}</td>
        <td class="num">${s.started.toLocaleString()}</td>
        <td class="num">${s.completionRatePct.toFixed(1)}%</td>
      </tr>`
  ).join("");
  const stageRowsHtml = data.stageDropOff.map(
    (s) => `
      <tr>
        <td>${escapeHtml(s.title)}</td>
        <td class="num">${s.stepCount}</td>
        <td class="num">${s.averageStepCompletionRatePct.toFixed(1)}%</td>
        <td class="num">${s.plansFinishingStage.toLocaleString()}</td>
        <td class="num">${s.plansFinishingStagePct.toFixed(1)}%</td>
      </tr>`
  ).join("");
  const weeklySparkline = (values, opts) => {
    const width = 320;
    const height = 56;
    const padX = 4;
    const padY = 4;
    const slotCount = values.length;
    const slotWidth = (width - padX * 2) / Math.max(1, slotCount);
    const barWidth = Math.max(2, slotWidth - 4);
    const numericValues = values.filter(
      (v) => typeof v === "number" && Number.isFinite(v)
    );
    const max = numericValues.length ? Math.max(...numericValues, 0) : 0;
    const baseline = height - padY;
    const bars = values.map((v, i) => {
      const x = padX + i * slotWidth + (slotWidth - barWidth) / 2;
      if (v === null || !Number.isFinite(v)) {
        return `<rect x="${x.toFixed(2)}" y="${(baseline - 1).toFixed(2)}" width="${barWidth.toFixed(2)}" height="1" fill="#d8d8d8" />`;
      }
      const h = max > 0 ? v / max * (height - padY * 2) : 0;
      const y = baseline - h;
      const title = `${data.weekly[i]?.weekStart ?? ""}: ${opts.formatValue(v)}`;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" fill="${opts.color}" rx="1"><title>${escapeHtml(title)}</title></rect>`;
    }).join("");
    return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeHtml(opts.label)}" preserveAspectRatio="none">
      <line x1="${padX}" y1="${baseline.toFixed(2)}" x2="${(width - padX).toFixed(2)}" y2="${baseline.toFixed(2)}" stroke="#e0e0e0" stroke-width="1" />
      ${bars}
    </svg>`;
  };
  const firstWeekStart = data.weekly[0]?.weekStart ?? "";
  const lastWeekStart = data.weekly[data.weekly.length - 1]?.weekStart ?? "";
  const sparklineRangeLabel = firstWeekStart && lastWeekStart ? `${firstWeekStart} \u2192 ${lastWeekStart}` : "";
  const startedValues = data.weekly.map((w) => w.plansStarted);
  const completedValues = data.weekly.map((w) => w.plansCompleted);
  const medianValues = data.weekly.map((w) => w.medianDaysToCompletion);
  const latestStarted = startedValues[startedValues.length - 1] ?? 0;
  const latestCompleted = completedValues[completedValues.length - 1] ?? 0;
  const latestMedian = medianValues[medianValues.length - 1];
  const weeklyChartsHtml = `
  <div class="sparkline-grid">
    <div class="sparkline-card">
      <div class="sparkline-label">Plans started / week</div>
      <div class="sparkline-latest">${latestStarted.toLocaleString()}<span class="sparkline-latest-sub"> latest week</span></div>
      ${weeklySparkline(startedValues, {
    color: "#0a66c2",
    label: "Plans started per week over the last 8 weeks",
    formatValue: (n) => `${n.toLocaleString()} started`
  })}
    </div>
    <div class="sparkline-card">
      <div class="sparkline-label">Reached 100% / week</div>
      <div class="sparkline-latest">${latestCompleted.toLocaleString()}<span class="sparkline-latest-sub"> latest week</span></div>
      ${weeklySparkline(completedValues, {
    color: "#1e8e3e",
    label: "Plans reaching 100% per week over the last 8 weeks",
    formatValue: (n) => `${n.toLocaleString()} reached 100%`
  })}
    </div>
    <div class="sparkline-card">
      <div class="sparkline-label">Median time-to-100% / week</div>
      <div class="sparkline-latest">${typeof latestMedian === "number" ? `${latestMedian.toFixed(1)}<span class="sparkline-latest-sub"> days, latest week</span>` : `\u2014<span class="sparkline-latest-sub"> latest week</span>`}</div>
      ${weeklySparkline(medianValues, {
    color: "#8a4b00",
    label: "Median days to reach 100% per week over the last 8 weeks",
    formatValue: (n) => `${n.toFixed(1)} days`
  })}
    </div>
  </div>
  ${sparklineRangeLabel ? `<p class="meta sparkline-range">Range: <code>${escapeHtml(sparklineRangeLabel)}</code></p>` : ""}`;
  const weeklyRowsHtml = data.weekly.map((w) => {
    const completionPct = w.plansStarted > 0 ? `${(Math.round(w.plansCompleted / w.plansStarted * 1e3) / 10).toFixed(1)}%` : "\u2014";
    const medianCell = w.medianDaysToCompletion === null ? "\u2014" : `${w.medianDaysToCompletion.toFixed(1)} days`;
    return `
      <tr>
        <td><code>${escapeHtml(w.weekStart)}</code></td>
        <td class="num">${w.plansStarted.toLocaleString()}</td>
        <td class="num">${w.plansCompleted.toLocaleString()}</td>
        <td class="num">${escapeHtml(completionPct)}</td>
        <td class="num">${escapeHtml(medianCell)}</td>
      </tr>`;
  }).join("");
  const activeCountry = data.filter.country;
  const minPlans = data.filter.minPlansForCountryBreakdown;
  const countryOptionsHtml = data.countries.map((c) => {
    const selected = c === activeCountry ? " selected" : "";
    return `<option value="${escapeHtml(c)}"${selected}>${escapeHtml(
      titleCaseCountry(c)
    )}</option>`;
  }).join("");
  const emptyMessage = activeCountry ? `No plans started yet for ${escapeHtml(titleCaseCountry(activeCountry))}.` : `No countries have at least ${minPlans} plan${minPlans === 1 ? "" : "s"} started yet.`;
  const byCountryChartRows = [...data.byCountry].sort(
    (a, b) => b.completionRatePct - a.completionRatePct
  );
  const byCountryChartHtml = byCountryChartRows.length ? `
  <div class="chart" role="img" aria-label="Completion rate per country, 0 to 100 percent">
    ${byCountryChartRows.map((row) => {
    const widthPct = Math.round(Math.min(100, Math.max(0, row.completionRatePct)) * 10) / 10;
    return `
    <div class="chart-row">
      <div class="chart-label">${escapeHtml(titleCaseCountry(row.country))}</div>
      <div class="chart-track">
        <div class="chart-bar" style="width: ${widthPct}%"></div>
      </div>
      <div class="chart-value">${row.completionRatePct.toFixed(1)}%</div>
    </div>`;
  }).join("")}
  </div>` : `<p class="meta empty">${emptyMessage}</p>`;
  const byCountryRowsHtml = data.byCountry.length ? data.byCountry.map((row) => {
    const medianCell = row.medianDaysToCompletion === null ? "\u2014" : `${row.medianDaysToCompletion.toFixed(1)} days`;
    const filterHref = `/admin/planner-analytics?country=${encodeURIComponent(
      row.country
    )}`;
    const countryCell = activeCountry ? escapeHtml(titleCaseCountry(row.country)) : `<a href="${escapeHtml(filterHref)}">${escapeHtml(
      titleCaseCountry(row.country)
    )}</a>`;
    return `
      <tr>
        <td>${countryCell}</td>
        <td class="num">${row.plansStarted.toLocaleString()}</td>
        <td class="num">${row.plansCompleted.toLocaleString()}</td>
        <td class="num">${row.completionRatePct.toFixed(1)}%</td>
        <td class="num">${escapeHtml(medianCell)}</td>
        <td class="num">${row.medianSampleSize.toLocaleString()}</td>
        <td class="num">${row.medianExcludedUnknownStart.toLocaleString()}</td>
      </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">${emptyMessage}</td></tr>`;
  const filterBadge = activeCountry ? `<span class="badge">Filtered to <strong>${escapeHtml(
    titleCaseCountry(activeCountry)
  )}</strong> \xB7 <a href="/admin/planner-analytics">clear</a></span>` : `<span class="badge muted">All countries</span>`;
  const jsonQueryParts = [];
  if (activeCountry) {
    jsonQueryParts.push(`country=${encodeURIComponent(activeCountry)}`);
  }
  if (data.filter.rangeA) {
    jsonQueryParts.push(
      `rangeA=${encodeURIComponent(`${data.filter.rangeA.start}..${data.filter.rangeA.end}`)}`
    );
  }
  if (data.filter.rangeB) {
    jsonQueryParts.push(
      `rangeB=${encodeURIComponent(`${data.filter.rangeB.start}..${data.filter.rangeB.end}`)}`
    );
  }
  const jsonHref = jsonQueryParts.length ? `/api/admin/planner-analytics?${jsonQueryParts.join("&")}` : `/api/admin/planner-analytics`;
  const comparisonHtml = renderComparisonSection(data);
  const csvQueryParts = [];
  if (activeCountry) {
    csvQueryParts.push(`country=${encodeURIComponent(activeCountry)}`);
  }
  if (!activeCountry && minPlans !== DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN) {
    csvQueryParts.push(`minPlans=${minPlans}`);
  }
  const csvHref = csvQueryParts.length ? `/admin/planner-analytics.csv?${csvQueryParts.join("&")}` : `/admin/planner-analytics.csv`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Planner Analytics \u2014 ExpatHub Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 1100px;
      color: #111; background: #fafafa;
    }
    h1 { margin: 0 0 4px; font-size: 22px; }
    h2 { margin: 32px 0 12px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; }
    .card .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 24px; font-weight: 600; margin-top: 6px; }
    .card .sub { color: #666; font-size: 11px; margin-top: 6px; line-height: 1.4; }
    .card .sub .excluded { display: block; color: #8a4b00; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; }
    th { background: #f6f6f6; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { text-align: center; color: #777; font-style: italic; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    a { color: #0a66c2; }
    .nav { font-size: 12px; margin-bottom: 16px; }
    .filter-bar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 12px 16px; margin: 16px 0 24px;
    }
    .filter-bar form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .filter-bar label { font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
    .filter-bar select {
      font: inherit; padding: 6px 10px; border-radius: 6px;
      border: 1px solid #d0d0d0; background: #fff; color: #111;
    }
    .filter-bar button {
      font: inherit; padding: 6px 12px; border-radius: 6px;
      border: 1px solid #0a66c2; background: #0a66c2; color: #fff; cursor: pointer;
    }
    .filter-bar button.secondary {
      background: #fff; color: #0a66c2;
    }
    .badge {
      display: inline-block; padding: 4px 10px; border-radius: 999px;
      background: #e8f0fe; color: #0a66c2; font-size: 12px;
    }
    .badge.muted { background: #f0f0f0; color: #555; }
    .chart {
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;
    }
    .chart-row {
      display: grid;
      grid-template-columns: minmax(120px, 160px) 1fr minmax(56px, auto);
      align-items: center; gap: 12px;
    }
    .chart-label { font-size: 13px; color: #111; }
    .chart-track {
      background: #f0f0f0; border-radius: 6px; height: 14px; overflow: hidden;
    }
    .chart-bar {
      background: #0a66c2; height: 100%; border-radius: 6px;
      min-width: 2px;
    }
    .chart-value {
      font-variant-numeric: tabular-nums; font-size: 13px; color: #333;
      text-align: right;
    }
    .sparkline-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px; margin-bottom: 12px;
    }
    .sparkline-card {
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 12px 16px;
    }
    .sparkline-label {
      color: #666; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .sparkline-latest {
      font-size: 20px; font-weight: 600; margin: 4px 0 8px;
      font-variant-numeric: tabular-nums;
    }
    .sparkline-latest-sub {
      font-size: 11px; font-weight: 400; color: #777;
      text-transform: uppercase; letter-spacing: 0.04em; margin-left: 4px;
    }
    .sparkline { display: block; }
    .sparkline-range { margin: 0 0 16px; }
    table.comparison .delta { font-variant-numeric: tabular-nums; }
    table.comparison .delta .delta-abs { display: block; font-weight: 600; }
    table.comparison .delta .delta-pct {
      display: block; font-size: 11px; color: #666; margin-top: 2px;
    }
    table.comparison .delta-good .delta-abs { color: #137333; }
    table.comparison .delta-bad .delta-abs { color: #b3261e; }
    table.comparison .delta-neutral .delta-abs { color: #555; }
    .comparison-country-heading { margin: 24px 0 8px; font-size: 13px; }
    table.comparison-country th.sub {
      font-weight: 500; font-size: 11px; color: #777;
    }
    table.comparison-country .delta .delta-abs { font-size: 13px; }
    .range-form {
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 16px 20px; margin-top: 12px;
      display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px;
    }
    .range-form fieldset {
      border: 1px solid #e5e5e5; border-radius: 8px;
      padding: 8px 12px 10px; margin: 0;
      display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    }
    .range-form legend {
      padding: 0 6px; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.05em; color: #555;
    }
    .range-form label {
      font-size: 12px; color: #555; display: flex; gap: 6px; align-items: center;
    }
    .range-form input[type="date"] {
      font: inherit; padding: 4px 8px; border-radius: 6px;
      border: 1px solid #d0d0d0; background: #fff; color: #111;
    }
    .range-form-actions { display: flex; gap: 8px; align-items: center; }
    .range-form button {
      font: inherit; padding: 6px 12px; border-radius: 6px;
      border: 1px solid #0a66c2; background: #0a66c2; color: #fff; cursor: pointer;
    }
    .range-form button.secondary { background: #fff; color: #0a66c2; }
    .range-form-hint { flex-basis: 100%; margin: 0; }
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">\u2190 Admin tools</a></div>
  <h1>Planner completion analytics</h1>
  <p class="meta">
    Aggregated from <code>user_progress</code>. Generated ${escapeHtml(data.generatedAt)}.
    Equivalent JSON at <a href="${escapeHtml(jsonHref)}"><code>${escapeHtml(jsonHref)}</code></a>.
  </p>

  <div class="filter-bar">
    <form method="get" action="/admin/planner-analytics">
      <label for="country">Country</label>
      <select id="country" name="country">
        <option value="">All countries</option>
        ${countryOptionsHtml}
      </select>
      <button type="submit">Apply</button>
      ${activeCountry ? `<a href="/admin/planner-analytics"><button type="button" class="secondary">Clear</button></a>` : ""}
    </form>
    ${filterBadge}
  </div>

  ${comparisonHtml}

  <div class="cards">
    <div class="card">
      <div class="label">Plans started</div>
      <div class="value">${data.totals.plansStarted.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="label">Reached 100%</div>
      <div class="value">${data.totals.plansCompleted.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="label">% reaching 100%</div>
      <div class="value">${data.totals.completionRatePct.toFixed(1)}%</div>
    </div>
    <div class="card">
      <div class="label">Median time-to-100%</div>
      <div class="value">${escapeHtml(median2)}</div>
      <div class="sub">
        <span>${escapeHtml(medianBasis)}</span>
        <span class="excluded">${escapeHtml(medianExclusionNote)}</span>
      </div>
    </div>
  </div>

  <h2>Last 8 weeks</h2>
  ${weeklyChartsHtml}
  <table>
    <thead>
      <tr>
        <th>Week starting (Mon)</th>
        <th class="num">Plans started</th>
        <th class="num">Reached 100%</th>
        <th class="num">% reaching 100%</th>
        <th class="num">Median time-to-100%</th>
      </tr>
    </thead>
    <tbody>${weeklyRowsHtml}</tbody>
  </table>

  <h2>Completion rate per step</h2>
  <table>
    <thead>
      <tr>
        <th>Step ID</th>
        <th>Title</th>
        <th>Stage</th>
        <th class="num">Completed</th>
        <th class="num">Started</th>
        <th class="num">Rate</th>
      </tr>
    </thead>
    <tbody>${stepRowsHtml}</tbody>
  </table>

  <h2>Drop-off by planner stage</h2>
  <table>
    <thead>
      <tr>
        <th>Stage</th>
        <th class="num">Steps</th>
        <th class="num">Avg step completion</th>
        <th class="num">Plans finishing stage</th>
        <th class="num">% of started</th>
      </tr>
    </thead>
    <tbody>${stageRowsHtml}</tbody>
  </table>

  <h2>Breakdown by country</h2>
  <p class="meta">
    ${activeCountry ? `Showing only <strong>${escapeHtml(titleCaseCountry(activeCountry))}</strong> because the country filter is active. Clear the filter to compare every country side by side.` : `Includes any country with at least ${minPlans} plan${minPlans === 1 ? "" : "s"} started \u2014 adjust via <code>?minPlans=N</code>. Click a country name to drill in.`}
    <a href="${escapeHtml(csvHref)}">Download CSV</a>
  </p>
  ${byCountryChartHtml}
  <table style="margin-top: 16px;">
    <thead>
      <tr>
        <th>Country</th>
        <th class="num">Plans started</th>
        <th class="num">Reached 100%</th>
        <th class="num">% reaching 100%</th>
        <th class="num">Median time-to-100%</th>
        <th class="num">Median sample size</th>
        <th class="num">Excluded (unknown start)</th>
      </tr>
    </thead>
    <tbody>${byCountryRowsHtml}</tbody>
  </table>

  <h2>Data quality notes</h2>
  <div class="card" style="margin-top: 0;">
    <div class="label">Bounce flag on <code>planner_step_collapsed</code></div>
    <p style="margin: 8px 0 0; color: #333;">
      When a user expands a planner step and collapses it again in under
      <strong>500ms</strong> (<code>PLANNER_BOUNCE_THRESHOLD_MS</code> in
      <code>src/lib/analytics.ts</code>), the
      <code>planner_step_collapsed</code> event is stamped with
      <code>bounced: true</code>. These are almost always accidental
      chevron taps or unmount-on-navigate cycles, not real reading
      sessions, so they skew dwell-time medians toward zero.
    </p>
    <p style="margin: 8px 0 0; color: #333;">
      <strong>When building any dwell-time / time-on-step insight in
      PostHog or the warehouse, filter
      <code>bounced = false</code></strong> on
      <code>planner_step_collapsed</code> before computing
      <code>msOpen</code> aggregates. The bounced events are kept (not
      dropped) so raw event counts still match, but they should never
      feed into median or average dwell time.
    </p>
  </div>

  <p style="margin-top:24px;color:#888;font-size:12px">
    JSON: <code>${escapeHtml(jsonHref)}</code>
    \xB7 <a href="${escapeHtml(csvHref)}">Download CSV</a>
  </p>
</body>
</html>`;
}
function csvEscape(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function fmtCsvNumber(value, fractionDigits = 1) {
  if (value === null || value === void 0) return "";
  if (!Number.isFinite(value)) return "";
  return value.toFixed(fractionDigits);
}
function renderPlannerAnalyticsCsv(data) {
  const { filter } = data;
  const sections = [];
  const headerLines = ["# Planner completion analytics"];
  if (filter.country) {
    headerLines.push(`# Filter: country=${filter.country}`);
  } else {
    headerLines.push(
      `# Filter: minPlans=${filter.minPlansForCountryBreakdown}`
    );
  }
  headerLines.push(`# Generated: ${data.generatedAt}`);
  sections.push(headerLines);
  sections.push([
    "section,metric,value",
    `totals,plans_started,${data.totals.plansStarted}`,
    `totals,plans_completed,${data.totals.plansCompleted}`,
    `totals,pct_reaching_100,${fmtCsvNumber(data.totals.completionRatePct)}`,
    `totals,median_days_to_completion,${fmtCsvNumber(data.totals.medianDaysToCompletion)}`,
    `totals,median_sample_size,${data.totals.medianSampleSize}`,
    `totals,median_excluded_unknown_start,${data.totals.medianExcludedUnknownStart}`
  ]);
  const stepLines = [
    "step_id,title,stage,completed,started,completion_rate_pct"
  ];
  for (const step of data.stepCompletion) {
    stepLines.push(
      [
        csvEscape(step.stepId),
        csvEscape(step.title),
        csvEscape(step.stage),
        step.completed,
        step.started,
        fmtCsvNumber(step.completionRatePct)
      ].join(",")
    );
  }
  sections.push(stepLines);
  const weeklyLines = [
    "week_start,plans_started,plans_completed,median_days_to_completion"
  ];
  for (const week of data.weekly) {
    weeklyLines.push(
      [
        csvEscape(week.weekStart),
        week.plansStarted,
        week.plansCompleted,
        fmtCsvNumber(week.medianDaysToCompletion)
      ].join(",")
    );
  }
  sections.push(weeklyLines);
  const countryLines = [
    "country,plans_started,reached_100,pct_reaching_100,median_days_to_completion,median_sample_size,median_excluded_unknown_start"
  ];
  for (const row of data.byCountry) {
    countryLines.push(
      [
        csvEscape(row.country),
        row.plansStarted,
        row.plansCompleted,
        fmtCsvNumber(row.completionRatePct),
        fmtCsvNumber(row.medianDaysToCompletion),
        row.medianSampleSize,
        row.medianExcludedUnknownStart
      ].join(",")
    );
  }
  sections.push(countryLines);
  return sections.map((s) => s.join("\r\n")).join("\r\n\r\n") + "\r\n";
}
function renderRangeComparisonCsv(data) {
  const { comparison, filter } = data;
  const headerLines = ["# Planner range comparison"];
  if (comparison) {
    headerLines.push(
      `# Range A: ${comparison.rangeA.start}..${comparison.rangeA.end}`
    );
    headerLines.push(
      `# Range B (baseline): ${comparison.rangeB.start}..${comparison.rangeB.end}`
    );
  }
  if (filter.country) {
    headerLines.push(`# Filter: country=${filter.country}`);
  }
  headerLines.push(`# Generated: ${data.generatedAt}`);
  if (!comparison) {
    headerLines.push("# No comparison: supply both rangeA and rangeB");
    return headerLines.join("\r\n") + "\r\n";
  }
  const { rangeA, rangeB, delta } = comparison;
  const rows = ["metric,range_a,range_b,delta,delta_pct"];
  rows.push(
    [
      "plans_started",
      rangeA.plansStarted,
      rangeB.plansStarted,
      delta.plansStarted,
      fmtCsvNumber(delta.plansStartedPct)
    ].join(",")
  );
  rows.push(
    [
      "reached_100",
      rangeA.plansCompleted,
      rangeB.plansCompleted,
      delta.plansCompleted,
      fmtCsvNumber(delta.plansCompletedPct)
    ].join(",")
  );
  rows.push(
    [
      "pct_reaching_100",
      fmtCsvNumber(rangeA.completionRatePct),
      fmtCsvNumber(rangeB.completionRatePct),
      fmtCsvNumber(delta.completionRatePctPoints),
      ""
    ].join(",")
  );
  rows.push(
    [
      "median_days_to_completion",
      fmtCsvNumber(rangeA.medianDaysToCompletion),
      fmtCsvNumber(rangeB.medianDaysToCompletion),
      fmtCsvNumber(delta.medianDaysToCompletion),
      fmtCsvNumber(delta.medianDaysToCompletionPct)
    ].join(",")
  );
  return [headerLines.join("\r\n"), rows.join("\r\n")].join("\r\n\r\n") + "\r\n";
}
function renderAdminIndexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ExpatHub Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 720px; color: #111; background: #fafafa;
    }
    h1 { margin: 0 0 8px; }
    p { color: #555; }
    ul { padding: 0; list-style: none; margin: 24px 0 0; }
    li { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; margin-bottom: 12px; padding: 16px; }
    li a { font-weight: 600; font-size: 16px; color: #0a66c2; text-decoration: none; }
    li a:hover { text-decoration: underline; }
    li .desc { color: #666; margin-top: 4px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>ExpatHub internal tools</h1>
  <p>Basic-Auth-protected dashboards aggregating product data. Add new entries here as you build them.</p>
  <ul>
    <li>
      <a href="/admin/planner-analytics">Planner completion analytics</a>
      <div class="desc">
        Completion rate per step, % of users reaching 100%, median days to
        completion, and drop-off by planner stage. Includes a per-country
        breakdown and a <code>?country=</code> filter to narrow the totals
        to a single country. JSON at
        <code>/api/admin/planner-analytics</code>.
      </div>
    </li>
    <li>
      <a href="/admin/quiz-save-analytics">Quiz save-prompt analytics</a>
      <div class="desc">
        Impressions, submissions, dismissals and recovery rate for the soft
        "save your progress" modal in the quiz, split by surface (web vs
        mobile), with email-gate captures shown side-by-side so cannibalisation
        is visible. JSON at <code>/api/admin/quiz-save-analytics</code>.
      </div>
    </li>
    <li>
      <a href="/admin/auth-prompt-analytics">Auth-prompt (signup nudge) analytics</a>
      <div class="desc">
        Impressions, conversions and conversion rate for the
        <code>auth_prompt_shown</code> / <code>auth_prompt_converted</code>
        events, broken out by <code>entry_point</code> (e.g.
        <code>worksheet_list_anon</code>) with an 8-week trend. Configurable
        via <code>?days=N</code> (default 30). JSON at
        <code>/api/admin/auth-prompt-analytics</code>. Includes a PostHog
        backfill action for importing historical events that pre-date the
        local <code>auth_prompt_events</code> table.
      </div>
    </li>
    <li>
      <a href="/admin/brief-freshness">Decision Brief freshness</a>
      <div class="desc">
        Per-brief <code>lastReviewedAt</code> age, with stale (&gt;90 days)
        and approaching-stale (&gt;60 days) badges so the team can refresh
        figures before the next App Store release. Mirrors the scheduled
        weekly GitHub Action in
        <code>.github/workflows/freshness-check.yml</code>. JSON at
        <code>/api/admin/brief-freshness</code> \xB7
        <a href="/admin/brief-freshness.csv">Download CSV</a>.
      </div>
    </li>
    <li>
      <a href="/admin/ab-results">A/B test results</a>
      <div class="desc">
        Per-test table of variant-level visitors, conversions, conversion
        rate, day-0 / day-60 revenue and ARPU for the annual-price test.
        JSON at <code>/api/admin/ab-results</code> \xB7
        <a href="/admin/ab-results.csv">Download CSV</a>.
      </div>
    </li>
    <li>
      <a href="/api/_internal/analytics-health">Analytics health probe (JSON)</a>
      <div class="desc">
        In-process counter of <code>$identify</code> events that arrived
        without <code>$anon_distinct_id</code>, broken down by surface, with
        the timestamp of the most recent warning. Unauthenticated and
        designed for an external uptime check: returns HTTP 200 while
        healthy and HTTP 503 once the counter is non-zero, so any uptime
        monitor (UptimeRobot, BetterStack, etc.) can alert on the status
        code alone \u2014 no log scraping required.
      </div>
    </li>
  </ul>
</body>
</html>`;
}
function readQueryString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function readQueryNumber(value) {
  if (typeof value !== "string") return void 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function readDateRangeFromQuery(combined, start, end) {
  const fromCombined = parseDateRange(readQueryString(combined));
  if (fromCombined) return fromCombined;
  const s = readQueryString(start);
  const e = readQueryString(end);
  if (!s || !e) return null;
  return parseDateRange(`${s}..${e}`);
}
function readPlannerAnalyticsOptions(req) {
  return {
    country: readQueryString(req.query.country),
    minPlansForCountryBreakdown: readQueryNumber(req.query.minPlans),
    rangeA: readDateRangeFromQuery(
      req.query.rangeA,
      req.query.rangeAStart,
      req.query.rangeAEnd
    ),
    rangeB: readDateRangeFromQuery(
      req.query.rangeB,
      req.query.rangeBStart,
      req.query.rangeBEnd
    )
  };
}
function registerPlannerAnalyticsRoutes(app2, deps) {
  app2.get("/api/admin/planner-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req)
      );
      res.json(data);
    } catch (err) {
      console.error("Planner analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute planner analytics" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin/planner-analytics.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured");
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req)
      );
      const csv = renderPlannerAnalyticsCsv(data);
      const filenameSuffix = data.filter.country ? `-${data.filter.country.replace(/[^a-z0-9-]+/gi, "-")}` : "";
      res.type("text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planner-analytics-by-country${filenameSuffix}.csv"`
      );
      res.send(csv);
    } catch (err) {
      console.error("Planner analytics CSV error:", err?.message);
      res.status(500).type("text/plain").send("Failed to compute planner analytics");
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin/planner-analytics-comparison.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured");
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req)
      );
      if (!data.comparison) {
        res.status(400).type("text/plain").send(
          "Both rangeA and rangeB are required for the comparison CSV (e.g. ?rangeA=YYYY-MM-DD..YYYY-MM-DD&rangeB=YYYY-MM-DD..YYYY-MM-DD)"
        );
        return;
      }
      const csv = renderRangeComparisonCsv(data);
      const filenameSuffix = data.filter.country ? `-${data.filter.country.replace(/[^a-z0-9-]+/gi, "-")}` : "";
      res.type("text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planner-analytics-comparison${filenameSuffix}.csv"`
      );
      res.send(csv);
    } catch (err) {
      console.error("Planner comparison CSV error:", err?.message);
      res.status(500).type("text/plain").send("Failed to compute planner analytics");
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin/planner-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/html").send(
        renderAdminIndexHtml().replace(
          "Basic-Auth-protected dashboards aggregating product data.",
          "Database is not configured (set DATABASE_URL)."
        )
      );
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req)
      );
      res.type("text/html").send(renderPlannerAnalyticsHtml(data));
    } catch (err) {
      console.error("Planner analytics HTML error:", err?.message);
      res.status(500).type("text/html").send(
        `<h1>Planner analytics unavailable</h1><pre>${escapeHtml(
          err?.message ?? "unknown"
        )}</pre>`
      );
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin", (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    res.type("text/html").send(renderAdminIndexHtml());
  });
}

// server/routes.ts
init_quizSaveAnalytics();
init_quizSavePromptHealth();

// server/authPromptAnalytics.ts
var AUTH_PROMPT_EVENT_NAMES = [
  "auth_prompt_shown",
  "auth_prompt_converted"
];
function isAuthPromptEventName(value) {
  return typeof value === "string" && AUTH_PROMPT_EVENT_NAMES.includes(value);
}
var UNKNOWN_ENTRY_POINT = "unknown";
function extractEntryPoint(body) {
  if (!body || typeof body !== "object") return UNKNOWN_ENTRY_POINT;
  const props = body.properties;
  const raw = props && typeof props === "object" ? props.entry_point : void 0;
  if (typeof raw !== "string") return UNKNOWN_ENTRY_POINT;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return UNKNOWN_ENTRY_POINT;
  return trimmed.slice(0, 64);
}
var ensureTablePromise2 = null;
async function ensureAuthPromptEventsTable(pool) {
  if (!ensureTablePromise2) {
    ensureTablePromise2 = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_prompt_events (
           id SERIAL PRIMARY KEY,
           event VARCHAR(40) NOT NULL,
           entry_point VARCHAR(64) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`
      );
      await pool.query(
        `ALTER TABLE auth_prompt_events
           ADD COLUMN IF NOT EXISTS posthog_event_id VARCHAR(64)`
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_prompt_events_posthog_uid_idx
           ON auth_prompt_events (posthog_event_id)
         WHERE posthog_event_id IS NOT NULL`
      );
    })().catch((err) => {
      ensureTablePromise2 = null;
      throw err;
    });
  }
  await ensureTablePromise2;
}
async function recordAuthPromptEvent(pool, body) {
  if (!body || typeof body !== "object") return;
  const event = body.event;
  if (!isAuthPromptEventName(event)) return;
  const entryPoint = extractEntryPoint(body);
  const distinctId = body.distinct_id;
  await ensureAuthPromptEventsTable(pool);
  await pool.query(
    `INSERT INTO auth_prompt_events (event, entry_point, distinct_id)
     VALUES ($1, $2, $3)`,
    [event, entryPoint, typeof distinctId === "string" ? distinctId : null]
  );
}
function aggregate(rows, entryPoint) {
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
    conversionRate: shown > 0 ? converted / shown : null
  };
}
async function computeAuthPromptAnalytics(pool, options) {
  await ensureAuthPromptEventsTable(pool);
  const windowDays = Math.max(1, Math.min(365, Math.floor(options.windowDays)));
  const interval = `${windowDays} days`;
  const eventsResult = await pool.query(
    `SELECT event, entry_point, COUNT(*)::bigint AS n
       FROM auth_prompt_events
      WHERE created_at >= NOW() - $1::interval
      GROUP BY event, entry_point`,
    [interval]
  );
  const totals = aggregate(
    eventsResult.rows.map((r) => ({ event: r.event, n: r.n })),
    "all"
  );
  const entryPoints = Array.from(
    new Set(eventsResult.rows.map((r) => r.entry_point))
  );
  const byEntryPoint = entryPoints.map(
    (ep) => aggregate(
      eventsResult.rows.filter((r) => r.entry_point === ep),
      ep
    )
  ).sort((a, b) => {
    if (b.shown !== a.shown) return b.shown - a.shown;
    return a.entryPoint.localeCompare(b.entryPoint);
  });
  const weeklyResult = await pool.query(
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
      ORDER BY w.week_start ASC`
  );
  const weekly = weeklyResult.rows.map((row) => {
    const shown = Number(row.shown) || 0;
    const converted = Number(row.converted) || 0;
    return {
      weekStart: String(row.week_start),
      shown,
      converted,
      conversionRate: shown > 0 ? converted / shown : null
    };
  });
  return { windowDays, totals, byEntryPoint, weekly };
}
function escapeHtml3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtPct2(rate) {
  if (rate === null) return "\u2014";
  return `${(rate * 100).toFixed(1)}%`;
}
function fmtInt2(n) {
  return n.toLocaleString("en-US");
}
function metricsCells2(m) {
  return `
    <td style="text-align:right">${fmtInt2(m.shown)}</td>
    <td style="text-align:right">${fmtInt2(m.converted)}</td>
    <td style="text-align:right"><strong>${fmtPct2(m.conversionRate)}</strong></td>
  `;
}
function renderWeeklyChartSvg2(weeks) {
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
  const yBar = (v) => padTop + innerH - v / maxShown * innerH;
  const xCenter = (i) => padLeft + slot * (i + 0.5);
  const yRate = (r) => r === null ? null : padTop + innerH - r * innerH;
  const bars = weeks.map((w, i) => {
    const cx = xCenter(i);
    const shownTop = yBar(w.shown);
    const convertedTop = yBar(w.converted);
    const baseY = padTop + innerH;
    return `
      <g>
        <rect x="${cx - barW / 2}" y="${shownTop}" width="${barW}" height="${baseY - shownTop}" fill="#cfe1f7" rx="2"><title>${escapeHtml3(
      w.weekStart
    )}: ${fmtInt2(w.shown)} shown</title></rect>
        <rect x="${cx - barW / 2}" y="${convertedTop}" width="${barW}" height="${baseY - convertedTop}" fill="#0a66c2" rx="2"><title>${escapeHtml3(
      w.weekStart
    )}: ${fmtInt2(w.converted)} converted</title></rect>
      </g>`;
  }).join("");
  const linePoints = weeks.map((w, i) => ({
    x: xCenter(i),
    y: yRate(w.conversionRate),
    rate: w.conversionRate,
    weekStart: w.weekStart
  }));
  const segments = [];
  for (let i = 1; i < linePoints.length; i++) {
    const a = linePoints[i - 1];
    const b = linePoints[i];
    if (a.y !== null && b.y !== null) {
      segments.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d97706" stroke-width="2" />`
      );
    }
  }
  const dots = linePoints.filter((p) => p.y !== null).map(
    (p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#d97706"><title>${escapeHtml3(
      p.weekStart
    )}: ${fmtPct2(p.rate)} conversion</title></circle>`
  ).join("");
  const xLabels = weeks.map((w, i) => {
    const short = w.weekStart.slice(5);
    return `<text x="${xCenter(i)}" y="${padTop + innerH + 18}" text-anchor="middle" font-size="10" fill="#666">${escapeHtml3(short)}</text>`;
  }).join("");
  const yTicks = [0, 0.5, 1].map((frac) => {
    const y = padTop + innerH - frac * innerH;
    const count = Math.round(maxShown * frac);
    const pct = `${Math.round(frac * 100)}%`;
    return `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + innerW}" y2="${y}" stroke="#eee" stroke-width="1" />
      <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#666">${fmtInt2(count)}</text>
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
function renderWeeklyTable2(weeks) {
  const rows = weeks.map(
    (w) => `
      <tr>
        <td><code>${escapeHtml3(w.weekStart)}</code></td>
        <td style="text-align:right">${fmtInt2(w.shown)}</td>
        <td style="text-align:right">${fmtInt2(w.converted)}</td>
        <td style="text-align:right"><strong>${fmtPct2(w.conversionRate)}</strong></td>
      </tr>`
  ).join("");
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
function csvEscape2(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function fmtRateForCsv(rate) {
  if (rate === null) return "";
  return rate.toFixed(4);
}
function renderAuthPromptAnalyticsCsv(data) {
  const { windowDays, totals, byEntryPoint, weekly } = data;
  const lines = [];
  lines.push(`# Auth-prompt analytics \u2014 last ${windowDays} days`);
  lines.push("");
  lines.push("section,key,shown,converted,conversion_rate");
  for (const m of byEntryPoint) {
    lines.push(
      [
        "entry_point",
        csvEscape2(m.entryPoint),
        m.shown,
        m.converted,
        fmtRateForCsv(m.conversionRate)
      ].join(",")
    );
  }
  lines.push(
    [
      "entry_point",
      "__total__",
      totals.shown,
      totals.converted,
      fmtRateForCsv(totals.conversionRate)
    ].join(",")
  );
  for (const w of weekly) {
    lines.push(
      [
        "weekly",
        csvEscape2(w.weekStart),
        w.shown,
        w.converted,
        fmtRateForCsv(w.conversionRate)
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}
function renderAuthPromptAnalyticsHtml(data, banner = null, backfillRuns = [], freshness = null) {
  const { totals, byEntryPoint, windowDays, weekly } = data;
  const entryPointRows = byEntryPoint.length ? byEntryPoint.map(
    (m) => `
        <tr>
          <td><code>${escapeHtml3(m.entryPoint)}</code></td>
          ${metricsCells2(m)}
        </tr>`
  ).join("") : `<tr><td colspan="4" style="text-align:center;color:#888;padding:20px">No auth-prompt events in this window.</td></tr>`;
  const bannerHtml = banner ? `<div style="background:#e7f5ec;border:1px solid #b8dec5;color:#1b5e3a;padding:10px 14px;border-radius:8px;margin:12px 0;">
         PostHog backfill complete \u2014 fetched <strong>${fmtInt2(banner.fetched)}</strong>,
         inserted <strong>${fmtInt2(banner.inserted)}</strong>,
         already-present (skipped) <strong>${fmtInt2(banner.skipped)}</strong>.
       </div>` : "";
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
  <div class="nav"><a href="/admin">\u2190 Admin tools</a></div>
  <h1>Auth-prompt (signup nudge) analytics</h1>
  ${bannerHtml}
  ${renderBackfillStaleWarning(freshness)}
  ${renderBackfillHistory(backfillRuns, freshness)}
  <details style="margin:12px 0 16px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:10px 14px;">
    <summary style="cursor:pointer;font-weight:600;">Backfill from PostHog</summary>
    <p style="color:#555;font-size:13px;margin-top:8px">
      Imports historical <code>auth_prompt_shown</code> and
      <code>auth_prompt_converted</code> events from PostHog into the local
      <code>auth_prompt_events</code> table. Idempotent \u2014 events already
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
  <p>Last <strong>${windowDays}</strong> days. Conversion rate = <code>auth_prompt_converted</code> \xF7 <code>auth_prompt_shown</code>, grouped by <code>entry_point</code>.</p>

  <div class="filter">
    Window:
    ${[7, 14, 30, 60, 90].map(
    (d) => `<a href="?days=${d}" class="${d === windowDays ? "active" : ""}">${d}d</a>`
  ).join("")}
  </div>

  <h2>Weekly trend (last 8 weeks)</h2>
  <p class="desc">Always covers the most recent 8 ISO weeks (Mon\u2013Sun) regardless of the window above, so trends remain comparable as you change the filter. Bars use the left axis (counts); the line uses the right axis (conversion rate).</p>
  ${renderWeeklyChartSvg2(weekly)}
  ${renderWeeklyTable2(weekly)}

  <h2>Conversion by entry point</h2>
  <p class="desc">
    Each row is a unique <code>entry_point</code> value as fired from
    <code>app/auth.tsx</code> (e.g. <code>worksheet_list_anon</code>,
    <code>worksheet_detail_anon</code>). Events that arrived without an
    entry_point bucket into <code>${escapeHtml3(UNKNOWN_ENTRY_POINT)}</code>.
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
      <tr><td><strong>Total</strong></td>${metricsCells2(totals)}</tr>
    </tbody>
  </table>

  <p style="margin-top:24px;color:#888;font-size:12px">
    JSON: <code>/api/admin/auth-prompt-analytics?days=${windowDays}</code>
    \xB7 <a href="/admin/auth-prompt-analytics.csv?days=${windowDays}">Download CSV</a>
  </p>
</body>
</html>`;
}
function readWindowDays2(req) {
  const raw = req.query.days;
  if (typeof raw !== "string") return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, n);
}
var PostHogBackfillConfigError2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PostHogBackfillConfigError";
  }
};
function buildHogQLQuery2(since, limit, offset) {
  const sinceClause = since ? ` AND timestamp >= toDateTime('${since.replace(/'/g, "")}')` : "";
  return `SELECT uuid, event, timestamp, properties.entry_point AS entry_point, distinct_id FROM events WHERE event IN ('auth_prompt_shown', 'auth_prompt_converted')${sinceClause} ORDER BY timestamp ASC, uuid ASC LIMIT ${limit} OFFSET ${offset}`;
}
function normalizeEntryPointRaw(value) {
  if (typeof value !== "string") return UNKNOWN_ENTRY_POINT;
  const trimmed = value.trim();
  if (trimmed.length === 0) return UNKNOWN_ENTRY_POINT;
  return trimmed.slice(0, 64);
}
async function backfillAuthPromptEventsFromPostHog(pool, options = {}) {
  const host = options.posthogHost ?? process.env.POSTHOG_HOST ?? "https://us.posthog.com";
  const projectId = options.posthogProjectId ?? process.env.POSTHOG_PROJECT_ID ?? "";
  const apiKey = options.posthogApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY ?? "";
  if (!projectId || !apiKey) {
    throw new PostHogBackfillConfigError2(
      "PostHog backfill requires POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY"
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = Math.max(1, Math.min(1e4, options.pageSize ?? 1e3));
  const maxRows = Math.max(pageSize, options.maxRows ?? 2e5);
  const since = options.since ?? null;
  await ensureAuthPromptEventsTable(pool);
  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(
    projectId
  )}/query/`;
  const summary = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    pages: 0,
    firstEventAt: null,
    lastEventAt: null
  };
  let offset = 0;
  while (summary.fetched < maxRows) {
    const limit = Math.min(pageSize, maxRows - summary.fetched);
    const body = {
      query: { kind: "HogQLQuery", query: buildHogQLQuery2(since, limit, offset) }
    };
    const resp = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `PostHog query failed: ${resp.status} ${resp.statusText} ${text.slice(0, 200)}`
      );
    }
    const payload = await resp.json();
    const rows = Array.isArray(payload.results) ? payload.results : [];
    summary.pages += 1;
    if (rows.length === 0) break;
    for (const row of rows) {
      const [uuidRaw, eventRaw, timestampRaw, entryPointRaw, distinctIdRaw] = row;
      if (typeof uuidRaw !== "string" || uuidRaw.length === 0) continue;
      if (!isAuthPromptEventName(eventRaw)) continue;
      const tsDate = typeof timestampRaw === "string" || typeof timestampRaw === "number" ? new Date(timestampRaw) : timestampRaw instanceof Date ? timestampRaw : null;
      if (!tsDate || Number.isNaN(tsDate.getTime())) continue;
      const entryPoint = normalizeEntryPointRaw(entryPointRaw);
      const distinctId = typeof distinctIdRaw === "string" && distinctIdRaw.length > 0 ? distinctIdRaw.slice(0, 255) : null;
      const uuid = uuidRaw.slice(0, 64);
      const ins = await pool.query(
        `INSERT INTO auth_prompt_events
           (event, entry_point, distinct_id, created_at, posthog_event_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (posthog_event_id)
           WHERE posthog_event_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [eventRaw, entryPoint, distinctId, tsDate, uuid]
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
  try {
    await recordAuthPromptBackfillRun(pool, summary, since);
  } catch (recordErr) {
    console.error(
      "Failed to record auth-prompt backfill run:",
      recordErr?.message
    );
  }
  return summary;
}
var ensureRunsTablePromise2 = null;
async function ensureAuthPromptBackfillRunsTable(pool) {
  if (!ensureRunsTablePromise2) {
    ensureRunsTablePromise2 = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_prompt_backfill_runs (
           id SERIAL PRIMARY KEY,
           ran_at TIMESTAMP NOT NULL DEFAULT NOW(),
           fetched INTEGER NOT NULL DEFAULT 0,
           inserted INTEGER NOT NULL DEFAULT 0,
           skipped INTEGER NOT NULL DEFAULT 0,
           since_value VARCHAR(64)
         )`
      );
    })().catch((err) => {
      ensureRunsTablePromise2 = null;
      throw err;
    });
  }
  await ensureRunsTablePromise2;
}
async function recordAuthPromptBackfillRun(pool, summary, since) {
  await ensureAuthPromptBackfillRunsTable(pool);
  const sinceValue = since && since.trim().length > 0 ? since.trim().slice(0, 64) : null;
  await pool.query(
    `INSERT INTO auth_prompt_backfill_runs
       (fetched, inserted, skipped, since_value)
     VALUES ($1, $2, $3, $4)`,
    [summary.fetched, summary.inserted, summary.skipped, sinceValue]
  );
}
async function getRecentAuthPromptBackfillRuns(pool, limit = 5) {
  await ensureAuthPromptBackfillRunsTable(pool);
  const capped = Math.max(1, Math.min(50, Math.floor(limit)));
  const result = await pool.query(
    `SELECT id, ran_at, fetched, inserted, skipped, since_value
       FROM auth_prompt_backfill_runs
      ORDER BY ran_at DESC, id DESC
      LIMIT $1`,
    [capped]
  );
  return result.rows.map((row) => {
    const ranAt = row.ran_at instanceof Date ? row.ran_at.toISOString() : new Date(String(row.ran_at)).toISOString();
    return {
      id: Number(row.id),
      ranAt,
      fetched: Number(row.fetched) || 0,
      inserted: Number(row.inserted) || 0,
      skipped: Number(row.skipped) || 0,
      since: row.since_value ?? null
    };
  });
}
var DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = 14;
function getAuthPromptBackfillStaleThresholdDays() {
  const raw = process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
  if (raw == null || raw.trim() === "") {
    return DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
  }
  return n;
}
function computeBackfillFreshness(latestRanAt, now, thresholdDays) {
  const threshold = thresholdDays > 0 ? thresholdDays : DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
  const ranMs = latestRanAt ? new Date(latestRanAt).getTime() : NaN;
  if (!latestRanAt || !Number.isFinite(ranMs)) {
    return {
      hasRun: false,
      lastRanAt: null,
      ageMs: null,
      ageDays: null,
      thresholdDays: threshold,
      stale: false
    };
  }
  const ageMs = Math.max(0, now.getTime() - ranMs);
  const ageDays = ageMs / (24 * 60 * 60 * 1e3);
  return {
    hasRun: true,
    lastRanAt: latestRanAt,
    ageMs,
    ageDays,
    thresholdDays: threshold,
    stale: ageDays > threshold
  };
}
async function getAuthPromptBackfillFreshness(pool, opts = {}) {
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const thresholdDays = opts.thresholdDays ?? getAuthPromptBackfillStaleThresholdDays();
  const runs = await getRecentAuthPromptBackfillRuns(pool, 1);
  const latest = runs.length > 0 ? runs[0].ranAt : null;
  return computeBackfillFreshness(latest, now(), thresholdDays);
}
function renderBackfillStaleWarning(freshness) {
  if (!freshness || !freshness.stale) return "";
  const age = freshness.ageDays != null ? freshness.ageDays.toFixed(1) : "unknown";
  return `
  <div style="background:#fdecea;border:1px solid #f5c2bd;color:#8a1c10;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;">
    <strong>Backfill is stale.</strong> The last PostHog reconciliation ran
    <strong>${escapeHtml3(age)}</strong> days ago, beyond the
    <strong>${escapeHtml3(String(freshness.thresholdDays))}</strong>-day
    threshold. The scheduled self-heal may be broken \u2014 check the workflow log
    and PostHog credentials.
  </div>`;
}
function renderBackfillHistory(runs, freshness = null) {
  if (runs.length === 0) {
    return `
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;margin:12px 0;color:#555;font-size:13px;">
    No PostHog backfill has run yet. Use the form above to import historical events.
  </div>`;
  }
  const [latest, ...rest] = runs;
  const latestRanAt = escapeHtml3(latest.ranAt);
  const latestSince = latest.since ? ` (since <code>${escapeHtml3(latest.since)}</code>)` : " (full history)";
  const historyRows = rest.map(
    (run) => `
      <tr>
        <td><code>${escapeHtml3(run.ranAt)}</code></td>
        <td>${run.since ? `<code>${escapeHtml3(run.since)}</code>` : '<span style="color:#888">full history</span>'}</td>
        <td style="text-align:right">${fmtInt2(run.fetched)}</td>
        <td style="text-align:right">${fmtInt2(run.inserted)}</td>
        <td style="text-align:right">${fmtInt2(run.skipped)}</td>
      </tr>`
  ).join("");
  const historyTable = rest.length > 0 ? `
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
    </details>` : "";
  return `
  <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;margin:12px 0;">
    <div style="font-size:13px;color:#555;">
      Last PostHog backfill: <strong><time datetime="${latestRanAt}">${latestRanAt}</time></strong>${latestSince}
      \u2014 fetched <strong>${fmtInt2(latest.fetched)}</strong>,
      inserted <strong>${fmtInt2(latest.inserted)}</strong>,
      skipped <strong>${fmtInt2(latest.skipped)}</strong>.
    </div>
    ${historyTable}
  </div>`;
}
function registerAuthPromptAnalyticsRoutes(app2, deps) {
  app2.get("/api/admin/auth-prompt-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeAuthPromptAnalytics(pool, {
        windowDays: readWindowDays2(req)
      });
      res.json(data);
    } catch (err) {
      console.error("Auth-prompt analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute auth-prompt analytics" });
    } finally {
      await pool.end();
    }
  });
  const sendCsv = async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured (set DATABASE_URL).");
      return;
    }
    try {
      const windowDays = readWindowDays2(req);
      const data = await computeAuthPromptAnalytics(pool, { windowDays });
      const filename = `auth-prompt-analytics-${windowDays}d.csv`;
      res.type("text/csv; charset=utf-8").setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      ).send(renderAuthPromptAnalyticsCsv(data));
    } catch (err) {
      console.error("Auth-prompt analytics CSV error:", err?.message);
      res.status(500).type("text/plain").send(`Failed to compute auth-prompt analytics: ${err?.message ?? "unknown"}`);
    } finally {
      await pool.end();
    }
  };
  app2.get("/admin/auth-prompt-analytics.csv", sendCsv);
  app2.post("/api/admin/auth-prompt-analytics/backfill", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const sinceRaw = typeof req.query.since === "string" && req.query.since || (req.body && typeof req.body.since === "string" ? req.body.since : "");
    const since = sinceRaw && sinceRaw.trim().length > 0 ? sinceRaw.trim() : null;
    try {
      const summary = await backfillAuthPromptEventsFromPostHog(pool, { since });
      const wantsHtml = typeof req.headers.accept === "string" && req.headers.accept.includes("text/html");
      if (wantsHtml) {
        const params = new URLSearchParams({
          backfill: "ok",
          fetched: String(summary.fetched),
          inserted: String(summary.inserted),
          skipped: String(summary.skipped)
        });
        res.redirect(`/admin/auth-prompt-analytics?${params.toString()}`);
        return;
      }
      res.json(summary);
    } catch (err) {
      console.error("Auth-prompt backfill error:", err?.message);
      const status = err instanceof PostHogBackfillConfigError2 ? 400 : 500;
      res.status(status).json({
        error: err?.message ?? "Failed to backfill auth-prompt events"
      });
    } finally {
      await pool.end();
    }
  });
  app2.get("/admin/auth-prompt-analytics", async (req, res) => {
    if (req.query.format === "csv") {
      await sendCsv(req, res);
      return;
    }
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/html").send(
        `<h1>Auth-prompt analytics unavailable</h1><p>Database is not configured (set <code>DATABASE_URL</code>).</p>`
      );
      return;
    }
    try {
      const data = await computeAuthPromptAnalytics(pool, {
        windowDays: readWindowDays2(req)
      });
      const banner = req.query.backfill === "ok" ? {
        fetched: Number(req.query.fetched) || 0,
        inserted: Number(req.query.inserted) || 0,
        skipped: Number(req.query.skipped) || 0
      } : null;
      let recentRuns = [];
      let freshness = null;
      try {
        recentRuns = await getRecentAuthPromptBackfillRuns(pool, 5);
        freshness = computeBackfillFreshness(
          recentRuns.length > 0 ? recentRuns[0].ranAt : null,
          /* @__PURE__ */ new Date(),
          getAuthPromptBackfillStaleThresholdDays()
        );
      } catch (runsErr) {
        console.error(
          "Failed to load auth-prompt backfill run history:",
          runsErr?.message
        );
      }
      res.type("text/html").send(renderAuthPromptAnalyticsHtml(data, banner, recentRuns, freshness));
    } catch (err) {
      console.error("Auth-prompt analytics HTML error:", err?.message);
      res.status(500).type("text/html").send(
        `<h1>Auth-prompt analytics unavailable</h1><pre>${escapeHtml3(
          err?.message ?? "unknown"
        )}</pre>`
      );
    } finally {
      await pool.end();
    }
  });
}

// server/briefFreshness.ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// src/data/freshnessThresholds.mjs
var WARN_THRESHOLD_DAYS = 60;
var STALE_THRESHOLD_DAYS = 90;

// src/data/extractBriefs.mjs
function extractBriefs(source) {
  const arrayStart = source.indexOf("const BRIEFS");
  if (arrayStart < 0) return [];
  const eqIdx = source.indexOf("=", arrayStart);
  if (eqIdx < 0) return [];
  const openBracket = source.indexOf("[", eqIdx);
  if (openBracket < 0) return [];
  const fieldRe = /([A-Za-z_$][\w$]*)\s*:\s*"((?:[^"\\]|\\.)*)"/y;
  const briefs = [];
  let depth = 0;
  let current = null;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openBracket; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === stringChar) {
        inString = false;
      }
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      depth++;
      if (depth === 2 && c === "{") {
        current = {
          id: null,
          countrySlug: null,
          pathwayKey: null,
          lastReviewedAt: null
        };
      }
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      if (depth === 2 && c === "}") {
        if (current && current.id !== null && current.lastReviewedAt !== null) {
          briefs.push(current);
        }
        current = null;
      }
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 2 && current) {
      fieldRe.lastIndex = i;
      const m = fieldRe.exec(source);
      if (m) {
        const key = m[1];
        const value = m[2];
        if (key === "id" && current.id === null) current.id = value;
        else if (key === "countrySlug" && current.countrySlug === null)
          current.countrySlug = value;
        else if (key === "pathwayKey" && current.pathwayKey === null)
          current.pathwayKey = value;
        else if (key === "lastReviewedAt" && current.lastReviewedAt === null)
          current.lastReviewedAt = value;
        i = fieldRe.lastIndex - 1;
        continue;
      }
    }
  }
  return briefs;
}

// server/briefFreshness.ts
var BRIEFS_PATH = resolve(process.cwd(), "src", "data", "decisionBriefs.ts");
function daysSince(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1e3 * 60 * 60 * 24));
}
function classify(days) {
  if (days === null) return "invalid";
  if (days > STALE_THRESHOLD_DAYS) return "stale";
  if (days > WARN_THRESHOLD_DAYS) return "warn";
  return "fresh";
}
async function buildFreshnessReport() {
  const source = await readFile(BRIEFS_PATH, "utf8");
  const raw = extractBriefs(source);
  const allBriefs = raw.map((b) => {
    const ageDays = daysSince(b.lastReviewedAt);
    return { ...b, ageDays, status: classify(ageDays) };
  });
  const staleBriefs = allBriefs.filter((b) => b.status === "stale").sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const warnBriefs = allBriefs.filter((b) => b.status === "warn").sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    staleThresholdDays: STALE_THRESHOLD_DAYS,
    warnThresholdDays: WARN_THRESHOLD_DAYS,
    totalBriefs: allBriefs.length,
    staleCount: staleBriefs.length,
    warnCount: warnBriefs.length,
    staleBriefs,
    warnBriefs,
    allBriefs
  };
}
function escapeHtml4(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function csvEscape3(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function renderFreshnessCsv(report) {
  const sections = [];
  sections.push([`# Decision Brief freshness \u2014 generated ${report.generatedAt}`]);
  sections.push([
    "section,metric,value",
    `summary,total_briefs,${report.totalBriefs}`,
    `summary,stale_count,${report.staleCount}`,
    `summary,warn_count,${report.warnCount}`,
    `summary,stale_threshold_days,${report.staleThresholdDays}`,
    `summary,warn_threshold_days,${report.warnThresholdDays}`
  ]);
  const sorted = [...report.allBriefs].sort(
    (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)
  );
  const briefLines = [
    "section,id,country,pathway,last_reviewed,age_days,status"
  ];
  for (const b of sorted) {
    briefLines.push(
      [
        "brief",
        csvEscape3(b.id),
        csvEscape3(b.countrySlug ?? ""),
        csvEscape3(b.pathwayKey ?? ""),
        csvEscape3(b.lastReviewedAt),
        b.ageDays ?? "",
        csvEscape3(b.status)
      ].join(",")
    );
  }
  sections.push(briefLines);
  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}
function renderRow(b) {
  const status = b.status === "stale" ? "\u{1F534}" : b.status === "warn" ? "\u{1F7E1}" : b.status === "invalid" ? "\u26A0\uFE0F" : "\u{1F7E2}";
  return `<tr>
    <td>${status}</td>
    <td><code>${escapeHtml4(b.id)}</code></td>
    <td>${escapeHtml4(b.countrySlug ?? "-")}</td>
    <td>${escapeHtml4(b.pathwayKey ?? "-")}</td>
    <td>${escapeHtml4(b.lastReviewedAt)}</td>
    <td style="text-align:right">${b.ageDays ?? "?"}</td>
  </tr>`;
}
function renderFreshnessHtml(report) {
  const sorted = [...report.allBriefs].sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const rows = sorted.map(renderRow).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Decision Brief freshness</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 1080px; color: #111; background: #fafafa; }
    h1 { margin: 0 0 8px; }
    .nav { margin-bottom: 16px; }
    .summary { display: flex; gap: 16px; margin: 16px 0; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; flex: 1; }
    .card .label { color: #666; font-size: 12px; text-transform: uppercase; }
    .card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .card.stale .value { color: #c0392b; }
    .card.warn .value { color: #b9770e; }
    table { width: 100%; border-collapse: collapse; background: #fff;
      border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    th { background: #f7f7f7; font-weight: 600; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .meta { color: #666; margin-top: 16px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">\u2190 Admin tools</a></div>
  <h1>Decision Brief freshness</h1>
  <p>Briefs with <code>lastReviewedAt</code> older than ${report.staleThresholdDays} days are stale and should be refreshed before the next App Store release.</p>
  <div class="summary">
    <div class="card"><div class="label">Total briefs</div><div class="value">${report.totalBriefs}</div></div>
    <div class="card stale"><div class="label">Stale (&gt;${report.staleThresholdDays}d)</div><div class="value">${report.staleCount}</div></div>
    <div class="card warn"><div class="label">Approaching (&gt;${report.warnThresholdDays}d)</div><div class="value">${report.warnCount}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th></th><th>Brief ID</th><th>Country</th><th>Pathway</th><th>Last reviewed</th><th style="text-align:right">Age (days)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="meta">Report generated ${escapeHtml4(report.generatedAt)}. JSON at <code>/api/admin/brief-freshness</code> \xB7 <a href="/admin/brief-freshness.csv">Download CSV</a>.</div>
</body>
</html>`;
}
function registerBriefFreshnessRoutes(app2, deps) {
  app2.get("/api/admin/brief-freshness", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res.json(report);
    } catch (err) {
      console.error("Brief freshness JSON error:", err?.message);
      res.status(500).json({ error: "Failed to build freshness report" });
    }
  });
  app2.get("/admin/brief-freshness.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res.type("text/csv; charset=utf-8").setHeader(
        "Content-Disposition",
        'attachment; filename="brief-freshness.csv"'
      ).send(renderFreshnessCsv(report));
    } catch (err) {
      console.error("Brief freshness CSV error:", err?.message);
      res.status(500).type("text/plain").send(`Failed to build freshness report: ${err?.message ?? "unknown"}`);
    }
  });
  app2.get("/admin/brief-freshness", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res.type("text/html").send(renderFreshnessHtml(report));
    } catch (err) {
      console.error("Brief freshness HTML error:", err?.message);
      res.status(500).type("text/html").send(`<h1>Freshness report unavailable</h1><pre>${escapeHtml4(String(err?.message ?? err))}</pre>`);
    }
  });
}

// src/data/worksheets.ts
var SCALE_OPTIONS_HELPER = "1 = not at all, 5 = completely";
function scaleQ(id, text, weight = 1, helper = SCALE_OPTIONS_HELPER) {
  return { id, text, type: "scale", weight, helper };
}
function choiceQ(id, text, options, weight = 1) {
  return { id, text, type: "choice", weight, options };
}
var WORKSHEETS = [
  {
    id: "ws_financial_cushion",
    questionId: 1,
    dimension: "Financial Cushion",
    title: "Your financial cushion",
    description: "A short check on the savings buffer you have to land safely in your new country.",
    questions: [
      choiceQ(
        "savings_months",
        "Roughly how many months of living expenses do you have saved?",
        [
          { label: "Less than 3 months", value: "lt3", score: 0 },
          { label: "3 to 6 months", value: "3to6", score: 0.5 },
          { label: "6 to 12 months", value: "6to12", score: 0.85 },
          { label: "12 months or more", value: "gt12", score: 1 }
        ],
        1.5
      ),
      scaleQ(
        "expenses_priced",
        "How well have you priced out monthly expenses in your target country?",
        1
      ),
      scaleQ(
        "comfort_drawdown",
        "How comfortable are you using savings during the first months abroad?",
        0.75
      )
    ]
  },
  {
    id: "ws_income_stability",
    questionId: 2,
    dimension: "Income Stability",
    title: "Your income stability",
    description: "Where your income comes from once you arrive matters as much as how much it is.",
    questions: [
      choiceQ(
        "income_portability",
        "Is your income portable to your destination country?",
        [
          { label: "Fully remote and portable", value: "remote", score: 1 },
          { label: "Partially portable", value: "partial", score: 0.6 },
          { label: "Looking for work there", value: "looking", score: 0.25 },
          { label: "Not portable today", value: "no", score: 0 }
        ],
        1.5
      ),
      choiceQ(
        "income_tenure",
        "How long has your current income source been stable?",
        [
          { label: "Less than 6 months", value: "lt6", score: 0.25 },
          { label: "6 to 12 months", value: "6to12", score: 0.5 },
          { label: "1 to 3 years", value: "1to3", score: 0.8 },
          { label: "3 years or more", value: "gt3", score: 1 }
        ],
        1
      ),
      scaleQ(
        "backup_income",
        "Do you have a backup income source if the primary one falls through?"
      )
    ]
  },
  {
    id: "ws_visa_pathway",
    questionId: 3,
    dimension: "Visa Pathway",
    title: "Your visa pathway",
    description: "Clarity on the legal route is usually the difference between dreaming and moving.",
    questions: [
      choiceQ(
        "pathway_identified",
        "Have you identified a specific visa category for yourself?",
        [
          { label: "Yes, a specific one", value: "yes", score: 1 },
          { label: "Narrowed to two or three", value: "narrowed", score: 0.6 },
          { label: "Still exploring", value: "exploring", score: 0.25 },
          { label: "Not yet", value: "no", score: 0 }
        ],
        1.5
      ),
      scaleQ(
        "requirements_met",
        "How well do you meet that visa's requirements today?",
        1.25
      ),
      scaleQ(
        "documents_ready",
        "How complete are the documents that visa requires?",
        1
      )
    ]
  },
  {
    id: "ws_bureaucracy",
    questionId: 4,
    dimension: "Bureaucracy Comfort",
    title: "Your comfort with bureaucracy",
    description: "Relocations involve a lot of forms. Knowing your tolerance helps you plan support.",
    questions: [
      scaleQ(
        "paperwork_comfort",
        "How comfortable are you handling government paperwork in another language?"
      ),
      choiceQ(
        "international_experience",
        "Have you dealt with international bureaucracy before?",
        [
          { label: "Yes, many times", value: "often", score: 1 },
          { label: "Once or twice", value: "few", score: 0.6 },
          { label: "Not yet", value: "no", score: 0.2 }
        ],
        1
      ),
      choiceQ(
        "willing_to_hire",
        "Are you willing to hire a relocation lawyer or consultant?",
        [
          { label: "Yes, planning to", value: "yes", score: 1 },
          { label: "Maybe, depending on cost", value: "maybe", score: 0.6 },
          { label: "Prefer to handle it myself", value: "no", score: 0.4 }
        ],
        0.75
      )
    ]
  },
  {
    id: "ws_family_alignment",
    questionId: 5,
    dimension: "Family Alignment",
    title: "Family and household alignment",
    description: "Even a perfect plan stalls if the people moving with you are not on board.",
    questions: [
      choiceQ(
        "partner_aligned",
        "Is your partner or household aligned on the move?",
        [
          { label: "Fully aligned", value: "full", score: 1 },
          { label: "Mostly aligned", value: "mostly", score: 0.7 },
          { label: "Mixed feelings", value: "mixed", score: 0.35 },
          { label: "Not aligned", value: "no", score: 0 },
          { label: "Not applicable", value: "na", score: 1 }
        ],
        1.5
      ),
      scaleQ(
        "kids_planned",
        "Have schooling and childcare been discussed in detail?",
        1
      ),
      scaleQ(
        "elders_considered",
        "Have you accounted for aging parents or other dependents?",
        0.75
      )
    ]
  },
  {
    id: "ws_lifestyle",
    questionId: 6,
    dimension: "Lifestyle Fit",
    title: "Lifestyle and cultural fit",
    description: "How well daily life will match what you actually enjoy and need.",
    questions: [
      scaleQ(
        "daily_life_clarity",
        "How clear are you on what daily life will look like there?"
      ),
      choiceQ(
        "in_country_time",
        "Have you spent meaningful time in the country?",
        [
          { label: "Lived there before", value: "lived", score: 1 },
          { label: "Visited multiple times", value: "multi", score: 0.8 },
          { label: "Visited once", value: "once", score: 0.5 },
          { label: "Never been", value: "never", score: 0.1 }
        ],
        1.25
      ),
      scaleQ(
        "culture_adaptable",
        "How adaptable are you to a different culture and climate?"
      )
    ]
  },
  {
    id: "ws_backup_plan",
    questionId: 7,
    dimension: "Backup Plan",
    title: "Your backup plan",
    description: "A clear-eyed look at what happens if the move does not work out.",
    questions: [
      choiceQ(
        "return_plan",
        "Do you have a return-home plan if the move does not work out?",
        [
          { label: "Yes, clearly mapped", value: "yes", score: 1 },
          { label: "Partial / loose plan", value: "partial", score: 0.5 },
          { label: "No plan yet", value: "no", score: 0 }
        ],
        1.25
      ),
      scaleQ(
        "ties_kept",
        "How much will you keep at home (lease, address, banking)?",
        0.75
      ),
      scaleQ(
        "return_funded",
        "Do you have funds set aside for a possible return move?"
      )
    ]
  },
  {
    id: "ws_timeline",
    questionId: 8,
    dimension: "Timeline",
    title: "Your timeline",
    description: "How firm and realistic the dates are that you are working toward.",
    questions: [
      choiceQ(
        "date_firmness",
        "How firm is your move date?",
        [
          { label: "Locked in", value: "locked", score: 1 },
          { label: "Tentative date", value: "tentative", score: 0.7 },
          { label: "Range only", value: "range", score: 0.4 },
          { label: "No date yet", value: "none", score: 0.1 }
        ],
        1.5
      ),
      scaleQ(
        "milestones_set",
        "Do you have intermediate milestones set between now and your move?",
        1
      ),
      scaleQ(
        "timeline_realism",
        "How realistic is your timeline given the visa process you need?",
        1
      )
    ]
  }
];
var WORKSHEET_BY_ID = Object.fromEntries(WORKSHEETS.map((w) => [w.id, w]));
var WORKSHEET_BY_QUESTION_ID = Object.fromEntries(WORKSHEETS.map((w) => [w.questionId, w]));
function scoreWorksheet(worksheet, answers) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const q of worksheet.questions) {
    const raw = answers[q.id];
    if (raw === void 0 || raw === null || raw === "") return null;
    let normalized = null;
    if (q.type === "scale") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 5) return null;
      normalized = (n - 1) / 4;
    } else if (q.type === "choice") {
      const picked = q.options?.find((o) => o.value === String(raw));
      if (!picked) return null;
      normalized = Math.max(0, Math.min(1, picked.score));
    }
    if (normalized === null) return null;
    weightedSum += normalized * q.weight;
    totalWeight += q.weight;
  }
  if (totalWeight <= 0) return null;
  const score = 3 * (weightedSum / totalWeight);
  return Math.max(0, Math.min(3, Math.round(score * 100) / 100));
}
function validateAnswersShape(worksheet, answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const out = {};
  for (const q of worksheet.questions) {
    const raw = answers[q.id];
    if (raw === void 0 || raw === null) return null;
    if (q.type === "scale") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 5) return null;
      out[q.id] = n;
    } else if (q.type === "choice") {
      const v = String(raw);
      if (!q.options?.some((o) => o.value === v)) return null;
      out[q.id] = v;
    }
  }
  return out;
}

// server/routes.ts
var PRICING_VARIANT_COOKIE = "eh_sid";
var TEST_ANNUAL_PRICE = "annual_price_test";
function annualPriceEnabled() {
  return process.env.ENABLE_ANNUAL_PRICE_TEST === "1" || process.env.ENABLE_ANNUAL_PRICE_TEST === "true";
}
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}
function setSessionCookie(res, sessionId) {
  const oneYear = 60 * 60 * 24 * 365;
  res.appendHeader(
    "Set-Cookie",
    `${PRICING_VARIANT_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
  );
}
function pickAnnualVariant() {
  if (!annualPriceEnabled()) return "annual_89";
  return Math.random() < 0.5 ? "annual_89" : "annual_99";
}
var abTablesEnsured = false;
async function ensureAbTables(pool) {
  if (abTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ab_test_assignments (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(255),
      test_name VARCHAR(100) NOT NULL,
      variant VARCHAR(50) NOT NULL,
      assigned_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ab_test_assignments_session_test_idx
      ON ab_test_assignments (session_id, test_name)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(255),
      test_name VARCHAR(100) NOT NULL,
      variant VARCHAR(50) NOT NULL,
      plan VARCHAR(50),
      converted BOOLEAN DEFAULT FALSE,
      revenue_day_0 NUMERIC(10,2) DEFAULT 0,
      revenue_day_60 NUMERIC(10,2) DEFAULT 0,
      stripe_subscription_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  abTablesEnsured = true;
}
async function computeAbResults(pool, windowDays) {
  await ensureAbTables(pool);
  const windowed = typeof windowDays === "number";
  const result = windowed ? await pool.query(
    `
    SELECT
      a.test_name,
      a.variant,
      COUNT(DISTINCT a.session_id)::int AS visitors,
      COUNT(DISTINCT CASE WHEN c.converted THEN a.session_id END)::int AS conversions,
      COALESCE(SUM(c.revenue_day_0), 0)::float  AS revenue_day_0,
      COALESCE(SUM(c.revenue_day_60), 0)::float AS revenue_day_60
    FROM ab_test_assignments a
    LEFT JOIN conversions c
      ON c.session_id = a.session_id
     AND c.test_name  = a.test_name
     AND c.created_at >= NOW() - $1::interval
    WHERE a.assigned_at >= NOW() - $1::interval
    GROUP BY a.test_name, a.variant
    ORDER BY a.test_name, a.variant
  `,
    [`${windowDays} days`]
  ) : await pool.query(`
    SELECT
      a.test_name,
      a.variant,
      COUNT(DISTINCT a.session_id)::int AS visitors,
      COUNT(DISTINCT CASE WHEN c.converted THEN a.session_id END)::int AS conversions,
      COALESCE(SUM(c.revenue_day_0), 0)::float  AS revenue_day_0,
      COALESCE(SUM(c.revenue_day_60), 0)::float AS revenue_day_60
    FROM ab_test_assignments a
    LEFT JOIN conversions c
      ON c.session_id = a.session_id
     AND c.test_name  = a.test_name
    GROUP BY a.test_name, a.variant
    ORDER BY a.test_name, a.variant
  `);
  const tests = {};
  for (const row of result.rows) {
    const visitors = Number(row.visitors) || 0;
    const conversions = Number(row.conversions) || 0;
    const r0 = Number(row.revenue_day_0) || 0;
    const r60 = Number(row.revenue_day_60) || 0;
    if (!tests[row.test_name]) tests[row.test_name] = [];
    tests[row.test_name].push({
      variant: row.variant,
      visitors,
      conversions,
      conversion_rate: visitors > 0 ? conversions / visitors : 0,
      revenue_day_0: r0,
      revenue_day_60: r60,
      arpu_day_60: visitors > 0 ? r60 / visitors : 0
    });
  }
  return {
    flags: { annual_price_enabled: annualPriceEnabled() },
    windowDays: windowed ? windowDays : null,
    tests
  };
}
function abCsvEscape(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function renderAbResultsCsv(data) {
  const sections = [];
  const windowNote = data.windowDays === null ? "all time" : `last ${data.windowDays} days`;
  sections.push([`# A/B test results (${windowNote})`]);
  sections.push([
    "section,key,value",
    `flags,annual_price_enabled,${data.flags.annual_price_enabled}`,
    `window,days,${data.windowDays === null ? "all" : data.windowDays}`
  ]);
  const variantLines = [
    "section,test,variant,visitors,conversions,conversion_rate,revenue_day_0,revenue_day_60,arpu_day_60"
  ];
  for (const testName of Object.keys(data.tests)) {
    for (const v of data.tests[testName]) {
      variantLines.push(
        [
          "variant",
          abCsvEscape(testName),
          abCsvEscape(v.variant),
          v.visitors,
          v.conversions,
          v.conversion_rate.toFixed(4),
          v.revenue_day_0.toFixed(2),
          v.revenue_day_60.toFixed(2),
          v.arpu_day_60.toFixed(2)
        ].join(",")
      );
    }
  }
  sections.push(variantLines);
  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}
function abHtmlEscape(value) {
  if (value === null || value === void 0) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderAbResultsHtml(data) {
  const testNames = Object.keys(data.tests);
  const usd = (n) => `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
  const tablesHtml = testNames.length === 0 ? `<p class="empty">No A/B test assignments recorded yet.</p>` : testNames.map((testName) => {
    const variants = data.tests[testName];
    const rows = variants.map(
      (v) => `
        <tr>
          <td><code>${abHtmlEscape(v.variant)}</code></td>
          <td class="num">${v.visitors.toLocaleString()}</td>
          <td class="num">${v.conversions.toLocaleString()}</td>
          <td class="num">${(v.conversion_rate * 100).toFixed(2)}%</td>
          <td class="num">${usd(v.revenue_day_0)}</td>
          <td class="num">${usd(v.revenue_day_60)}</td>
          <td class="num">${usd(v.arpu_day_60)}</td>
        </tr>`
    ).join("");
    return `
    <section class="card">
      <h2><code>${abHtmlEscape(testName)}</code></h2>
      <table>
        <thead>
          <tr>
            <th>Variant</th>
            <th class="num">Visitors</th>
            <th class="num">Conversions</th>
            <th class="num">Conv. rate</th>
            <th class="num">Revenue (day 0)</th>
            <th class="num">Revenue (day 60)</th>
            <th class="num">ARPU (day 60)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>A/B test results \u2014 ExpatHub Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 960px; color: #111; background: #fafafa;
    }
    h1 { margin: 0 0 8px; }
    a { color: #0a66c2; }
    .nav { margin: 0 0 16px; color: #555; }
    .nav a { margin-right: 12px; }
    .flags { color: #555; margin: 0 0 16px; }
    .card {
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 16px; margin-bottom: 16px;
    }
    .card h2 { margin: 0 0 12px; font-size: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; }
    th { color: #444; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .empty { color: #666; }
  </style>
</head>
<body>
  <h1>A/B test results</h1>
  <p class="nav">
    <a href="/admin">&larr; Admin index</a>
    <a href="/admin/ab-results.csv">Download CSV</a>
    <a href="/api/admin/ab-results">JSON</a>
  </p>
  <p class="flags">
    Flags: <code>annual_price_enabled = ${data.flags.annual_price_enabled}</code>
  </p>
  ${tablesHtml}
</body>
</html>`;
}
async function getOrAssignVariants(req, res) {
  const cookies = parseCookies(req);
  let sessionId = cookies[PRICING_VARIANT_COOKIE];
  let isNew = false;
  if (!sessionId || sessionId.length < 8 || sessionId.length > 64) {
    sessionId = randomUUID();
    isNew = true;
    setSessionCookie(res, sessionId);
  }
  let annualVariant = "annual_89";
  const pool = getPool();
  if (!pool) {
    return {
      sessionId,
      annualVariant: pickAnnualVariant(),
      isNew
    };
  }
  try {
    await ensureAbTables(pool);
    const existing = await pool.query(
      `SELECT test_name, variant FROM ab_test_assignments WHERE session_id = $1`,
      [sessionId]
    );
    const map = /* @__PURE__ */ new Map();
    for (const row of existing.rows) {
      map.set(row.test_name, row.variant);
    }
    if (annualPriceEnabled()) {
      if (map.has(TEST_ANNUAL_PRICE)) {
        annualVariant = map.get(TEST_ANNUAL_PRICE);
      } else {
        annualVariant = pickAnnualVariant();
        await pool.query(
          `INSERT INTO ab_test_assignments (session_id, test_name, variant)
           VALUES ($1, $2, $3)
           ON CONFLICT (session_id, test_name) DO NOTHING`,
          [sessionId, TEST_ANNUAL_PRICE, annualVariant]
        );
      }
    } else {
      annualVariant = "annual_89";
    }
  } catch (err) {
    console.error("AB assignment error:", err?.message);
  } finally {
    await pool.end();
  }
  return { sessionId, annualVariant, isNew };
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
function requireAdminBasicAuth(req, res) {
  const expectedUser = process.env.ADMIN_BASIC_USER || "admin";
  const expectedPass = process.env.ADMIN_BASIC_PASS;
  if (!expectedPass) {
    res.status(503).json({ error: "Admin endpoint not configured (set ADMIN_BASIC_PASS)" });
    return false;
  }
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="ab-admin"');
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    res.status(401).json({ error: "Invalid auth header" });
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) {
    res.status(401).json({ error: "Invalid auth header" });
    return false;
  }
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  if (!timingSafeEqual(user, expectedUser) || !timingSafeEqual(pass, expectedPass)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="ab-admin"');
    res.status(401).json({ error: "Invalid credentials" });
    return false;
  }
  return true;
}
var AUTH_API_URL = "https://www.expathub.website";
var PASSWORD_API_URL = "https://www.expathub.website";
async function getUserFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: authHeader }
    });
    if (!upstream.ok) return null;
    const data = await upstream.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}
async function getUserIdFromToken(req) {
  const user = await getUserFromToken(req);
  return user?.id?.toString() ?? null;
}
function getPool() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  return new pg.Pool({ connectionString: dbUrl });
}
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}
var identifyMissingAnonIdCount = 0;
var identifyMissingAnonIdLastAt = null;
var identifyMissingAnonIdBySurface = {};
var ANALYTICS_HEALTH_STARTED_AT = (/* @__PURE__ */ new Date()).toISOString();
var ensureIdentifyMissingAnonPromise = null;
async function ensureIdentifyMissingAnonTable(pool) {
  if (!ensureIdentifyMissingAnonPromise) {
    ensureIdentifyMissingAnonPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS identify_missing_anon_events (
           id SERIAL PRIMARY KEY,
           surface VARCHAR(100) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS identify_missing_anon_events_created_at_idx
           ON identify_missing_anon_events (created_at)`
      );
    })().catch((err) => {
      ensureIdentifyMissingAnonPromise = null;
      throw err;
    });
  }
  await ensureIdentifyMissingAnonPromise;
}
function detectMissingAnonIdentify(body) {
  if (!body || typeof body !== "object") return null;
  if (body.event !== "$identify") return null;
  const properties = body.properties;
  const anonId = properties && typeof properties === "object" ? properties.$anon_distinct_id : void 0;
  if (typeof anonId === "string" && anonId.length > 0) return null;
  const surfaceRaw = properties && typeof properties === "object" ? properties.surface : void 0;
  const surface = typeof surfaceRaw === "string" && surfaceRaw.length > 0 ? surfaceRaw : "unknown";
  const distinctIdRaw = body.distinct_id;
  const distinctId = typeof distinctIdRaw === "string" ? distinctIdRaw : null;
  return { surface, distinctId };
}
async function recordMissingAnonEvent(pool, body) {
  const missing = detectMissingAnonIdentify(body);
  if (!missing) return;
  await ensureIdentifyMissingAnonTable(pool);
  await pool.query(
    `INSERT INTO identify_missing_anon_events (surface, distinct_id)
     VALUES ($1, $2)`,
    [missing.surface, missing.distinctId]
  );
}
async function readMissingAnonTotalsFromDb(pool) {
  await ensureIdentifyMissingAnonTable(pool);
  const totals = await pool.query(
    `SELECT
       COUNT(*)::int AS all_time,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '24 hours'
       )::int AS last_24h,
       MAX(created_at) AS last_seen
     FROM identify_missing_anon_events`
  );
  const bySurfaceRows = await pool.query(
    `SELECT COALESCE(surface, 'unknown') AS surface, COUNT(*)::int AS c
       FROM identify_missing_anon_events
      GROUP BY COALESCE(surface, 'unknown')`
  );
  const row = totals?.rows?.[0] ?? {};
  const bySurface = {};
  for (const r of bySurfaceRows?.rows ?? []) {
    bySurface[r.surface] = Number(
      r.c
    );
  }
  const lastSeen = row.last_seen ? new Date(row.last_seen).toISOString() : null;
  return {
    allTime: Number(row.all_time ?? 0),
    last24h: Number(row.last_24h ?? 0),
    lastSeenAt: lastSeen,
    bySurface
  };
}
async function getAnalyticsHealthSnapshot(pool) {
  let allTime = identifyMissingAnonIdCount;
  let last24h = identifyMissingAnonIdCount;
  let lastSeenAt = identifyMissingAnonIdLastAt;
  let bySurface = { ...identifyMissingAnonIdBySurface };
  if (pool) {
    try {
      const totals = await readMissingAnonTotalsFromDb(pool);
      allTime = totals.allTime;
      last24h = totals.last24h;
      lastSeenAt = totals.lastSeenAt;
      bySurface = totals.bySurface;
    } catch (err) {
      console.warn(
        "[analytics] failed to read missing-anon totals from DB; falling back to in-memory counters",
        err?.message ?? err
      );
    }
  }
  return {
    healthy: last24h === 0 && crossDeviceBridgesFailed === 0,
    identify_missing_anon_id: {
      count: allTime,
      all_time_count: allTime,
      last_24h_count: last24h,
      last_seen_at: lastSeenAt,
      by_surface: bySurface
    },
    cross_device_bridge: {
      emitted: crossDeviceBridgesEmitted,
      failed: crossDeviceBridgesFailed,
      last_failure_at: crossDeviceBridgeLastFailureAt
    },
    started_at: ANALYTICS_HEALTH_STARTED_AT,
    generated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var BACKFILL_FRESHNESS_TTL_MS = 5 * 60 * 1e3;
var backfillFreshnessCache = null;
var lastBackfillStaleAlertAt = null;
async function evaluateAuthPromptBackfillFreshness() {
  const nowMs = Date.now();
  if (backfillFreshnessCache && nowMs - backfillFreshnessCache.at < BACKFILL_FRESHNESS_TTL_MS) {
    return backfillFreshnessCache.value;
  }
  const pool = getPool();
  if (!pool) return null;
  try {
    const freshness = await getAuthPromptBackfillFreshness(pool);
    backfillFreshnessCache = { at: nowMs, value: freshness };
    if (freshness.stale) {
      lastBackfillStaleAlertAt = (/* @__PURE__ */ new Date()).toISOString();
      console.error(
        "[analytics] auth-prompt PostHog backfill is stale \u2014 scheduled reconciliation may be broken",
        {
          last_ran_at: freshness.lastRanAt,
          age_days: freshness.ageDays != null ? Number(freshness.ageDays.toFixed(2)) : null,
          threshold_days: freshness.thresholdDays
        }
      );
    }
    return freshness;
  } catch (err) {
    console.warn(
      "[analytics] could not evaluate auth-prompt backfill freshness:",
      err?.message ?? String(err)
    );
    return backfillFreshnessCache?.value ?? null;
  } finally {
    try {
      await pool.end();
    } catch {
    }
  }
}
var RECONCILE_MAX_EMAILS = 5e4;
var emailToDistinctIds = /* @__PURE__ */ new Map();
var emittedBridges = /* @__PURE__ */ new Map();
var crossDeviceBridgesEmitted = 0;
var crossDeviceBridgesFailed = 0;
var crossDeviceBridgeLastFailureAt = null;
function hasEmittedBridge(emailHash, distinctId, anonDistinctId) {
  const set = emittedBridges.get(emailHash);
  return !!set && set.has(`${distinctId}\u2192${anonDistinctId}`);
}
function markBridgeEmitted(emailHash, distinctId, anonDistinctId) {
  let set = emittedBridges.get(emailHash);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    emittedBridges.set(emailHash, set);
  }
  set.add(`${distinctId}\u2192${anonDistinctId}`);
}
function safeEmailHashTag(hash) {
  return hash.length > 8 ? `${hash.slice(0, 8)}\u2026` : hash;
}
function recordBridgeFailure(reason, context) {
  crossDeviceBridgesFailed += 1;
  crossDeviceBridgeLastFailureAt = (/* @__PURE__ */ new Date()).toISOString();
  console.warn(
    "[analytics] cross-device $identify bridge failed; PostHog merge may be lost",
    {
      reason,
      distinct_id: context.distinctId,
      anon_distinct_id: context.anonDistinctId,
      email_sha256_prefix: safeEmailHashTag(context.emailHash),
      failure_count: crossDeviceBridgesFailed
    }
  );
}
function rankDistinctId(id) {
  if (id.startsWith("user:")) return 3;
  if (id.startsWith("email:")) return 2;
  return 1;
}
function recordEmailDistinctId(emailHash, distinctId) {
  let set = emailToDistinctIds.get(emailHash);
  if (!set) {
    if (emailToDistinctIds.size >= RECONCILE_MAX_EMAILS) {
      const oldestKey = emailToDistinctIds.keys().next().value;
      if (oldestKey !== void 0) emailToDistinctIds.delete(oldestKey);
    }
    set = /* @__PURE__ */ new Set();
    emailToDistinctIds.set(emailHash, set);
  } else {
    emailToDistinctIds.delete(emailHash);
    emailToDistinctIds.set(emailHash, set);
  }
  const priorIds = Array.from(set).filter((prior) => prior !== distinctId);
  set.add(distinctId);
  return priorIds;
}
function forwardBridgeIdentify(params) {
  crossDeviceBridgesEmitted += 1;
  const body = {
    event: "$identify",
    distinct_id: params.distinctId,
    properties: {
      $anon_distinct_id: params.anonDistinctId,
      email_sha256: params.emailHash,
      surface: "server_reconcile",
      distinct_id: params.distinctId
    }
  };
  try {
    const promise = fetch(`${AUTH_API_URL}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (promise && typeof promise.then === "function") {
      promise.then((response) => {
        if (!response || !response.ok) {
          recordBridgeFailure(
            `upstream_status_${response?.status ?? "unknown"}`,
            params
          );
        }
      }).catch((err) => {
        recordBridgeFailure(
          `upstream_error: ${err?.message ?? String(err)}`,
          params
        );
      });
    }
  } catch (err) {
    recordBridgeFailure(`throw: ${err?.message ?? String(err)}`, params);
  }
}
function reconcileEmailIdentities(body) {
  if (!body || typeof body !== "object") return;
  if (body.event !== "$identify") return;
  const properties = body.properties;
  if (!properties || typeof properties !== "object") return;
  const emailHashRaw = properties.email_sha256;
  if (typeof emailHashRaw !== "string" || emailHashRaw.length === 0) return;
  const distinctIdRaw = body.distinct_id;
  if (typeof distinctIdRaw !== "string" || distinctIdRaw.length === 0) return;
  const emailHash = emailHashRaw.toLowerCase();
  const distinctId = distinctIdRaw;
  const priorIds = recordEmailDistinctId(emailHash, distinctId);
  if (priorIds.length === 0) return;
  const newRank = rankDistinctId(distinctId);
  for (const prior of priorIds) {
    const priorRank = rankDistinctId(prior);
    const winner = newRank >= priorRank ? distinctId : prior;
    const loser = newRank >= priorRank ? prior : distinctId;
    if (hasEmittedBridge(emailHash, winner, loser)) continue;
    markBridgeEmitted(emailHash, winner, loser);
    forwardBridgeIdentify({
      distinctId: winner,
      anonDistinctId: loser,
      emailHash
    });
  }
}
function inspectIdentifyPayload(body) {
  const missing = detectMissingAnonIdentify(body);
  if (!missing) return;
  identifyMissingAnonIdCount += 1;
  identifyMissingAnonIdLastAt = (/* @__PURE__ */ new Date()).toISOString();
  identifyMissingAnonIdBySurface[missing.surface] = (identifyMissingAnonIdBySurface[missing.surface] ?? 0) + 1;
  console.warn(
    "[analytics] $identify event missing $anon_distinct_id; PostHog cannot stitch pre-account events",
    {
      distinct_id: missing.distinctId ?? void 0,
      surface: missing.surface,
      missing_count: identifyMissingAnonIdCount
    }
  );
}
async function registerRoutes(app2) {
  registerPlannerAnalyticsRoutes(app2, { requireAdminBasicAuth, getPool });
  registerQuizSaveAnalyticsRoutes(app2, { requireAdminBasicAuth, getPool });
  registerAuthPromptAnalyticsRoutes(app2, { requireAdminBasicAuth, getPool });
  registerBriefFreshnessRoutes(app2, { requireAdminBasicAuth });
  app2.get("/api/_internal/analytics-health", async (_req, res) => {
    const pool = getPool();
    try {
      const snapshot = await getAnalyticsHealthSnapshot(pool);
      const freshness = await evaluateAuthPromptBackfillFreshness();
      const backfillStale = freshness?.stale === true;
      res.setHeader("Cache-Control", "no-store");
      const body = {
        ...snapshot,
        // A stale backfill turns the probe red even when the persisted counters
        // are clean, so the existing uptime alert fires (task #127).
        healthy: snapshot.healthy && !backfillStale,
        auth_prompt_backfill: freshness ? {
          stale: freshness.stale,
          has_run: freshness.hasRun,
          last_ran_at: freshness.lastRanAt,
          age_days: freshness.ageDays,
          threshold_days: freshness.thresholdDays
        } : null
      };
      res.status(body.healthy ? 200 : 503).json(body);
    } finally {
      if (pool) await pool.end().catch(() => {
      });
    }
  });
  app2.get("/api/_internal/quiz-save-prompt-health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const pool = getPool();
    if (!pool) {
      const snapshot = unavailableQuizSavePromptHealthSnapshot();
      res.status(503).json(snapshot);
      return;
    }
    try {
      const snapshot = await computeQuizSavePromptHealth(pool);
      res.status(snapshot.healthy ? 200 : 503).json(snapshot);
    } catch (err) {
      console.error(
        "Quiz-save prompt health probe error:",
        err?.message ?? err
      );
      const snapshot = unavailableQuizSavePromptHealthSnapshot();
      res.status(503).json(snapshot);
    } finally {
      await pool.end();
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });
  app2.get("/api/auth/me", async (req, res) => {
    try {
      const headers = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/me`, {
        method: "GET",
        headers
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const upstream = await fetch(`${PASSWORD_API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Registration service unavailable" });
    }
  });
  app2.post("/api/auth/logout", async (req, res) => {
    try {
      const headers = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/logout`, {
        method: "POST",
        headers
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });
  app2.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const upstream = await fetch(`${PASSWORD_API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Password reset service unavailable" });
    }
  });
  app2.delete("/api/account", async (req, res) => {
    try {
      const headers = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/account`, {
        method: "DELETE",
        headers
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") res.setHeader(key, value);
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Account deletion service unavailable" });
    }
  });
  app2.post("/api/billing/mobile/refresh", async (req, res) => {
    try {
      const headers = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/billing/mobile/refresh`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body)
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") res.setHeader(key, value);
      });
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Billing service unavailable" });
    }
  });
  app2.get("/api/entitlements", async (req, res) => {
    try {
      const headers = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/entitlements`, {
        method: "GET",
        headers
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const upstreamContentType = upstream.headers.get("content-type") ?? "";
      if (upstreamContentType) res.setHeader("content-type", upstreamContentType);
      if (upstreamContentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            delete parsed.decisionPass;
            delete parsed.countryUnlocks;
          }
          res.send(JSON.stringify(parsed));
          return;
        } catch {
        }
      }
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: "Entitlements service unavailable" });
    }
  });
  app2.post("/api/analytics", async (req, res) => {
    inspectIdentifyPayload(req.body);
    reconcileEmailIdentities(req.body);
    const persistPool = getPool();
    if (persistPool) {
      Promise.allSettled([
        recordQuizSaveEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist quiz_save event:",
            err?.message ?? err
          );
        }),
        recordAuthPromptEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist auth_prompt event:",
            err?.message ?? err
          );
        }),
        recordMissingAnonEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist missing-anon event:",
            err?.message ?? err
          );
        })
      ]).finally(() => {
        persistPool.end().catch(() => {
        });
      });
    }
    try {
      const upstream = await fetch(`${AUTH_API_URL}/api/analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      res.status(upstream.status).json({ ok: true });
    } catch {
      res.status(200).json({ ok: true });
    }
  });
  app2.get("/api/ab/me", async (req, res) => {
    const { sessionId, annualVariant } = await getOrAssignVariants(req, res);
    res.json({
      sessionId,
      tests: {
        annual_price: {
          enabled: annualPriceEnabled(),
          variant: annualVariant,
          // Surface the price the FE should display so the FE never
          // has to know about the env-flag wiring.
          priceUsd: annualVariant === "annual_99" ? 99 : 89
        }
      }
    });
  });
  app2.post("/api/ab/conversion", async (req, res) => {
    const cookies = parseCookies(req);
    const sessionId = cookies[PRICING_VARIANT_COOKIE];
    if (!sessionId) {
      res.status(400).json({ error: "Missing session cookie" });
      return;
    }
    const { plan, revenue, stripeSubscriptionId } = req.body;
    const activeTests = [];
    if (plan === "annual" && annualPriceEnabled()) activeTests.push(TEST_ANNUAL_PRICE);
    if (activeTests.length === 0) {
      res.json({ ok: true, conversions: 0 });
      return;
    }
    const userId = await getUserIdFromToken(req);
    const pool = getPool();
    if (!pool) {
      res.json({ ok: true });
      return;
    }
    try {
      await ensureAbTables(pool);
      const assignments = await pool.query(
        `SELECT test_name, variant FROM ab_test_assignments
         WHERE session_id = $1 AND test_name = ANY($2::varchar[])`,
        [sessionId, activeTests]
      );
      if (assignments.rows.length === 0) {
        res.json({ ok: true, conversions: 0 });
        return;
      }
      let inserted = 0;
      for (const row of assignments.rows) {
        const dedupeWhere = stripeSubscriptionId ? `WHERE session_id = $1 AND test_name = $2 AND stripe_subscription_id = $3 AND converted = TRUE` : `WHERE session_id = $1 AND test_name = $2 AND converted = TRUE AND stripe_subscription_id IS NULL`;
        const dedupeParams = stripeSubscriptionId ? [sessionId, row.test_name, stripeSubscriptionId] : [sessionId, row.test_name];
        const existing = await pool.query(
          `SELECT 1 FROM conversions ${dedupeWhere} LIMIT 1`,
          dedupeParams
        );
        if (existing.rows.length > 0) continue;
        await pool.query(
          `INSERT INTO conversions
             (session_id, user_id, test_name, variant, plan, converted,
              revenue_day_0, stripe_subscription_id)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
          [
            sessionId,
            userId,
            row.test_name,
            row.variant,
            plan ?? null,
            typeof revenue === "number" ? revenue : 0,
            stripeSubscriptionId ?? null
          ]
        );
        inserted += 1;
      }
      res.json({ ok: true, conversions: inserted });
    } catch (err) {
      console.error("Conversion record error:", err?.message);
      res.json({ ok: true });
    } finally {
      await pool.end();
    }
  });
  const readAbWindowDays = (req) => {
    const raw = req.query.days;
    if (typeof raw !== "string") return void 0;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return void 0;
    return Math.min(365, n);
  };
  app2.get("/api/admin/ab-results", async (req, res) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeAbResults(pool, readAbWindowDays(req));
      res.json({
        ...data,
        // Cross-link to other internal tools so anyone who lands on this
        // JSON endpoint can find the full admin index and the planner
        // analytics dashboard without grep-hunting through routes.ts.
        links: {
          admin_index: "/admin",
          planner_analytics_html: "/admin/planner-analytics",
          planner_analytics_json: "/api/admin/planner-analytics",
          ab_results_csv: "/admin/ab-results.csv"
        }
      });
    } catch (err) {
      console.error("AB results error:", err?.message);
      res.status(500).json({ error: "Failed to compute results" });
    } finally {
      await pool.end();
    }
  });
  const sendAbResultsCsv = async (req, res) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured (set DATABASE_URL).");
      return;
    }
    try {
      const data = await computeAbResults(pool, readAbWindowDays(req));
      res.type("text/csv; charset=utf-8").setHeader(
        "Content-Disposition",
        'attachment; filename="ab-results.csv"'
      ).send(renderAbResultsCsv(data));
    } catch (err) {
      console.error("AB results CSV error:", err?.message);
      res.status(500).type("text/plain").send(`Failed to compute results: ${err?.message ?? "unknown"}`);
    } finally {
      await pool.end();
    }
  };
  app2.get("/admin/ab-results.csv", sendAbResultsCsv);
  app2.get("/api/admin/ab-results.csv", sendAbResultsCsv);
  app2.get("/admin/ab-results", async (req, res) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res.status(503).type("text/html").send("<h1>A/B test results unavailable</h1><p>Database is not configured (set DATABASE_URL).</p>");
      return;
    }
    try {
      const data = await computeAbResults(pool);
      res.type("text/html").send(renderAbResultsHtml(data));
    } catch (err) {
      console.error("AB results HTML error:", err?.message);
      res.status(500).type("text/html").send("<h1>A/B test results unavailable</h1><p>Failed to compute results.</p>");
    } finally {
      await pool.end();
    }
  });
  app2.post("/api/stripe/checkout", async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
      return;
    }
    const { plan } = req.body;
    if (plan !== "monthly" && plan !== "annual") {
      res.status(400).json({ error: "plan must be 'monthly' or 'annual'" });
      return;
    }
    const { sessionId, annualVariant } = await getOrAssignVariants(req, res);
    const monthlyId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const annualId = process.env.STRIPE_ANNUAL_PRICE_ID;
    const annual99Id = process.env.STRIPE_ANNUAL_99_PRICE_ID;
    let priceId;
    const trialDays = 14;
    const dueToday = 0;
    let missingEnv = null;
    if (plan === "monthly") {
      priceId = monthlyId;
      if (!priceId) missingEnv = "STRIPE_MONTHLY_PRICE_ID";
    } else {
      if (annualVariant === "annual_99") {
        priceId = annual99Id;
        if (!priceId) missingEnv = "STRIPE_ANNUAL_99_PRICE_ID";
      } else {
        priceId = annualId;
        if (!priceId) missingEnv = "STRIPE_ANNUAL_PRICE_ID";
      }
    }
    if (!priceId || missingEnv) {
      res.status(503).json({
        error: `Stripe ${plan} price ID is not configured${plan === "annual" ? ` for variant "${annualVariant}"` : ""}. Set ${missingEnv}.`
      });
      return;
    }
    try {
      const baseUrl = getBaseUrl(req);
      const successQuery = new URLSearchParams({
        subscribed: "true",
        plan,
        value: String(dueToday),
        currency: "USD",
        sid: sessionId,
        av: annualVariant
      }).toString();
      const checkoutPayload = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/account?${successQuery}`,
        cancel_url: `${baseUrl}/pricing?checkout=cancel`,
        metadata: {
          eh_session_id: sessionId,
          annual_variant: annualVariant,
          plan
        }
      };
      checkoutPayload.subscription_data = { trial_period_days: trialDays };
      const session = await stripe.checkout.sessions.create(checkoutPayload);
      res.json({
        url: session.url,
        variant: { annual: annualVariant }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/stripe/portal", async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
      return;
    }
    const user = await getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const customerId = user.stripeCustomerId;
    if (!customerId) {
      res.status(404).json({ error: "No Stripe customer on file for this account" });
      return;
    }
    try {
      const baseUrl = getBaseUrl(req);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: baseUrl
      });
      res.json({ url: session.url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/stripe/status", async (_req, res) => {
    res.json({ hasProAccess: false });
  });
  app2.post("/api/auth/quiz-lead", async (req, res) => {
    const { email, readinessLevel, topRegion, regionPreference, score, risks, source } = req.body;
    const level = readinessLevel;
    if (!email || !level) {
      res.status(200).json({ ok: true });
      return;
    }
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }
    let pool = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO quiz_leads (email, readiness_level, top_region, region_preference, score, risks, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [email, level, topRegion || null, regionPreference || null, score || null, JSON.stringify(risks || []), source || "ios_onboarding"]
      );
    } catch (err) {
      console.error("Quiz lead insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });
  app2.post("/api/waitlist", async (req, res) => {
    const { countrySlug, email, note } = req.body;
    if (!countrySlug || typeof countrySlug !== "string") {
      res.status(400).json({ error: "countrySlug is required" });
      return;
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    let pool = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        "INSERT INTO waitlist (country_slug, email, note) VALUES ($1, $2, $3)",
        [countrySlug, email, note || null]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Waitlist insert error:", err);
      res.status(500).json({ error: "Failed to join waitlist" });
    } finally {
      if (pool) await pool.end();
    }
  });
  app2.post("/api/readiness-lead", async (req, res) => {
    const { email, score, readinessLevel, risks, answers } = req.body;
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    const level = readinessLevel || null;
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }
    let pool = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO readiness_leads (email, score, readiness_level, risks, answers)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, score || null, level, JSON.stringify(risks || []), JSON.stringify(answers || {})]
      );
    } catch (err) {
      console.error("Readiness lead insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });
  app2.post("/api/country-interest", async (req, res) => {
    const { email, country_slug } = req.body;
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    if (!country_slug || typeof country_slug !== "string") {
      res.status(400).json({ error: "country_slug is required" });
      return;
    }
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }
    let pool = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO country_interest (email, country_slug)
         VALUES ($1, $2)`,
        [email, country_slug]
      );
    } catch (err) {
      console.error("Country interest insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });
  app2.get("/api/bookmarks", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json([]);
      return;
    }
    try {
      const result = await pool.query(
        "SELECT id, country_slug, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      res.json(result.rows.map((r) => ({ id: r.id, countrySlug: r.country_slug, createdAt: r.created_at })));
    } catch (err) {
      console.error("Bookmarks fetch error:", err);
      res.status(500).json({ error: "Failed to fetch bookmarks" });
    } finally {
      await pool.end();
    }
  });
  app2.post("/api/bookmarks", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { countrySlug } = req.body;
    if (!countrySlug) {
      res.status(400).json({ error: "countrySlug is required" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const existing = await pool.query(
        "SELECT id FROM bookmarks WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      if (existing.rows.length > 0) {
        res.json({ ok: true, id: existing.rows[0].id });
        return;
      }
      const result = await pool.query(
        "INSERT INTO bookmarks (user_id, country_slug) VALUES ($1, $2) RETURNING id",
        [userId, countrySlug]
      );
      res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
      console.error("Bookmark insert error:", err);
      res.status(500).json({ error: "Failed to save bookmark" });
    } finally {
      await pool.end();
    }
  });
  app2.delete("/api/bookmarks/:countrySlug", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { countrySlug } = req.params;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      await pool.query(
        "DELETE FROM bookmarks WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      await pool.query(
        "DELETE FROM move_notes WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Bookmark delete error:", err);
      res.status(500).json({ error: "Failed to remove bookmark" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/api/notes", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json([]);
      return;
    }
    try {
      const result = await pool.query(
        "SELECT id, country_slug, content, updated_at FROM move_notes WHERE user_id = $1 ORDER BY updated_at DESC",
        [userId]
      );
      res.json(result.rows.map((r) => ({ id: r.id, countrySlug: r.country_slug, content: r.content, updatedAt: r.updated_at })));
    } catch (err) {
      console.error("Notes fetch error:", err);
      res.status(500).json({ error: "Failed to fetch notes" });
    } finally {
      await pool.end();
    }
  });
  app2.put("/api/notes/:countrySlug", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { countrySlug } = req.params;
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO move_notes (user_id, country_slug, content, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, country_slug) DO UPDATE SET content = $3, updated_at = NOW()`,
        [userId, countrySlug, content]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Note save error:", err);
      res.status(500).json({ error: "Failed to save note" });
    } finally {
      await pool.end();
    }
  });
  const GENERIC_PROGRESS_STEP_IDS = GENERIC_PLAN_STEP_IDS;
  async function seedDefaultProgress(pool, userId, country) {
    await ensureUserProgressCreatedAt(pool);
    for (const stepId of GENERIC_PROGRESS_STEP_IDS) {
      await pool.query(
        `INSERT INTO user_progress
           (user_id, step_id, target_country, completed, completed_at)
         VALUES ($1, $2, $3, FALSE, NULL)
         ON CONFLICT (user_id, step_id, target_country) DO NOTHING`,
        [userId, stepId, country]
      );
    }
  }
  async function getProgressPercentForUser(userId, country) {
    const pool = getPool();
    if (!pool) return 0;
    try {
      const total = GENERIC_PROGRESS_STEP_IDS.length;
      const result = await pool.query(
        `SELECT COUNT(*)::int AS done
           FROM user_progress
          WHERE user_id = $1
            AND target_country = $2
            AND completed = TRUE
            AND step_id = ANY($3::text[])`,
        [userId, country, [...GENERIC_PROGRESS_STEP_IDS]]
      );
      const done = Number(result.rows[0]?.done ?? 0);
      return total === 0 ? 0 : Math.round(done / total * 100);
    } finally {
      await pool.end();
    }
  }
  app2.get("/api/progress", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const country = req.query.country ?? "";
    if (!country) {
      res.status(400).json({ error: "country is required" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json([]);
      return;
    }
    try {
      await seedDefaultProgress(pool, userId, country);
      const result = await pool.query(
        `SELECT step_id, completed, completed_at
           FROM user_progress
          WHERE user_id = $1 AND target_country = $2`,
        [userId, country]
      );
      res.json(
        result.rows.map((r) => ({
          stepId: r.step_id,
          completed: !!r.completed,
          completedAt: r.completed_at
        }))
      );
    } catch (err) {
      console.error("Progress fetch error:", err);
      res.status(500).json({ error: "Failed to fetch progress" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/api/progress/percent", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const country = req.query.country ?? "";
    if (!country) {
      res.status(400).json({ error: "country is required" });
      return;
    }
    const claimedUserId = req.query.userId ?? "";
    if (claimedUserId && claimedUserId !== userId) {
      res.status(403).json({ error: "userId does not match authenticated user" });
      return;
    }
    try {
      const percent = await getProgressPercentForUser(userId, country);
      res.json({ country, percent });
    } catch (err) {
      console.error("Progress percent error:", err);
      res.status(500).json({ error: "Failed to compute progress" });
    }
  });
  app2.post("/api/progress", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { country, stepId, completed } = req.body;
    if (!country || !stepId || typeof completed !== "boolean") {
      res.status(400).json({ error: "country, stepId and completed are required" });
      return;
    }
    if (!GENERIC_PROGRESS_STEP_IDS.includes(stepId)) {
      res.status(400).json({ error: "Unknown stepId" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const completedAt = completed ? /* @__PURE__ */ new Date() : null;
      await pool.query(
        `INSERT INTO user_progress
           (user_id, step_id, target_country, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, step_id, target_country)
         DO UPDATE SET
           completed = EXCLUDED.completed,
           completed_at = CASE
             WHEN user_progress.completed = TRUE AND EXCLUDED.completed = TRUE
               THEN user_progress.completed_at
             ELSE EXCLUDED.completed_at
           END`,
        [userId, stepId, country, completed, completedAt]
      );
      res.json({ ok: true, stepId, completed });
    } catch (err) {
      console.error("Progress save error:", err);
      res.status(500).json({ error: "Failed to save progress" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/api/saved-summary", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json({ bookmarkCount: 0, notesCount: 0 });
      return;
    }
    try {
      const bm = await pool.query("SELECT COUNT(*) as count FROM bookmarks WHERE user_id = $1", [userId]);
      const notes = await pool.query("SELECT COUNT(*) as count FROM move_notes WHERE user_id = $1 AND content != ''", [userId]);
      res.json({
        bookmarkCount: parseInt(bm.rows[0].count, 10),
        notesCount: parseInt(notes.rows[0].count, 10)
      });
    } catch (err) {
      console.error("Saved summary error:", err);
      res.json({ bookmarkCount: 0, notesCount: 0 });
    } finally {
      await pool.end();
    }
  });
  await registerWorksheetRoutes(app2);
  const httpServer = createServer(app2);
  return httpServer;
}
var worksheetTablesEnsured = false;
async function ensureWorksheetTables(pool) {
  if (worksheetTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS worksheet_definitions (
      id VARCHAR(100) PRIMARY KEY,
      question_id INTEGER NOT NULL,
      dimension VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      questions JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_worksheet_responses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      worksheet_id VARCHAR(100) NOT NULL,
      answers JSONB NOT NULL,
      dimension_score NUMERIC(4,2) NOT NULL,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_worksheet_responses_user_worksheet_idx
      ON user_worksheet_responses (user_id, worksheet_id)
  `);
  for (const w of WORKSHEETS) {
    await pool.query(
      `INSERT INTO worksheet_definitions
         (id, question_id, dimension, title, description, questions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         question_id = EXCLUDED.question_id,
         dimension = EXCLUDED.dimension,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         questions = EXCLUDED.questions,
         updated_at = NOW()`,
      [
        w.id,
        w.questionId,
        w.dimension,
        w.title,
        w.description,
        JSON.stringify(w.questions)
      ]
    );
  }
  worksheetTablesEnsured = true;
}
async function hasActiveEntitlement(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/entitlements`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: authHeader }
    });
    if (upstream.ok) {
      const data = await upstream.json();
      if (data.hasFullAccess === true || data.hasProAccess === true) return true;
      if (data.hasActiveSubscription === true || data.subscriptionActive === true) return true;
      if (data.subscription && typeof data.subscription === "object") {
        const status = data.subscription.status;
        if (status === "active" || status === "trialing") return true;
      }
      if (data.entitlements && typeof data.entitlements === "object") {
        const ent = data.entitlements["full_access_subscription"];
        if (ent && ent.isActive === true) return true;
      }
    }
  } catch {
  }
  return false;
}
async function registerWorksheetRoutes(app2) {
  app2.get("/api/worksheets", async (_req, res) => {
    const pool = getPool();
    if (!pool) {
      res.json([]);
      return;
    }
    try {
      await ensureWorksheetTables(pool);
      const result = await pool.query(
        `SELECT id, question_id, dimension, title, description
           FROM worksheet_definitions
          ORDER BY question_id ASC`
      );
      res.json(
        result.rows.map((r) => ({
          id: r.id,
          questionId: r.question_id,
          dimension: r.dimension,
          title: r.title,
          description: r.description
        }))
      );
    } catch (err) {
      console.error("Worksheets list error:", err);
      res.status(500).json({ error: "Failed to fetch worksheets" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/api/worksheets/responses", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json([]);
      return;
    }
    try {
      await ensureWorksheetTables(pool);
      const result = await pool.query(
        `SELECT r.worksheet_id, r.answers, r.dimension_score, r.submitted_at,
                d.question_id
           FROM user_worksheet_responses r
           JOIN worksheet_definitions d ON d.id = r.worksheet_id
          WHERE r.user_id = $1`,
        [userId]
      );
      res.json(
        result.rows.map((r) => ({
          worksheetId: r.worksheet_id,
          questionId: r.question_id,
          answers: r.answers,
          dimensionScore: Number(r.dimension_score),
          submittedAt: r.submitted_at
        }))
      );
    } catch (err) {
      console.error("Worksheet responses error:", err);
      res.status(500).json({ error: "Failed to fetch responses" });
    } finally {
      await pool.end();
    }
  });
  app2.get("/api/worksheets/:worksheetId", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const worksheetIdParam = String(req.params.worksheetId);
    const def = WORKSHEET_BY_ID[worksheetIdParam];
    if (!def) {
      res.status(404).json({ error: "Unknown worksheet" });
      return;
    }
    const entitled = await hasActiveEntitlement(req);
    if (!entitled) {
      const pool = getPool();
      if (pool) {
        let blocked = false;
        try {
          await ensureWorksheetTables(pool);
          const r = await pool.query(
            `SELECT worksheet_id FROM user_worksheet_responses WHERE user_id = $1`,
            [userId]
          );
          const ids = r.rows.map((row) => row.worksheet_id);
          const hasThis = ids.includes(worksheetIdParam);
          if (ids.length >= 1 && !hasThis) {
            blocked = true;
          }
        } finally {
          await pool.end();
        }
        if (blocked) {
          res.status(402).json({ error: "Subscription required" });
          return;
        }
      }
    }
    res.json({
      id: def.id,
      questionId: def.questionId,
      dimension: def.dimension,
      title: def.title,
      description: def.description,
      questions: def.questions
    });
  });
  app2.post("/api/worksheets/:worksheetId/submit", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const entitled = await hasActiveEntitlement(req);
    const worksheetId = String(req.params.worksheetId);
    if (!entitled) {
      const pool2 = getPool();
      if (pool2) {
        let blocked = false;
        try {
          await ensureWorksheetTables(pool2);
          const r = await pool2.query(
            `SELECT worksheet_id FROM user_worksheet_responses WHERE user_id = $1`,
            [userId]
          );
          const ids = r.rows.map((row) => row.worksheet_id);
          const hasThis = ids.includes(worksheetId);
          if (ids.length >= 1 && !hasThis) {
            blocked = true;
          }
        } finally {
          await pool2.end();
        }
        if (blocked) {
          res.status(402).json({ error: "Subscription required" });
          return;
        }
      }
    }
    const { answers } = req.body ?? {};
    if (!worksheetId || !answers) {
      res.status(400).json({ error: "worksheetId and answers are required" });
      return;
    }
    const def = WORKSHEET_BY_ID[worksheetId];
    if (!def) {
      res.status(404).json({ error: "Unknown worksheet" });
      return;
    }
    const validated = validateAnswersShape(def, answers);
    if (!validated) {
      res.status(400).json({ error: "Invalid answers payload" });
      return;
    }
    const score = scoreWorksheet(def, validated);
    if (score === null) {
      res.status(400).json({ error: "Could not score answers" });
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      await ensureWorksheetTables(pool);
      await pool.query(
        `INSERT INTO user_worksheet_responses
           (user_id, worksheet_id, answers, dimension_score, submitted_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, worksheet_id) DO UPDATE SET
           answers = EXCLUDED.answers,
           dimension_score = EXCLUDED.dimension_score,
           submitted_at = NOW()`,
        [userId, worksheetId, JSON.stringify(validated), score]
      );
      res.json({
        ok: true,
        worksheetId,
        questionId: def.questionId,
        dimensionScore: score
      });
    } catch (err) {
      console.error("Worksheet submit error:", err);
      res.status(500).json({ error: "Failed to save worksheet" });
    } finally {
      await pool.end();
    }
  });
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
import pg2 from "pg";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawnSync } from "child_process";

// server/authPromptBackfillScheduler.ts
var DEFAULT_BACKFILL_INTERVAL_MS2 = 24 * 60 * 60 * 1e3;
var DEFAULT_BACKFILL_WINDOW_DAYS2 = 7;
var DEFAULT_BACKFILL_INITIAL_DELAY_MS2 = 60 * 1e3;
function isoNow2(now) {
  return now().toISOString();
}
function formatSince2(now, windowDays) {
  const ms = now().getTime() - windowDays * 24 * 60 * 60 * 1e3;
  return new Date(ms).toISOString();
}
function startAuthPromptBackfillSchedule(options) {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS2;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_BACKFILL_INITIAL_DELAY_MS2;
  const windowDays = Math.max(1, options.windowDays ?? DEFAULT_BACKFILL_WINDOW_DAYS2);
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const setTimeoutFn = options.setTimeoutImpl ?? setTimeout;
  const setIntervalFn = options.setIntervalImpl ?? setInterval;
  const clearTimeoutFn = options.clearTimeoutImpl ?? clearTimeout;
  const clearIntervalFn = options.clearIntervalImpl ?? clearInterval;
  const runBackfill = options.backfillImpl ?? backfillAuthPromptEventsFromPostHog;
  let lastResult = null;
  let stopped = false;
  let initialTimer = null;
  let intervalTimer = null;
  async function runOnce() {
    const ranAt = isoNow2(now);
    const started = now().getTime();
    const pool = options.getPool();
    if (!pool) {
      const result = {
        ranAt,
        durationMs: 0,
        summary: null,
        error: "Database not configured (DATABASE_URL missing)"
      };
      console.warn(
        "[auth-prompt-backfill] skipped scheduled run \u2014 DATABASE_URL not set"
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    }
    const since = formatSince2(now, windowDays);
    try {
      const summary = await runBackfill(pool, { since });
      const durationMs = now().getTime() - started;
      const result = {
        ranAt,
        durationMs,
        summary,
        error: null
      };
      console.log(
        `[auth-prompt-backfill] scheduled run ok \u2014 since=${since} fetched=${summary.fetched} inserted=${summary.inserted} skipped=${summary.skipped} pages=${summary.pages} duration=${durationMs}ms`
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    } catch (err) {
      const durationMs = now().getTime() - started;
      const message = err instanceof PostHogBackfillConfigError2 ? `config error: ${err.message}` : err?.message ?? String(err);
      const result = {
        ranAt,
        durationMs,
        summary: null,
        error: message
      };
      console.error(
        `[auth-prompt-backfill] scheduled run FAILED \u2014 since=${since} duration=${durationMs}ms error="${message}"`
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    } finally {
      try {
        await pool.end();
      } catch {
      }
    }
  }
  initialTimer = setTimeoutFn(() => {
    initialTimer = null;
    if (stopped) return;
    void runOnce();
  }, initialDelayMs);
  initialTimer?.unref?.();
  intervalTimer = setIntervalFn(() => {
    if (stopped) return;
    void runOnce();
  }, intervalMs);
  intervalTimer?.unref?.();
  return {
    stop: () => {
      stopped = true;
      if (initialTimer) clearTimeoutFn(initialTimer);
      if (intervalTimer) clearIntervalFn(intervalTimer);
      initialTimer = null;
      intervalTimer = null;
    },
    runNow: runOnce,
    getLastResult: () => lastResult
  };
}

// server/index.ts
init_quizSaveBackfillScheduler();

// server/leadMigrations.ts
var LEAD_TIER_DROP_MIGRATION = "drop_lead_tier_columns";
var leadTierDropPromise = null;
function runLeadTierDropMigration(pool) {
  if (leadTierDropPromise) return leadTierDropPromise;
  leadTierDropPromise = (async () => {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TIMESTAMP NOT NULL
         )`
      );
      await pool.query(
        `DO $do$
         BEGIN
           -- Serialize across concurrent app processes so the drop and the
           -- bookkeeping insert run as one critical section. The
           -- transaction-scoped advisory lock releases automatically on COMMIT.
           PERFORM pg_advisory_xact_lock(
             hashtext('${LEAD_TIER_DROP_MIGRATION}')
           );
           ALTER TABLE readiness_leads DROP COLUMN IF EXISTS tier;
           ALTER TABLE quiz_leads DROP COLUMN IF EXISTS tier;
           INSERT INTO schema_migrations (name, applied_at)
                VALUES ('${LEAD_TIER_DROP_MIGRATION}', now())
           ON CONFLICT (name) DO NOTHING;
         END $do$;`
      );
    } catch (err) {
      leadTierDropPromise = null;
      throw err;
    }
  })();
  return leadTierDropPromise;
}

// server/index.ts
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function configureExpoManifest(app2) {
  app2.use((req, res, next) => {
    if (req.path !== "/" && req.path !== "/manifest") return next();
    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return serveExpoManifest(platform, res);
    }
    return next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(
    express.static(path.resolve(process.cwd(), "static-build"), {
      index: false,
      fallthrough: true
    })
  );
}
var VITE_DEV_TARGET = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
function configureWebDevProxy(app2) {
  const proxy = createProxyMiddleware({
    target: VITE_DEV_TARGET,
    changeOrigin: true,
    ws: true,
    logger: console,
    pathFilter: (pathname) => !pathname.startsWith("/api")
  });
  app2.use(proxy);
  log(`Web dev proxy \u2192 ${VITE_DEV_TARGET}`);
}
function buildWebBundle(distDir) {
  log(`Building web bundle into ${distDir} (one-time)\u2026`);
  const result = spawnSync(
    "npx",
    ["vite", "build", "--config", "web/vite.config.ts"],
    { cwd: process.cwd(), stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) {
    log(`ERROR: vite build failed with exit code ${result.status}`);
    return false;
  }
  return fs.existsSync(distDir);
}
function configureWebStatic(app2) {
  const distDir = path.resolve(process.cwd(), "web", "dist");
  if (!fs.existsSync(distDir)) {
    log(
      `web/dist not found at ${distDir} \u2014 attempting runtime build fallback.`
    );
    if (!buildWebBundle(distDir)) {
      log(
        "ERROR: web/dist build failed \u2014 SPA routes will not be served. Update the Replit deploy build to run `npx vite build --config web/vite.config.ts`."
      );
      return;
    }
  }
  app2.use(express.static(distDir, { index: false }));
  const indexPath = path.join(distDir, "index.html");
  app2.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    if (!fs.existsSync(indexPath)) return next();
    res.sendFile(indexPath);
  });
  log(`Web SPA serving from ${distDir}`);
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoManifest(app);
  const server = await registerRoutes(app);
  if (process.env.NODE_ENV !== "test" && process.env.DATABASE_URL) {
    const migrationPool = new pg2.Pool({
      connectionString: process.env.DATABASE_URL
    });
    runLeadTierDropMigration(migrationPool).catch((err) => {
      console.error("[lead-tier-drop] migration failed:", err);
    }).finally(() => {
      migrationPool.end().catch(() => {
      });
    });
  }
  if (process.env.NODE_ENV === "production") {
    configureWebStatic(app);
  } else {
    configureWebDevProxy(app);
  }
  setupErrorHandler(app);
  if (process.env.NODE_ENV !== "test") {
    startAuthPromptBackfillSchedule({
      getPool: () => {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) return null;
        return new pg2.Pool({ connectionString: dbUrl });
      }
    });
    if (process.env.POSTHOG_PROJECT_ID && process.env.POSTHOG_PERSONAL_API_KEY) {
      startQuizSaveBackfillSchedule({
        getPool: () => {
          const dbUrl = process.env.DATABASE_URL;
          if (!dbUrl) return null;
          return new pg2.Pool({ connectionString: dbUrl });
        }
      });
    } else {
      log(
        "[quiz-save-backfill] scheduler not started \u2014 POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY not set"
      );
    }
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
