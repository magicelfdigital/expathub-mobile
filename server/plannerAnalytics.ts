import type { Express, Request, Response } from "express";
import pg from "pg";
import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";

// Stage assignment mirrors src/data/planSteps.ts (PLAN_STAGES). Kept in
// server-only territory so the admin endpoint can group by stage without
// pulling in the React Native data module (which imports rn-only deps).
const STEP_TO_STAGE: Record<string, "research" | "visa" | "money" | "logistics"> = {
  research_quiz: "research",
  shortlist_built: "research",
  visa_pathway: "visa",
  visa_selected: "visa",
  finances_reviewed: "money",
  tax_research: "money",
  housing_research: "logistics",
  school_research: "logistics",
  flight_booked: "logistics",
  move_date_set: "logistics",
};

const STAGE_ORDER: Array<"research" | "visa" | "money" | "logistics"> = [
  "research",
  "visa",
  "money",
  "logistics",
];

const STAGE_TITLES: Record<string, string> = {
  research: "Research",
  visa: "Visa & Legal",
  money: "Money & Tax",
  logistics: "Logistics & Move",
};

const STEP_TITLES: Record<string, string> = {
  research_quiz: "Take the readiness quiz",
  shortlist_built: "Build your shortlist",
  visa_pathway: "Identify a visa pathway",
  visa_selected: "Submit your visa application",
  finances_reviewed: "Review your finances",
  tax_research: "Plan your tax strategy",
  housing_research: "Research housing",
  school_research: "Research schools (if applicable)",
  flight_booked: "Book your flight",
  move_date_set: "Set your move date",
};

// Name we record in `schema_migrations` for the user_progress.created_at
// lazy DDL. The backfill keys off this exact name so it can find the
// timestamp captured at column-add time.
const USER_PROGRESS_CREATED_AT_MIGRATION = "user_progress_created_at";

// Default minimum number of plans started a country must have to be included
// in the per-country breakdown table. Suppresses single-row noise (typos,
// throwaway accounts) from skewing the comparison view. Override per-request
// via the `minPlans` query parameter.
const DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN = 3;

// Process-level memoization is held as a Promise so concurrent callers
// share the in-flight work instead of racing the migration, AND so that
// a failure clears the memo and the next caller retries. (Storing a bare
// boolean would lock us into the failed state until restart.)
let createdAtColumnPromise: Promise<void> | null = null;
let createdAtBackfillPromise: Promise<void> | null = null;

// Single source of truth for the user_progress.created_at lazy migration.
// Idempotent and process-cached: subsequent callers re-await the same
// promise. Both the /api/progress seed flow and /api/admin/planner-analytics
// route through here so the column always exists before any reader/writer
// that depends on it. Postgres would otherwise back-fill existing rows
// with the migration-time NOW(), making historical plans look like they
// all started at the migration moment and pulling the time-to-100% median
// toward zero — so we add the column inside an atomic DO block that
// captures NOW() once, stamps every existing row with that exact
// timestamp, switches the column default to NOW() for future inserts, and
// records the captured timestamp in `schema_migrations`. The follow-up
// data backfill then targets that exact timestamp instead of guessing.
export function ensureUserProgressCreatedAt(pool: pg.Pool): Promise<void> {
  if (createdAtColumnPromise) return createdAtColumnPromise;
  createdAtColumnPromise = (async () => {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TIMESTAMP NOT NULL
         )`,
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
         END $do$;`,
      );
      await backfillUserProgressMigrationCreatedAt(pool);
    } catch (err) {
      // Drop the memo so the next caller retries instead of inheriting
      // the failure for the lifetime of the process.
      createdAtColumnPromise = null;
      throw err;
    }
  })();
  return createdAtColumnPromise;
}

// One-shot data fix-up for rows that were stamped with the migration-time
// NOW() when the created_at column was first added. Those rows all share
// the exact timestamp recorded in `schema_migrations` by
// `ensureUserProgressCreatedAt`, so we look that timestamp up and target
// only those rows.
//
// We replace created_at with the earliest completed_at for the same
// (user_id, target_country) — the best proxy we have for when the plan
// was actually being worked on. Rows whose plan has no completions get
// NULL, which the median query explicitly excludes so historical noise
// stops polluting the metric.
//
// Process-cached via a memoized promise: concurrent callers share the
// in-flight run, successful runs short-circuit forever, and a failure
// clears the memo so the next caller retries (avoiding a permanent
// half-backfilled state until restart).
export function backfillUserProgressMigrationCreatedAt(
  pool: pg.Pool,
): Promise<void> {
  if (createdAtBackfillPromise) return createdAtBackfillPromise;
  createdAtBackfillPromise = (async () => {
    try {
      const recorded = await pool.query(
        `SELECT applied_at
           FROM schema_migrations
          WHERE name = $1`,
        [USER_PROGRESS_CREATED_AT_MIGRATION],
      );
      if (recorded.rows.length === 0) {
        // No record means either the column was added by an earlier code
        // path that didn't track migrations (in which case the previous
        // heuristic-based backfill has already run against this DB) or
        // the column hasn't been added yet. Either way there is nothing
        // for us to do.
        return;
      }
      const ts = recorded.rows[0].applied_at;
      // Step 1 — promote rows that have any completion in their plan
      // to the earliest completion timestamp for that (user, country)
      // pair.
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
        [ts],
      );
      // Step 2 — anything still pinned to the migration timestamp has
      // no completion to anchor to; null it out so the median query
      // skips it.
      await pool.query(
        `UPDATE user_progress
            SET created_at = NULL
          WHERE created_at = $1`,
        [ts],
      );
    } catch (err) {
      createdAtBackfillPromise = null;
      throw err;
    }
  })();
  return createdAtBackfillPromise;
}

export type CountryBreakdown = {
  country: string;
  plansStarted: number;
  plansCompleted: number;
  completionRatePct: number;
  medianDaysToCompletion: number | null;
  // Per-country counterparts to totals.medianSampleSize /
  // totals.medianExcludedUnknownStart. Surfacing them per row lets
  // admins judge whether a slow-looking country is really slow or
  // just based on a tiny sample.
  medianSampleSize: number;
  medianExcludedUnknownStart: number;
};

export type PlannerAnalyticsResult = {
  generatedAt: string;
  totalSteps: number;
  filter: {
    country: string | null;
    minPlansForCountryBreakdown: number;
  };
  countries: string[];
  totals: {
    plansStarted: number;
    plansCompleted: number;
    completionRatePct: number;
    medianDaysToCompletion: number | null;
    // How many completed plans were excluded from the median because
    // their start time is unknown (created_at IS NULL — see
    // backfillUserProgressMigrationCreatedAt). Surfaced so admins can
    // judge how trustworthy the median is: a small included-N or a
    // large excluded share materially weakens the headline.
    medianSampleSize: number;
    medianExcludedUnknownStart: number;
    medianExcludedUnknownStartPct: number;
  };
  stepCompletion: Array<{
    stepId: string;
    title: string;
    stage: string;
    completed: number;
    started: number;
    completionRatePct: number;
  }>;
  stageDropOff: Array<{
    stage: string;
    title: string;
    stepCount: number;
    averageStepCompletionRatePct: number;
    plansFinishingStage: number;
    plansFinishingStagePct: number;
  }>;
  // ISO-week buckets, oldest-first, covering the most recent 8 weeks
  // (inclusive of the current in-progress week). Each row is keyed by the
  // Monday of the week that the plan was *started* in. Weeks with no
  // plans started still appear as zero rows so the time series is dense.
  weekly: Array<{
    weekStart: string; // YYYY-MM-DD (Monday of the ISO week)
    plansStarted: number;
    plansCompleted: number;
    medianDaysToCompletion: number | null;
  }>;
  byCountry: CountryBreakdown[];
};

export type PlannerAnalyticsOptions = {
  country?: string | null;
  minPlansForCountryBreakdown?: number;
};

function normalizeCountry(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function computePlannerAnalytics(
  pool: pg.Pool,
  options: PlannerAnalyticsOptions = {},
): Promise<PlannerAnalyticsResult> {
  await ensureUserProgressCreatedAt(pool);

  const stepIds = [...GENERIC_PLAN_STEP_IDS];
  const totalSteps = stepIds.length;
  const country = normalizeCountry(options.country ?? null);
  const minPlans = Math.max(
    1,
    Math.floor(
      options.minPlansForCountryBreakdown ??
        DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN,
    ),
  );

  // Per-step completion counts. Denominator (plans started) is the count of
  // distinct (user_id, target_country) pairs that have any seeded row for
  // a generic step — since seedDefaultProgress inserts all 10 step rows on
  // first GET, this is equivalent to the number of plans ever opened. When
  // a country filter is supplied, all queries below add an
  // `AND target_country = $N` predicate so totals/steps/stages narrow
  // accordingly.
  type SqlParam = string | number | string[];
  const perStepParams: SqlParam[] = [stepIds];
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
    perStepParams,
  );
  const stepRows = new Map<string, { completed: number; started: number }>();
  for (const row of perStep.rows) {
    stepRows.set(row.step_id, {
      completed: Number(row.completed) || 0,
      started: Number(row.started) || 0,
    });
  }

  // Per-plan rollup: how many of the generic steps each (user, country) has
  // completed, and the time bounds we need for time-to-100%. Used for the
  // overall plansStarted, plansCompleted, and median calculations.
  //
  // started_at IS NOT NULL is a deliberate filter: the migration backfill
  // (see backfillUserProgressMigrationCreatedAt) nulls out created_at on
  // pre-migration rows whose plan never produced a completion to anchor
  // to. Excluding them from the median keeps historical noise out of the
  // time-to-100% metric.
  const perPlanParams: SqlParam[] = [stepIds, totalSteps];
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
    perPlanParams,
  );
  const plansStarted = Number(perPlan.rows[0]?.plans_started ?? 0);
  const plansCompleted = Number(perPlan.rows[0]?.plans_completed ?? 0);
  const medianSampleSize = Number(perPlan.rows[0]?.median_sample_size ?? 0);
  const medianExcludedUnknownStart = Number(
    perPlan.rows[0]?.median_excluded_unknown_start ?? 0,
  );
  const medianExcludedUnknownStartPct =
    plansCompleted > 0
      ? Math.round((medianExcludedUnknownStart / plansCompleted) * 1000) / 10
      : 0;
  const medianDaysRaw = perPlan.rows[0]?.median_days;
  const medianDaysToCompletion =
    medianDaysRaw === null || medianDaysRaw === undefined
      ? null
      : Math.round(Number(medianDaysRaw) * 10) / 10;

  const stepCompletion = stepIds.map((stepId) => {
    const row = stepRows.get(stepId) ?? { completed: 0, started: 0 };
    const denom = row.started || plansStarted;
    return {
      stepId,
      title: STEP_TITLES[stepId] ?? stepId,
      stage: STEP_TO_STAGE[stepId] ?? "other",
      completed: row.completed,
      started: denom,
      completionRatePct:
        denom > 0 ? Math.round((row.completed / denom) * 1000) / 10 : 0,
    };
  });

  // Drop-off per stage: average completion rate of the steps in that stage,
  // plus how many plans have finished every step of the stage. The latter
  // shows where users are bailing — a sharp drop between consecutive
  // stage-completion percentages flags the funnel leak.
  const stageDropOffPromises = STAGE_ORDER.map(async (stage) => {
    const stageSteps = stepIds.filter((id) => STEP_TO_STAGE[id] === stage);
    if (stageSteps.length === 0) {
      return {
        stage,
        title: STAGE_TITLES[stage] ?? stage,
        stepCount: 0,
        averageStepCompletionRatePct: 0,
        plansFinishingStage: 0,
        plansFinishingStagePct: 0,
      };
    }
    const stageCompletionRates = stageSteps.map((id) => {
      const r = stepRows.get(id) ?? { completed: 0, started: 0 };
      const denom = r.started || plansStarted;
      return denom > 0 ? r.completed / denom : 0;
    });
    const avgRate =
      stageCompletionRates.reduce((a, b) => a + b, 0) /
      stageCompletionRates.length;

    const stageParams: SqlParam[] = [stageSteps, stageSteps.length];
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
      stageParams,
    );
    const finished = Number(stageDone.rows[0]?.finished ?? 0);
    return {
      stage,
      title: STAGE_TITLES[stage] ?? stage,
      stepCount: stageSteps.length,
      averageStepCompletionRatePct: Math.round(avgRate * 1000) / 10,
      plansFinishingStage: finished,
      plansFinishingStagePct:
        plansStarted > 0
          ? Math.round((finished / plansStarted) * 1000) / 10
          : 0,
    };
  });
  const stageDropOff = await Promise.all(stageDropOffPromises);

  // Weekly time series: bucket plans by the ISO week of their started_at,
  // restricted to the most recent 8 weeks (Monday..Sunday, inclusive of the
  // current in-progress week). We left-join against a generated 8-row series
  // so weeks with zero plans-started still appear as explicit zero rows —
  // otherwise a quiet week would silently disappear from the dashboard and
  // hide a regression. date_trunc('week', ...) in Postgres uses ISO week
  // semantics (Monday-start), which is what the task asks for. The country
  // filter (if active) is propagated here so the trend tracks the same
  // narrowed slice as the headline totals.
  const weeklyParams: SqlParam[] = [stepIds, totalSteps];
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
    weeklyParams,
  );
  const weekly = weeklyRows.rows.map((row) => {
    const median =
      row.median_days === null || row.median_days === undefined
        ? null
        : Math.round(Number(row.median_days) * 10) / 10;
    return {
      weekStart: String(row.week_start),
      plansStarted: Number(row.plans_started) || 0,
      plansCompleted: Number(row.plans_completed) || 0,
      medianDaysToCompletion: median,
    };
  });

  // Per-country breakdown. When the `country` option is supplied the
  // breakdown narrows to that single country (matching the rest of the
  // filtered dashboard) and the minPlans threshold is bypassed so the
  // selected country always appears. Without a filter, every country with
  // at least minPlans plans started is returned for cross-country
  // comparison.
  const byCountryParams: SqlParam[] = [stepIds, totalSteps];
  let byCountryWhere = "";
  let byCountryHaving = "";
  if (country) {
    byCountryParams.push(country);
    byCountryWhere = ` AND target_country = $${byCountryParams.length}`;
  } else {
    byCountryParams.push(minPlans);
    byCountryHaving = `\n     HAVING COUNT(*) >= $${byCountryParams.length}`;
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
    byCountryParams,
  );
  const byCountry: CountryBreakdown[] = byCountryQuery.rows.map((row) => {
    const started = Number(row.plans_started) || 0;
    const completed = Number(row.plans_completed) || 0;
    const median =
      row.median_days === null || row.median_days === undefined
        ? null
        : Math.round(Number(row.median_days) * 10) / 10;
    return {
      country: String(row.target_country),
      plansStarted: started,
      plansCompleted: completed,
      completionRatePct:
        started > 0 ? Math.round((completed / started) * 1000) / 10 : 0,
      medianDaysToCompletion: median,
      medianSampleSize: Number(row.median_sample_size) || 0,
      medianExcludedUnknownStart:
        Number(row.median_excluded_unknown_start) || 0,
    };
  });

  // Distinct list of countries for the dashboard's filter dropdown. Drawn
  // from the same user_progress table (no min-plans threshold) so even
  // brand-new countries show up immediately as a filter option.
  const allCountriesQuery = await pool.query(
    `SELECT DISTINCT target_country
       FROM user_progress
      WHERE step_id = ANY($1::text[])
        AND target_country IS NOT NULL
      ORDER BY target_country`,
    [stepIds],
  );
  const countries = allCountriesQuery.rows
    .map((row) => String(row.target_country))
    .filter((c) => c.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    totalSteps,
    filter: {
      country,
      minPlansForCountryBreakdown: minPlans,
    },
    countries,
    totals: {
      plansStarted,
      plansCompleted,
      completionRatePct:
        plansStarted > 0
          ? Math.round((plansCompleted / plansStarted) * 1000) / 10
          : 0,
      medianDaysToCompletion,
      medianSampleSize,
      medianExcludedUnknownStart,
      medianExcludedUnknownStartPct,
    },
    stepCompletion,
    stageDropOff,
    weekly,
    byCountry,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCaseCountry(country: string): string {
  return country
    .split(/[\s_-]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

export function renderPlannerAnalyticsHtml(
  data: PlannerAnalyticsResult,
): string {
  const median =
    data.totals.medianDaysToCompletion === null
      ? "—"
      : `${data.totals.medianDaysToCompletion.toFixed(1)} days`;
  const {
    medianSampleSize,
    medianExcludedUnknownStart,
    medianExcludedUnknownStartPct,
  } = data.totals;
  // Sub-line beneath the median tile so the headline isn't read in
  // isolation. Spell out the included sample size and how many completed
  // plans were dropped because their start time is unknown — small N or a
  // big excluded share both warrant skepticism.
  const sampleNoun = medianSampleSize === 1 ? "plan" : "plans";
  const medianBasis = `Based on ${medianSampleSize.toLocaleString()} ${sampleNoun}`;
  const medianExclusionNote =
    medianExcludedUnknownStart > 0
      ? `${medianExcludedUnknownStart.toLocaleString()} completed ${
          medianExcludedUnknownStart === 1 ? "plan" : "plans"
        } excluded (unknown start, ${medianExcludedUnknownStartPct.toFixed(
          1,
        )}% of completed)`
      : "0 completed plans excluded";

  const stepRowsHtml = data.stepCompletion
    .map(
      (s) => `
      <tr>
        <td><code>${escapeHtml(s.stepId)}</code></td>
        <td>${escapeHtml(s.title)}</td>
        <td>${escapeHtml(STAGE_TITLES[s.stage] ?? s.stage)}</td>
        <td class="num">${s.completed.toLocaleString()}</td>
        <td class="num">${s.started.toLocaleString()}</td>
        <td class="num">${s.completionRatePct.toFixed(1)}%</td>
      </tr>`,
    )
    .join("");

  const stageRowsHtml = data.stageDropOff
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.title)}</td>
        <td class="num">${s.stepCount}</td>
        <td class="num">${s.averageStepCompletionRatePct.toFixed(1)}%</td>
        <td class="num">${s.plansFinishingStage.toLocaleString()}</td>
        <td class="num">${s.plansFinishingStagePct.toFixed(1)}%</td>
      </tr>`,
    )
    .join("");

  const weeklyRowsHtml = data.weekly
    .map((w) => {
      const completionPct =
        w.plansStarted > 0
          ? `${(Math.round((w.plansCompleted / w.plansStarted) * 1000) / 10).toFixed(1)}%`
          : "—";
      const medianCell =
        w.medianDaysToCompletion === null
          ? "—"
          : `${w.medianDaysToCompletion.toFixed(1)} days`;
      return `
      <tr>
        <td><code>${escapeHtml(w.weekStart)}</code></td>
        <td class="num">${w.plansStarted.toLocaleString()}</td>
        <td class="num">${w.plansCompleted.toLocaleString()}</td>
        <td class="num">${escapeHtml(completionPct)}</td>
        <td class="num">${escapeHtml(medianCell)}</td>
      </tr>`;
    })
    .join("");

  const activeCountry = data.filter.country;
  const minPlans = data.filter.minPlansForCountryBreakdown;

  const countryOptionsHtml = data.countries
    .map((c) => {
      const selected = c === activeCountry ? " selected" : "";
      return `<option value="${escapeHtml(c)}"${selected}>${escapeHtml(
        titleCaseCountry(c),
      )}</option>`;
    })
    .join("");

  const emptyMessage = activeCountry
    ? `No plans started yet for ${escapeHtml(titleCaseCountry(activeCountry))}.`
    : `No countries have at least ${minPlans} plan${
        minPlans === 1 ? "" : "s"
      } started yet.`;
  // Horizontal bar chart of completion rate per country, sorted high→low.
  // Uses the same `data.byCountry` array as the breakdown table, so it
  // naturally respects the active country filter and the minPlans
  // threshold (no separate query needed). Rendered as plain HTML/CSS so
  // it works without any client-side JS or external chart library.
  const byCountryChartRows = [...data.byCountry].sort(
    (a, b) => b.completionRatePct - a.completionRatePct,
  );
  // Bars are scaled on a true 0–100% axis (not relative to the best
  // country in view) so the absolute level of completion is read
  // honestly. A relative scale would visually overstate a field where
  // every country is in single digits.
  const byCountryChartHtml = byCountryChartRows.length
    ? `
  <div class="chart" role="img" aria-label="Completion rate per country, 0 to 100 percent">
    ${byCountryChartRows
      .map((row) => {
        const widthPct =
          Math.round(Math.min(100, Math.max(0, row.completionRatePct)) * 10) /
          10;
        return `
    <div class="chart-row">
      <div class="chart-label">${escapeHtml(titleCaseCountry(row.country))}</div>
      <div class="chart-track">
        <div class="chart-bar" style="width: ${widthPct}%"></div>
      </div>
      <div class="chart-value">${row.completionRatePct.toFixed(1)}%</div>
    </div>`;
      })
      .join("")}
  </div>`
    : `<p class="meta empty">${emptyMessage}</p>`;

  const byCountryRowsHtml = data.byCountry.length
    ? data.byCountry
        .map((row) => {
          // Render "—" for the median when there's no usable sample so the
          // table doesn't imply precision we don't have. Sample-size and
          // excluded counts always show as numbers (including zero) so it's
          // obvious whether the dash means "no completions" vs. "all
          // completions had unknown start".
          const medianCell =
            row.medianDaysToCompletion === null
              ? "—"
              : `${row.medianDaysToCompletion.toFixed(1)} days`;
          const filterHref = `/admin/planner-analytics?country=${encodeURIComponent(
            row.country,
          )}`;
          const countryCell = activeCountry
            ? escapeHtml(titleCaseCountry(row.country))
            : `<a href="${escapeHtml(filterHref)}">${escapeHtml(
                titleCaseCountry(row.country),
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
        })
        .join("")
    : `<tr><td colspan="7" class="empty">${emptyMessage}</td></tr>`;

  const filterBadge = activeCountry
    ? `<span class="badge">Filtered to <strong>${escapeHtml(
        titleCaseCountry(activeCountry),
      )}</strong> · <a href="/admin/planner-analytics">clear</a></span>`
    : `<span class="badge muted">All countries</span>`;

  const jsonHref = activeCountry
    ? `/api/admin/planner-analytics?country=${encodeURIComponent(activeCountry)}`
    : `/api/admin/planner-analytics`;

  const csvQueryParts: string[] = [];
  if (activeCountry) {
    csvQueryParts.push(`country=${encodeURIComponent(activeCountry)}`);
  }
  if (!activeCountry && minPlans !== DEFAULT_MIN_PLANS_FOR_COUNTRY_BREAKDOWN) {
    csvQueryParts.push(`minPlans=${minPlans}`);
  }
  const csvHref = csvQueryParts.length
    ? `/admin/planner-analytics.csv?${csvQueryParts.join("&")}`
    : `/admin/planner-analytics.csv`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Planner Analytics — ExpatHub Admin</title>
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
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">← Admin tools</a></div>
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
      <div class="value">${escapeHtml(median)}</div>
      <div class="sub">
        <span>${escapeHtml(medianBasis)}</span>
        <span class="excluded">${escapeHtml(medianExclusionNote)}</span>
      </div>
    </div>
  </div>

  <h2>Last 8 weeks</h2>
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
    ${
      activeCountry
        ? `Showing only <strong>${escapeHtml(titleCaseCountry(activeCountry))}</strong> because the country filter is active. Clear the filter to compare every country side by side.`
        : `Includes any country with at least ${minPlans} plan${minPlans === 1 ? "" : "s"} started — adjust via <code>?minPlans=N</code>. Click a country name to drill in.`
    }
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
</body>
</html>`;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function renderPlannerAnalyticsCsv(data: PlannerAnalyticsResult): string {
  const header = [
    "country",
    "plans_started",
    "reached_100",
    "pct_reaching_100",
    "median_days_to_completion",
  ].join(",");
  const rows = data.byCountry.map((row) =>
    [
      csvEscape(row.country),
      csvEscape(row.plansStarted),
      csvEscape(row.plansCompleted),
      csvEscape(row.completionRatePct.toFixed(1)),
      csvEscape(
        row.medianDaysToCompletion === null
          ? ""
          : row.medianDaysToCompletion.toFixed(1),
      ),
    ].join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

export function renderAdminIndexHtml(): string {
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
      <a href="/api/admin/ab-results">A/B test results (JSON)</a>
      <div class="desc">
        Variant-level visitors, conversions, day-0 / day-60 revenue and ARPU
        for the paid-intro and annual-price tests.
      </div>
    </li>
  </ul>
</body>
</html>`;
}

function readQueryString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readQueryNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readPlannerAnalyticsOptions(req: Request): PlannerAnalyticsOptions {
  return {
    country: readQueryString(req.query.country),
    minPlansForCountryBreakdown: readQueryNumber(req.query.minPlans),
  };
}

export function registerPlannerAnalyticsRoutes(
  app: Express,
  deps: {
    requireAdminBasicAuth: (req: Request, res: Response) => boolean;
    getPool: () => pg.Pool | null;
  },
): void {
  app.get("/api/admin/planner-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req),
      );
      res.json(data);
    } catch (err: any) {
      console.error("Planner analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute planner analytics" });
    } finally {
      await pool.end();
    }
  });

  app.get("/admin/planner-analytics.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/plain").send("Database not configured");
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req),
      );
      const csv = renderPlannerAnalyticsCsv(data);
      const filenameSuffix = data.filter.country
        ? `-${data.filter.country.replace(/[^a-z0-9-]+/gi, "-")}`
        : "";
      res.type("text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planner-analytics-by-country${filenameSuffix}.csv"`,
      );
      res.send(csv);
    } catch (err: any) {
      console.error("Planner analytics CSV error:", err?.message);
      res.status(500).type("text/plain").send("Failed to compute planner analytics");
    } finally {
      await pool.end();
    }
  });

  app.get("/admin/planner-analytics", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    const pool = deps.getPool();
    if (!pool) {
      res.status(503).type("text/html").send(
        renderAdminIndexHtml().replace(
          "Basic-Auth-protected dashboards aggregating product data.",
          "Database is not configured (set DATABASE_URL).",
        ),
      );
      return;
    }
    try {
      const data = await computePlannerAnalytics(
        pool,
        readPlannerAnalyticsOptions(req),
      );
      res.type("text/html").send(renderPlannerAnalyticsHtml(data));
    } catch (err: any) {
      console.error("Planner analytics HTML error:", err?.message);
      res.status(500).type("text/html").send(
        `<h1>Planner analytics unavailable</h1><pre>${escapeHtml(
          err?.message ?? "unknown",
        )}</pre>`,
      );
    } finally {
      await pool.end();
    }
  });

  app.get("/admin", (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    res.type("text/html").send(renderAdminIndexHtml());
  });
}
