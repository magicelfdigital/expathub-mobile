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
// that depends on it. Postgres back-fills existing rows with the
// migration-time NOW(), which would otherwise make historical plans look
// like they all started at the migration moment and pull the time-to-100%
// median toward zero. We follow the column add with a one-shot data
// backfill that rewrites the migration-stamped rows to a more honest
// estimate.
export function ensureUserProgressCreatedAt(pool: pg.Pool): Promise<void> {
  if (createdAtColumnPromise) return createdAtColumnPromise;
  createdAtColumnPromise = (async () => {
    try {
      await pool.query(
        `ALTER TABLE user_progress
           ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
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
// an identical timestamp (a single ALTER TABLE evaluates DEFAULT NOW()
// once for the bulk back-fill), which pulls the time-to-100% median
// toward zero. Real seeded inserts come in batches of
// GENERIC_PLAN_STEP_IDS.length rows per (user, country) pair via separate
// auto-commit INSERTs, so any timestamp shared by strictly more rows than
// one seed batch can only be the migration moment.
//
// For each detected migration timestamp we replace created_at with the
// earliest completed_at for the same (user_id, target_country) — the best
// proxy we have for when the plan was actually being worked on. Rows
// whose plan has no completions get NULL, which the median query
// explicitly excludes so historical noise stops polluting the metric.
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
      const seedBatchSize = GENERIC_PLAN_STEP_IDS.length;
      const candidates = await pool.query(
        `SELECT created_at
           FROM user_progress
          WHERE created_at IS NOT NULL
          GROUP BY created_at
         HAVING COUNT(*) > $1`,
        [seedBatchSize],
      );

      for (const row of candidates.rows) {
        const ts = row.created_at;
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
      }
    } catch (err) {
      createdAtBackfillPromise = null;
      throw err;
    }
  })();
  return createdAtBackfillPromise;
}

export type PlannerAnalyticsResult = {
  generatedAt: string;
  totalSteps: number;
  totals: {
    plansStarted: number;
    plansCompleted: number;
    completionRatePct: number;
    medianDaysToCompletion: number | null;
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
};

export async function computePlannerAnalytics(
  pool: pg.Pool,
): Promise<PlannerAnalyticsResult> {
  await ensureUserProgressCreatedAt(pool);

  const stepIds = [...GENERIC_PLAN_STEP_IDS];
  const totalSteps = stepIds.length;

  // Per-step completion counts. Denominator (plans started) is the count of
  // distinct (user_id, target_country) pairs that have any seeded row for
  // a generic step — since seedDefaultProgress inserts all 10 step rows on
  // first GET, this is equivalent to the number of plans ever opened.
  const perStep = await pool.query(
    `SELECT step_id,
            COUNT(*) FILTER (WHERE completed)::int AS completed,
            COUNT(*)::int                          AS started
       FROM user_progress
      WHERE step_id = ANY($1::text[])
      GROUP BY step_id`,
    [stepIds],
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
  const perPlan = await pool.query(
    `WITH per_plan AS (
       SELECT user_id,
              target_country,
              MIN(created_at)                              AS started_at,
              MAX(completed_at) FILTER (WHERE completed)   AS last_completed_at,
              COUNT(*) FILTER (WHERE completed)::int       AS done_steps
         FROM user_progress
        WHERE step_id = ANY($1::text[])
        GROUP BY user_id, target_country
     )
     SELECT
       COUNT(*)::int                                    AS plans_started,
       COUNT(*) FILTER (WHERE done_steps = $2)::int     AS plans_completed,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (last_completed_at - started_at)) / 86400.0
       ) FILTER (WHERE done_steps = $2 AND started_at IS NOT NULL)
                                                        AS median_days
     FROM per_plan`,
    [stepIds, totalSteps],
  );
  const plansStarted = Number(perPlan.rows[0]?.plans_started ?? 0);
  const plansCompleted = Number(perPlan.rows[0]?.plans_completed ?? 0);
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

    const stageDone = await pool.query(
      `WITH per_plan AS (
         SELECT user_id, target_country,
                COUNT(*) FILTER (WHERE completed)::int AS done
           FROM user_progress
          WHERE step_id = ANY($1::text[])
          GROUP BY user_id, target_country
       )
       SELECT COUNT(*) FILTER (WHERE done = $2)::int AS finished
         FROM per_plan`,
      [stageSteps, stageSteps.length],
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

  return {
    generatedAt: new Date().toISOString(),
    totalSteps,
    totals: {
      plansStarted,
      plansCompleted,
      completionRatePct:
        plansStarted > 0
          ? Math.round((plansCompleted / plansStarted) * 1000) / 10
          : 0,
      medianDaysToCompletion,
    },
    stepCompletion,
    stageDropOff,
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

export function renderPlannerAnalyticsHtml(
  data: PlannerAnalyticsResult,
): string {
  const median =
    data.totals.medianDaysToCompletion === null
      ? "—"
      : `${data.totals.medianDaysToCompletion.toFixed(1)} days`;

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
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; }
    .card .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 24px; font-weight: 600; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; }
    th { background: #f6f6f6; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    a { color: #0a66c2; }
    .nav { font-size: 12px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">← Admin tools</a></div>
  <h1>Planner completion analytics</h1>
  <p class="meta">
    Aggregated from <code>user_progress</code>. Generated ${escapeHtml(data.generatedAt)}.
    Equivalent JSON at <a href="/api/admin/planner-analytics"><code>/api/admin/planner-analytics</code></a>.
  </p>

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
    </div>
  </div>

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
</body>
</html>`;
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
        completion, and drop-off by planner stage. JSON at
        <code>/api/admin/planner-analytics</code>.
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
      const data = await computePlannerAnalytics(pool);
      res.json(data);
    } catch (err: any) {
      console.error("Planner analytics error:", err?.message);
      res.status(500).json({ error: "Failed to compute planner analytics" });
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
      const data = await computePlannerAnalytics(pool);
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
