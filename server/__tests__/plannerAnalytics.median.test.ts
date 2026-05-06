import { renderPlannerAnalyticsHtml } from "../plannerAnalytics";
import type { PlannerAnalyticsResult } from "../plannerAnalytics";

// Re-import the module under test fresh for tests that touch
// computePlannerAnalytics so the module-level memoization
// (ensureUserProgressCreatedAt / backfill promises) starts clean.
function freshModule(): typeof import("../plannerAnalytics") {
  let mod!: typeof import("../plannerAnalytics");
  jest.isolateModules(() => {
    mod = require("../plannerAnalytics");
  });
  return mod;
}

// Fake pool that returns deterministic shapes for each query
// computePlannerAnalytics issues. We don't need real SQL execution —
// we just need to assert the values from the per-plan rollup row flow
// through into the returned JSON totals.
function makeComputePool(perPlanRow: {
  plans_started: number;
  plans_completed: number;
  median_sample_size: number;
  median_excluded_unknown_start: number;
  median_days: number | null;
}) {
  const query = jest.fn(async (text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed.startsWith("ALTER TABLE user_progress")) return { rows: [] };
    if (
      trimmed.startsWith("SELECT created_at FROM user_progress") &&
      trimmed.includes("HAVING COUNT(*) >")
    )
      return { rows: [] };
    if (trimmed.startsWith("SELECT step_id,")) return { rows: [] };
    if (trimmed.startsWith("WITH per_plan AS") && trimmed.includes("median_days"))
      return { rows: [perPlanRow] };
    if (trimmed.startsWith("WITH per_plan AS"))
      return { rows: [{ finished: 0 }] };
    throw new Error(`Unexpected query: ${trimmed}`);
  });
  return { pool: { query } as any, query };
}

function baseData(
  overrides: Partial<PlannerAnalyticsResult["totals"]> = {},
): PlannerAnalyticsResult {
  return {
    generatedAt: "2026-04-28T12:00:00.000Z",
    totalSteps: 10,
    totals: {
      plansStarted: 100,
      plansCompleted: 25,
      completionRatePct: 25.0,
      medianDaysToCompletion: 12.3,
      medianSampleSize: 20,
      medianExcludedUnknownStart: 5,
      medianExcludedUnknownStartPct: 20.0,
      ...overrides,
    },
    stepCompletion: [],
    stageDropOff: [],
  };
}

describe("renderPlannerAnalyticsHtml — median exclusion transparency", () => {
  it("shows the included sample size next to the median tile", () => {
    const html = renderPlannerAnalyticsHtml(baseData());
    expect(html).toContain("Median time-to-100%");
    expect(html).toContain("Based on 20 plans");
  });

  it("calls out how many completed plans were excluded for unknown start", () => {
    const html = renderPlannerAnalyticsHtml(baseData());
    expect(html).toContain(
      "5 completed plans excluded (unknown start, 20.0% of completed)",
    );
  });

  it("singularises the noun when exactly one plan is excluded", () => {
    const html = renderPlannerAnalyticsHtml(
      baseData({
        plansCompleted: 10,
        medianSampleSize: 9,
        medianExcludedUnknownStart: 1,
        medianExcludedUnknownStartPct: 10.0,
      }),
    );
    expect(html).toContain(
      "1 completed plan excluded (unknown start, 10.0% of completed)",
    );
  });

  it("singularises the basis noun when sample size is one", () => {
    const html = renderPlannerAnalyticsHtml(
      baseData({
        plansCompleted: 1,
        medianSampleSize: 1,
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      }),
    );
    expect(html).toContain("Based on 1 plan");
    expect(html).not.toContain("Based on 1 plans");
  });

  it("renders a zero-excluded state explicitly so the absence is visible", () => {
    const html = renderPlannerAnalyticsHtml(
      baseData({
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      }),
    );
    expect(html).toContain("0 completed plans excluded");
    // Don't accidentally render the parenthetical when there's nothing to qualify.
    expect(html).not.toContain("0 completed plans excluded (unknown start");
  });

  it("formats large excluded counts with thousands separators", () => {
    const html = renderPlannerAnalyticsHtml(
      baseData({
        plansCompleted: 5000,
        medianSampleSize: 3500,
        medianExcludedUnknownStart: 1500,
        medianExcludedUnknownStartPct: 30.0,
      }),
    );
    expect(html).toContain("Based on 3,500 plans");
    expect(html).toContain(
      "1,500 completed plans excluded (unknown start, 30.0% of completed)",
    );
  });
});

describe("computePlannerAnalytics — median sample-size & exclusion totals", () => {
  it("flows the SQL rollup counts through into the returned JSON totals", async () => {
    const { computePlannerAnalytics } = freshModule();
    const { pool } = makeComputePool({
      plans_started: 100,
      plans_completed: 25,
      median_sample_size: 20,
      median_excluded_unknown_start: 5,
      median_days: 12.345,
    });

    const result = await computePlannerAnalytics(pool);

    expect(result.totals.plansStarted).toBe(100);
    expect(result.totals.plansCompleted).toBe(25);
    // Verify the new fields surface in the public payload exactly as the
    // SQL returned them (median_days rounded to 1 decimal as before).
    expect(result.totals.medianDaysToCompletion).toBe(12.3);
    expect(result.totals.medianSampleSize).toBe(20);
    expect(result.totals.medianExcludedUnknownStart).toBe(5);
    // 5 / 25 = 20.0%
    expect(result.totals.medianExcludedUnknownStartPct).toBe(20.0);
  });

  it("reports a zero exclusion percentage when no completed plans exist", async () => {
    const { computePlannerAnalytics } = freshModule();
    const { pool } = makeComputePool({
      plans_started: 10,
      plans_completed: 0,
      median_sample_size: 0,
      median_excluded_unknown_start: 0,
      median_days: null,
    });

    const result = await computePlannerAnalytics(pool);
    expect(result.totals.medianDaysToCompletion).toBeNull();
    expect(result.totals.medianSampleSize).toBe(0);
    expect(result.totals.medianExcludedUnknownStart).toBe(0);
    // No divide-by-zero — guarded explicitly.
    expect(result.totals.medianExcludedUnknownStartPct).toBe(0);
  });

  it("rounds the exclusion percentage to one decimal place", async () => {
    const { computePlannerAnalytics } = freshModule();
    const { pool } = makeComputePool({
      plans_started: 100,
      plans_completed: 7,
      median_sample_size: 5,
      median_excluded_unknown_start: 2, // 2 / 7 = 28.5714…%
      median_days: 1,
    });

    const result = await computePlannerAnalytics(pool);
    expect(result.totals.medianExcludedUnknownStartPct).toBe(28.6);
  });
});
