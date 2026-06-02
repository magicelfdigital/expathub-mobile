import pg from "pg";
import { ensureQuizSaveEventsTable } from "./quizSaveAnalytics";

// ── Save-progress prompt firing health ────────────────────────────────────
//
// The post-result "save your progress" modal fires a `quiz_save_shown` event
// with `placement: "result_screen"` every time it is shown (see
// `src/components/QuizSaveModal.tsx`, triggered from `app/onboarding/result.tsx`).
// Jest tests guard the trigger *logic*, but they can't catch a real-world
// regression — an analytics misconfiguration, a deploy that breaks the result
// screen mount, or a sudden drop in low-readiness traffic. Today nobody is
// paged when that event goes to zero; we'd only notice weeks later in the
// dashboard.
//
// This module computes a health snapshot from the locally-persisted
// `quiz_save_events` table: it compares the most recent *complete* day's
// `quiz_save_shown` (result_screen) count against the median of the trailing
// days. The probe at `/api/_internal/quiz-save-prompt-health` returns HTTP 503
// when the prompt has gone silent, mirroring the existing analytics-health
// probe so the same GitHub Actions on-call pattern surfaces it within minutes.
//
// We evaluate the last *complete* day (yesterday in the DB's timezone) rather
// than the in-progress day so a partial day's low count near midnight can't
// trigger a false alarm. CURRENT_DATE / created_at::date use the database
// session timezone (UTC on Neon).

export type QuizSavePromptHealthReason =
  // Prompt is firing at a healthy rate relative to the trailing baseline.
  | "ok"
  // Not enough history to judge (no trailing baseline, or the trailing median
  // is zero). Treated as healthy so fresh installs / no-traffic environments
  // don't page — there is simply nothing to compare against yet.
  | "insufficient_baseline"
  // The evaluated day saw zero prompts while the trailing baseline was
  // non-zero — the strongest signal that the prompt stopped firing.
  | "zero_today"
  // The evaluated day's count fell well below the trailing median (under the
  // configured floor ratio) — a partial regression worth investigating.
  | "below_median_floor"
  // The probe could not read the data (no DB configured, query failed). Marked
  // unhealthy so the gap is visible rather than silently passing.
  | "probe_unavailable";

export interface QuizSavePromptHealthConfig {
  // Which placement of the save-progress prompt to watch. Only
  // `result_screen` is the live post-result modal today; kept configurable so
  // the same probe can be repointed without touching the query.
  placement: string;
  // How many complete days of history to use as the trailing baseline
  // (excludes the evaluated day itself).
  trailingDays: number;
  // The evaluated day is unhealthy when its count is below
  // `median(trailing) * floorRatio`. 0.4 means "fell to under 40% of the
  // typical day". Zero-count days are always flagged regardless of this.
  floorRatio: number;
}

// ── Single source of truth for the alert thresholds ───────────────────────
// Tune the sensitivity of the alert here and nowhere else.
export const QUIZ_SAVE_PROMPT_HEALTH_CONFIG: QuizSavePromptHealthConfig = {
  placement: "result_screen",
  trailingDays: 7,
  floorRatio: 0.4,
};

export interface QuizSavePromptDailyCount {
  // UTC date, YYYY-MM-DD.
  date: string;
  shown: number;
}

export interface QuizSavePromptHealthSnapshot {
  healthy: boolean;
  reason: QuizSavePromptHealthReason;
  placement: string;
  // The most recent complete day that was evaluated.
  evaluated_day: { date: string | null; shown: number };
  trailing: {
    days: number;
    // Median of the trailing days' counts.
    median: number;
    // The threshold the evaluated day must clear: median * floorRatio.
    floor: number;
    counts: QuizSavePromptDailyCount[];
  };
  config: QuizSavePromptHealthConfig;
  generated_at: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Pure decision logic, factored out so it can be unit-tested without a DB.
// `series` must be ordered oldest-first; the last entry is the evaluated
// (most recent complete) day and everything before it is the trailing
// baseline.
export function evaluateQuizSavePromptHealth(
  series: QuizSavePromptDailyCount[],
  config: QuizSavePromptHealthConfig = QUIZ_SAVE_PROMPT_HEALTH_CONFIG,
): QuizSavePromptHealthSnapshot {
  const generatedAt = new Date().toISOString();
  const base = {
    placement: config.placement,
    config,
    generated_at: generatedAt,
  };

  if (series.length === 0) {
    return {
      ...base,
      healthy: true,
      reason: "insufficient_baseline",
      evaluated_day: { date: null, shown: 0 },
      trailing: { days: 0, median: 0, floor: 0, counts: [] },
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
    counts: trailing,
  };
  const evaluatedBlock = { date: evaluated.date, shown: evaluated.shown };

  // No usable baseline: either there is no trailing history or the trailing
  // median is zero (no traffic). Nothing to regress from — stay healthy.
  if (trailing.length === 0 || trailingMedian === 0) {
    return {
      ...base,
      healthy: true,
      reason: "insufficient_baseline",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock,
    };
  }

  if (evaluated.shown === 0) {
    return {
      ...base,
      healthy: false,
      reason: "zero_today",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock,
    };
  }

  if (evaluated.shown < floor) {
    return {
      ...base,
      healthy: false,
      reason: "below_median_floor",
      evaluated_day: evaluatedBlock,
      trailing: trailingBlock,
    };
  }

  return {
    ...base,
    healthy: true,
    reason: "ok",
    evaluated_day: evaluatedBlock,
    trailing: trailingBlock,
  };
}

// Snapshot for the case where the probe could not read the data at all (no
// DB configured or the query threw). Surfaced as unhealthy so the monitor
// fires rather than silently reporting "all good".
export function unavailableQuizSavePromptHealthSnapshot(
  config: QuizSavePromptHealthConfig = QUIZ_SAVE_PROMPT_HEALTH_CONFIG,
): QuizSavePromptHealthSnapshot {
  return {
    healthy: false,
    reason: "probe_unavailable",
    placement: config.placement,
    evaluated_day: { date: null, shown: 0 },
    trailing: { days: 0, median: 0, floor: 0, counts: [] },
    config,
    generated_at: new Date().toISOString(),
  };
}

// DB-backed compute: pulls the daily `quiz_save_shown` counts for the
// configured placement over the last `trailingDays + 1` complete days, then
// delegates the verdict to `evaluateQuizSavePromptHealth`.
export async function computeQuizSavePromptHealth(
  pool: pg.Pool,
  config: QuizSavePromptHealthConfig = QUIZ_SAVE_PROMPT_HEALTH_CONFIG,
): Promise<QuizSavePromptHealthSnapshot> {
  await ensureQuizSaveEventsTable(pool);
  // trailingDays of baseline + 1 evaluated (most recent complete) day.
  const totalDays = Math.max(2, Math.floor(config.trailingDays) + 1);

  // Build a zero-filled series of complete days (yesterday back `totalDays`)
  // so a day with no events still appears as an explicit 0 rather than
  // dropping out — otherwise a fully-silent day would be invisible to the
  // median/zero checks. `created_at < CURRENT_DATE` excludes the in-progress
  // day so a partial count can't trigger a false alarm.
  const result = await pool.query<{ date: string; shown: number }>(
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
    [totalDays, config.placement],
  );

  const series: QuizSavePromptDailyCount[] = result.rows.map((r) => ({
    date: String(r.date),
    shown: Number(r.shown) || 0,
  }));

  return evaluateQuizSavePromptHealth(series, config);
}
