import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import {
  computePlannerAnalytics,
  parseDateRange,
  registerPlannerAnalyticsRoutes,
  renderPlannerAnalyticsCsv,
  renderRangeComparisonCsv,
  renderPlannerAnalyticsHtml,
  type PlannerAnalyticsResult,
} from "../plannerAnalytics";
import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";

type QueryFn = (text: string, values?: any[]) => Promise<{ rows: any[] }>;

function makePool(handler: QueryFn) {
  return {
    query: jest.fn(handler),
  } as any;
}

type QueryCall = { text: string; values: unknown[] };

type FakeRow = Record<string, unknown>;

function makeFakePool(handler: (call: QueryCall) => { rows: FakeRow[] }) {
  const calls: QueryCall[] = [];
  const pool = {
    query: jest.fn(async (text: string, values?: unknown[]) => {
      const call: QueryCall = { text, values: values ?? [] };
      calls.push(call);
      return handler(call);
    }),
  } as unknown as Parameters<typeof computePlannerAnalytics>[0];
  return { pool, calls };
}

describe("computePlannerAnalytics — weekly time series", () => {
  it("returns a `weekly` array with 8 ISO-week buckets keyed by week-start date", async () => {
    const weeklyRows = [
      { week_start: "2026-03-09", plans_started: 0, plans_completed: 0, median_days: null },
      { week_start: "2026-03-16", plans_started: 4, plans_completed: 1, median_days: 5.0 },
      { week_start: "2026-03-23", plans_started: 7, plans_completed: 3, median_days: 6.25 },
      { week_start: "2026-03-30", plans_started: 9, plans_completed: 4, median_days: 4.5 },
      { week_start: "2026-04-06", plans_started: 2, plans_completed: 0, median_days: null },
      { week_start: "2026-04-13", plans_started: 11, plans_completed: 5, median_days: 3.0 },
      { week_start: "2026-04-20", plans_started: 6, plans_completed: 2, median_days: 2.0 },
      { week_start: "2026-04-27", plans_started: 1, plans_completed: 0, median_days: null },
    ];

    const pool = makePool(async (text: string) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/per_plan AS \(/.test(text) && /generate_series/.test(text)) {
        return { rows: weeklyRows };
      }
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 40, plans_completed: 15, median_days: 5.5 }],
        };
      }
      if (/per_plan AS \(/.test(text)) {
        // stage drop-off rollup queries
        return { rows: [{ finished: 0 }] };
      }
      return { rows: [] };
    });

    const result = await computePlannerAnalytics(pool);

    expect(result.weekly).toHaveLength(8);
    expect(result.weekly[0]).toEqual({
      weekStart: "2026-03-09",
      plansStarted: 0,
      plansCompleted: 0,
      medianDaysToCompletion: null,
    });
    expect(result.weekly[1]).toEqual({
      weekStart: "2026-03-16",
      plansStarted: 4,
      plansCompleted: 1,
      medianDaysToCompletion: 5.0,
    });
    // median_days rounded to 1 decimal place
    expect(result.weekly[2].medianDaysToCompletion).toBe(6.3);
    // chronological order (oldest -> newest)
    const dates = result.weekly.map((w) => w.weekStart);
    expect(dates).toEqual([...dates].sort());
  });

  it("issues a weekly query that buckets by date_trunc('week', ...) and covers 8 weeks", async () => {
    const calls: Array<{ text: string; values: any[] | undefined }> = [];
    const pool = makePool(async (text: string, values?: any[]) => {
      calls.push({ text, values });
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) {
        return { rows: [] }; // empty time series is fine for this assertion
      }
      if (/plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });

    await computePlannerAnalytics(pool);

    const weeklyCall = calls.find((c) => /generate_series/.test(c.text));
    expect(weeklyCall).toBeDefined();
    expect(weeklyCall!.text).toMatch(/date_trunc\('week'/);
    expect(weeklyCall!.text).toMatch(/generate_series\(0, 7\)/);
    expect(weeklyCall!.text).toMatch(/LEFT JOIN per_week/);
    // step_ids and total-step-count are bound
    expect(Array.isArray(weeklyCall!.values?.[0])).toBe(true);
    expect(typeof weeklyCall!.values?.[1]).toBe("number");
  });

  it("returns an 8-row weekly array even when no plans exist", async () => {
    // Simulates the empty-database case. The SQL left-joins generated weeks
    // against the per_week aggregate, so callers should still see 8 zero rows.
    const emptyWeeks = Array.from({ length: 8 }, (_, i) => ({
      week_start: `2026-03-${String(2 + i * 7).padStart(2, "0")}`,
      plans_started: 0,
      plans_completed: 0,
      median_days: null,
    }));
    const pool = makePool(async (text: string) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: emptyWeeks };
      if (/plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });

    const result = await computePlannerAnalytics(pool);
    expect(result.weekly).toHaveLength(8);
    expect(result.weekly.every((w) => w.plansStarted === 0)).toBe(true);
    expect(result.weekly.every((w) => w.medianDaysToCompletion === null)).toBe(
      true,
    );
  });
});

describe("renderPlannerAnalyticsHtml — Last 8 weeks table", () => {
  const baseResult: PlannerAnalyticsResult = {
    generatedAt: "2026-04-28T00:00:00.000Z",
    totalSteps: 10,
    filter: { country: null, minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
    countries: [],
    totals: {
      plansStarted: 0,
      plansCompleted: 0,
      completionRatePct: 0,
      medianDaysToCompletion: null,
      medianSampleSize: 0,
      medianExcludedUnknownStart: 0,
      medianExcludedUnknownStartPct: 0,
    },
    stepCompletion: [],
    stageDropOff: [],
    weekly: [],
    byCountry: [],
    comparison: null,
  };

  it("renders one row per weekly bucket with the week-start date", () => {
    const html = renderPlannerAnalyticsHtml({
      ...baseResult,
      weekly: [
        {
          weekStart: "2026-04-20",
          plansStarted: 6,
          plansCompleted: 2,
          medianDaysToCompletion: 2.0,
        },
        {
          weekStart: "2026-04-27",
          plansStarted: 0,
          plansCompleted: 0,
          medianDaysToCompletion: null,
        },
      ],
    });
    expect(html).toContain("Last 8 weeks");
    expect(html).toContain("2026-04-20");
    expect(html).toContain("2026-04-27");
    // 6 started / 2 completed = 33.3%
    expect(html).toMatch(/33\.3%/);
    // empty week renders an em-dash placeholder rather than NaN%
    expect(html).not.toMatch(/NaN/);
  });

  it("renders an inline SVG sparkline for each weekly metric", () => {
    const html = renderPlannerAnalyticsHtml({
      ...baseResult,
      weekly: [
        {
          weekStart: "2026-04-20",
          plansStarted: 6,
          plansCompleted: 2,
          medianDaysToCompletion: 2.0,
        },
        {
          weekStart: "2026-04-27",
          plansStarted: 9,
          plansCompleted: 4,
          medianDaysToCompletion: 3.5,
        },
      ],
    });
    const svgCount = (html.match(/<svg[^>]*class="sparkline"/g) || []).length;
    expect(svgCount).toBe(3);
    expect(html).toContain("Plans started / week");
    expect(html).toContain("Reached 100% / week");
    expect(html).toContain("Median time-to-100% / week");
    expect(html).toContain("2026-04-27: 9 started");
    expect(html).toContain("2026-04-27: 4 reached 100%");
    expect(html).toContain("2026-04-27: 3.5 days");
  });

  it("does not crash when every weekly median is null", () => {
    const html = renderPlannerAnalyticsHtml({
      ...baseResult,
      weekly: [
        {
          weekStart: "2026-04-20",
          plansStarted: 0,
          plansCompleted: 0,
          medianDaysToCompletion: null,
        },
        {
          weekStart: "2026-04-27",
          plansStarted: 0,
          plansCompleted: 0,
          medianDaysToCompletion: null,
        },
      ],
    });
    expect(html).not.toMatch(/NaN/);
    expect(html).toContain("Median time-to-100% / week");
  });
});

function rowsForUnfilteredFixture(text: string, values: unknown[]): FakeRow[] {
  // ALTER TABLE migration — return nothing.
  if (text.includes("ALTER TABLE user_progress")) return [];
  // Per-step counts.
  if (text.includes("FROM user_progress") && text.includes("GROUP BY step_id")) {
    return GENERIC_PLAN_STEP_IDS.map((stepId) => ({
      step_id: stepId,
      completed: 4,
      started: 10,
    }));
  }
  // Stage drop-off CTE — recognize "GROUP BY user_id, target_country" + "done = $2".
  if (
    text.includes("WITH per_plan AS") &&
    text.includes("done = $2") &&
    !text.includes("done_steps")
  ) {
    return [{ finished: 2 }];
  }
  // Per-plan rollup (no GROUP BY target_country in SELECT).
  if (
    text.includes("WITH per_plan AS") &&
    text.includes("done_steps = $2") &&
    !text.includes("GROUP BY target_country")
  ) {
    return [{ plans_started: 10, plans_completed: 3, median_days: 12.4 }];
  }
  // Per-country breakdown.
  if (
    text.includes("WITH per_plan AS") &&
    text.includes("GROUP BY target_country")
  ) {
    return [
      {
        target_country: "portugal",
        plans_started: 6,
        plans_completed: 2,
        median_sample_size: 2,
        median_excluded_unknown_start: 0,
        median_days: 10,
      },
      {
        target_country: "spain",
        plans_started: 4,
        plans_completed: 1,
        median_sample_size: 0,
        median_excluded_unknown_start: 1,
        median_days: null,
      },
    ];
  }
  // Distinct countries for dropdown.
  if (text.includes("SELECT DISTINCT target_country")) {
    return [{ target_country: "portugal" }, { target_country: "spain" }];
  }
  return [];
}

describe("computePlannerAnalytics", () => {
  describe("with no country filter", () => {
    let result: PlannerAnalyticsResult;
    let calls: QueryCall[];

    beforeEach(async () => {
      const fake = makeFakePool((call) =>
        ({ rows: rowsForUnfilteredFixture(call.text, call.values) }),
      );
      calls = fake.calls;
      result = await computePlannerAnalytics(fake.pool);
    });

    it("returns the unfiltered totals", () => {
      expect(result.totals).toEqual(
        expect.objectContaining({
          plansStarted: 10,
          plansCompleted: 3,
          completionRatePct: 30.0,
          medianDaysToCompletion: 12.4,
        }),
      );
    });

    it("does not pass a country parameter to the per-step query", () => {
      const perStep = calls.find((c) =>
        c.text.includes("GROUP BY step_id"),
      ) as QueryCall;
      expect(perStep).toBeDefined();
      expect(perStep.values).toHaveLength(1);
      expect(perStep.text).not.toMatch(/AND target_country = \$/);
    });

    it("returns every country (above the threshold) in the breakdown", () => {
      expect(result.byCountry.map((c) => c.country)).toEqual([
        "portugal",
        "spain",
      ]);
      expect(result.byCountry[0]).toMatchObject({
        country: "portugal",
        plansStarted: 6,
        plansCompleted: 2,
        completionRatePct: 33.3,
        medianDaysToCompletion: 10,
        medianSampleSize: 2,
        medianExcludedUnknownStart: 0,
      });
      expect(result.byCountry[1].medianDaysToCompletion).toBeNull();
      expect(result.byCountry[1].medianSampleSize).toBe(0);
      expect(result.byCountry[1].medianExcludedUnknownStart).toBe(1);
    });

    it("populates the countries dropdown list", () => {
      expect(result.countries).toEqual(["portugal", "spain"]);
    });

    it("reports the active filter as null", () => {
      expect(result.filter.country).toBeNull();
      expect(result.filter.minPlansForCountryBreakdown).toBe(3);
    });

    it("uses the minPlans threshold (HAVING) on the breakdown query", () => {
      const breakdown = calls.find(
        (c) =>
          c.text.includes("WITH per_plan AS") &&
          c.text.includes("GROUP BY target_country"),
      ) as QueryCall;
      expect(breakdown).toBeDefined();
      expect(breakdown.text).toMatch(/HAVING COUNT\(\*\) >= \$3/);
      expect(breakdown.values[2]).toBe(3);
    });
  });

  describe("with ?country=portugal filter", () => {
    let result: PlannerAnalyticsResult;
    let calls: QueryCall[];

    beforeEach(async () => {
      const fake = makeFakePool((call) => {
        if (call.text.includes("ALTER TABLE user_progress")) return { rows: [] };
        if (
          call.text.includes("FROM user_progress") &&
          call.text.includes("GROUP BY step_id")
        ) {
          return {
            rows: GENERIC_PLAN_STEP_IDS.map((stepId) => ({
              step_id: stepId,
              completed: 3,
              started: 6,
            })),
          };
        }
        if (
          call.text.includes("WITH per_plan AS") &&
          call.text.includes("done = $2") &&
          !call.text.includes("done_steps")
        ) {
          return { rows: [{ finished: 1 }] };
        }
        if (
          call.text.includes("WITH per_plan AS") &&
          call.text.includes("done_steps = $2") &&
          !call.text.includes("GROUP BY target_country")
        ) {
          return {
            rows: [{ plans_started: 6, plans_completed: 2, median_days: 8 }],
          };
        }
        if (
          call.text.includes("WITH per_plan AS") &&
          call.text.includes("GROUP BY target_country")
        ) {
          return {
            rows: [
              {
                target_country: "portugal",
                plans_started: 6,
                plans_completed: 2,
                median_sample_size: 2,
                median_excluded_unknown_start: 0,
                median_days: 8,
              },
            ],
          };
        }
        if (call.text.includes("SELECT DISTINCT target_country")) {
          return {
            rows: [
              { target_country: "portugal" },
              { target_country: "spain" },
            ],
          };
        }
        return { rows: [] };
      });
      calls = fake.calls;
      result = await computePlannerAnalytics(fake.pool, { country: "Portugal" });
    });

    it("normalizes the filter to lower-case", () => {
      expect(result.filter.country).toBe("portugal");
    });

    it("threads the country into the per-step query as a parameter", () => {
      const perStep = calls.find((c) =>
        c.text.includes("GROUP BY step_id"),
      ) as QueryCall;
      expect(perStep.text).toMatch(/AND target_country = \$2/);
      expect(perStep.values).toEqual([
        [...GENERIC_PLAN_STEP_IDS],
        "portugal",
      ]);
    });

    it("threads the country into the per-plan rollup", () => {
      const perPlan = calls.find(
        (c) =>
          c.text.includes("WITH per_plan AS") &&
          c.text.includes("done_steps = $2") &&
          !c.text.includes("GROUP BY target_country"),
      ) as QueryCall;
      expect(perPlan.text).toMatch(/AND target_country = \$3/);
      expect(perPlan.values[2]).toBe("portugal");
    });

    it("threads the country into stage drop-off queries", () => {
      const stage = calls.find(
        (c) =>
          c.text.includes("WITH per_plan AS") &&
          c.text.includes("done = $2") &&
          !c.text.includes("done_steps"),
      ) as QueryCall;
      expect(stage.text).toMatch(/AND target_country = \$3/);
      expect(stage.values[2]).toBe("portugal");
    });

    it("narrows the per-country breakdown to only the selected country (no HAVING)", () => {
      const breakdown = calls.find(
        (c) =>
          c.text.includes("WITH per_plan AS") &&
          c.text.includes("GROUP BY target_country"),
      ) as QueryCall;
      expect(breakdown.text).toMatch(/AND target_country = \$3/);
      expect(breakdown.text).not.toMatch(/HAVING/);
      expect(breakdown.values[2]).toBe("portugal");

      expect(result.byCountry).toEqual([
        {
          country: "portugal",
          plansStarted: 6,
          plansCompleted: 2,
          completionRatePct: 33.3,
          medianDaysToCompletion: 8,
          medianSampleSize: 2,
          medianExcludedUnknownStart: 0,
        },
      ]);
    });

    it("reports filter-narrowed totals", () => {
      expect(result.totals.plansStarted).toBe(6);
      expect(result.totals.plansCompleted).toBe(2);
      expect(result.totals.completionRatePct).toBe(33.3);
    });
  });

  describe("minPlans option", () => {
    it("forwards a custom minPlans value to the breakdown query", async () => {
      const fake = makeFakePool((call) => ({
        rows: rowsForUnfilteredFixture(call.text, call.values),
      }));
      await computePlannerAnalytics(fake.pool, {
        minPlansForCountryBreakdown: 25,
      });
      const breakdown = fake.calls.find(
        (c) =>
          c.text.includes("WITH per_plan AS") &&
          c.text.includes("GROUP BY target_country"),
      ) as QueryCall;
      expect(breakdown.values[2]).toBe(25);
    });

    it("clamps non-positive minPlans values to 1", async () => {
      const fake = makeFakePool((call) => ({
        rows: rowsForUnfilteredFixture(call.text, call.values),
      }));
      const result = await computePlannerAnalytics(fake.pool, {
        minPlansForCountryBreakdown: 0,
      });
      expect(result.filter.minPlansForCountryBreakdown).toBe(1);
    });
  });
});

describe("renderPlannerAnalyticsHtml", () => {
  function baseResult(
    overrides: Partial<PlannerAnalyticsResult> = {},
  ): PlannerAnalyticsResult {
    return {
      generatedAt: "2026-04-28T00:00:00.000Z",
      totalSteps: 10,
      filter: { country: null, minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      countries: ["portugal", "spain"],
      totals: {
        plansStarted: 10,
        plansCompleted: 3,
        completionRatePct: 30,
        medianDaysToCompletion: 12.4,
        medianSampleSize: 3,
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      },
      stepCompletion: [],
      stageDropOff: [],
      weekly: [],
      byCountry: [
        {
          country: "portugal",
          plansStarted: 6,
          plansCompleted: 2,
          completionRatePct: 33.3,
          medianDaysToCompletion: 10,
          medianSampleSize: 2,
          medianExcludedUnknownStart: 0,
        },
      ],
      comparison: null,
      ...overrides,
    };
  }

  it("renders a country dropdown with one option per known country", () => {
    const html = renderPlannerAnalyticsHtml(baseResult());
    expect(html).toContain('<option value="portugal">Portugal</option>');
    expect(html).toContain('<option value="spain">Spain</option>');
    expect(html).toContain('<option value="">All countries</option>');
  });

  it("marks the active filter option as selected and shows a clear link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: "portugal", minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      }),
    );
    expect(html).toContain('<option value="portugal" selected>Portugal</option>');
    expect(html).toMatch(/Filtered to <strong>Portugal<\/strong>/);
    expect(html).toContain('href="/admin/planner-analytics"');
  });

  it("renders the per-country breakdown rows with country links when unfiltered", () => {
    const html = renderPlannerAnalyticsHtml(baseResult());
    expect(html).toContain(
      'href="/admin/planner-analytics?country=portugal"',
    );
    expect(html).toContain("33.3%");
    expect(html).toContain("10.0 days");
  });

  it("does not render drill-in links in the breakdown when a filter is already active", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: "portugal", minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      }),
    );
    // The country cell in the breakdown table should be plain text, not a link.
    expect(html).toMatch(/<td>Portugal<\/td>/);
    expect(html).toMatch(
      /Showing only <strong>Portugal<\/strong> because the country filter is active/,
    );
  });

  it("includes the active country in the JSON link href", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: "portugal", minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      }),
    );
    expect(html).toContain(
      'href="/api/admin/planner-analytics?country=portugal"',
    );
  });

  it("shows an empty-state message when no countries qualify", () => {
    const html = renderPlannerAnalyticsHtml(baseResult({ byCountry: [] }));
    expect(html).toContain("No countries have at least 3 plans started yet.");
  });

  it("renders a per-country completion bar chart sorted by rate descending", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        byCountry: [
          {
            country: "portugal",
            plansStarted: 6,
            plansCompleted: 2,
            completionRatePct: 33.3,
            medianDaysToCompletion: 10,
            medianSampleSize: 2,
            medianExcludedUnknownStart: 0,
          },
          {
            country: "spain",
            plansStarted: 8,
            plansCompleted: 6,
            completionRatePct: 75,
            medianDaysToCompletion: 8,
            medianSampleSize: 6,
            medianExcludedUnknownStart: 0,
          },
          {
            country: "canada",
            plansStarted: 4,
            plansCompleted: 0,
            completionRatePct: 0,
            medianDaysToCompletion: null,
            medianSampleSize: 0,
            medianExcludedUnknownStart: 0,
          },
        ],
      }),
    );
    expect(html).toContain('<div class="chart"');
    // Spain (75%) renders before Portugal (33.3%) which renders before Canada (0%).
    const spainIdx = html.indexOf(
      '<div class="chart-label">Spain</div>',
    );
    const portugalIdx = html.indexOf(
      '<div class="chart-label">Portugal</div>',
    );
    const canadaIdx = html.indexOf(
      '<div class="chart-label">Canada</div>',
    );
    expect(spainIdx).toBeGreaterThan(-1);
    expect(portugalIdx).toBeGreaterThan(spainIdx);
    expect(canadaIdx).toBeGreaterThan(portugalIdx);
    // Bars are scaled on a true 0–100% axis: Spain's 75% bar is 75% wide,
    // Portugal's 33.3% bar is 33.3% wide, Canada's 0% bar is 0% wide.
    expect(html).toContain(
      '<div class="chart-bar" style="width: 75%"></div>',
    );
    expect(html).toContain(
      '<div class="chart-bar" style="width: 33.3%"></div>',
    );
    expect(html).toContain(
      '<div class="chart-bar" style="width: 0%"></div>',
    );
    expect(html).toContain(
      '<div class="chart-value">75.0%</div>',
    );
    expect(html).toContain(
      '<div class="chart-value">33.3%</div>',
    );
    expect(html).toContain(
      '<div class="chart-value">0.0%</div>',
    );
  });

  it("links to the CSV export for the per-country breakdown", () => {
    const html = renderPlannerAnalyticsHtml(baseResult());
    expect(html).toContain('href="/admin/planner-analytics.csv"');
    expect(html).toContain(">Download CSV</a>");
  });

  it("propagates the active country filter into the CSV download link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: "portugal", minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      }),
    );
    expect(html).toContain(
      'href="/admin/planner-analytics.csv?country=portugal"',
    );
  });

  it("propagates a non-default minPlans value into the CSV download link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: null, minPlansForCountryBreakdown: 7, rangeA: null, rangeB: null },
      }),
    );
    expect(html).toContain(
      'href="/admin/planner-analytics.csv?minPlans=7"',
    );
  });
});

describe("renderPlannerAnalyticsCsv", () => {
  function makeResult(
    byCountry: PlannerAnalyticsResult["byCountry"],
  ): PlannerAnalyticsResult {
    return {
      generatedAt: "2026-04-28T00:00:00.000Z",
      totalSteps: 10,
      filter: { country: null, minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null },
      countries: [],
      totals: {
        plansStarted: 0,
        plansCompleted: 0,
        completionRatePct: 0,
        medianDaysToCompletion: null,
        medianSampleSize: 0,
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      },
      stepCompletion: [],
      stageDropOff: [],
      weekly: [],
      byCountry,
      comparison: null,
    };
  }

  it("emits totals, per-step, weekly and per-country sections", () => {
    const result = makeResult([
      {
        country: "portugal",
        plansStarted: 6,
        plansCompleted: 2,
        completionRatePct: 33.3,
        medianDaysToCompletion: 10,
        medianSampleSize: 2,
        medianExcludedUnknownStart: 0,
      },
      {
        country: "spain",
        plansStarted: 4,
        plansCompleted: 0,
        completionRatePct: 0,
        medianDaysToCompletion: null,
        medianSampleSize: 0,
        medianExcludedUnknownStart: 0,
      },
    ]);
    result.totals = {
      plansStarted: 10,
      plansCompleted: 2,
      completionRatePct: 20,
      medianDaysToCompletion: 10,
      medianSampleSize: 2,
      medianExcludedUnknownStart: 0,
      medianExcludedUnknownStartPct: 0,
    };
    result.stepCompletion = [
      {
        stepId: "research_quiz",
        title: "Take the readiness quiz",
        stage: "research",
        completed: 5,
        started: 10,
        completionRatePct: 50,
      },
    ];
    result.weekly = [
      {
        weekStart: "2026-04-20",
        plansStarted: 4,
        plansCompleted: 1,
        medianDaysToCompletion: 7,
      },
      {
        weekStart: "2026-04-27",
        plansStarted: 0,
        plansCompleted: 0,
        medianDaysToCompletion: null,
      },
    ];
    const csv = renderPlannerAnalyticsCsv(result);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("# Planner completion analytics");
    expect(lines).toContain("# Filter: minPlans=3");
    expect(lines).toContain("# Generated: 2026-04-28T00:00:00.000Z");
    expect(lines).toContain("section,metric,value");
    expect(lines).toContain("totals,plans_started,10");
    expect(lines).toContain("totals,plans_completed,2");
    expect(lines).toContain("totals,median_days_to_completion,10.0");
    expect(lines).toContain(
      "step_id,title,stage,completed,started,completion_rate_pct",
    );
    expect(lines).toContain(
      "research_quiz,Take the readiness quiz,research,5,10,50.0",
    );
    expect(lines).toContain(
      "week_start,plans_started,plans_completed,median_days_to_completion",
    );
    expect(lines).toContain("2026-04-20,4,1,7.0");
    expect(lines).toContain("2026-04-27,0,0,");
    expect(lines).toContain(
      "country,plans_started,reached_100,pct_reaching_100,median_days_to_completion,median_sample_size,median_excluded_unknown_start",
    );
    expect(lines).toContain("portugal,6,2,33.3,10.0,2,0");
    expect(lines).toContain("spain,4,0,0.0,,0,0");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("emits empty per-step / weekly / per-country sections when no data", () => {
    const csv = renderPlannerAnalyticsCsv(makeResult([]));
    expect(csv).toContain(
      "step_id,title,stage,completed,started,completion_rate_pct",
    );
    expect(csv).toContain(
      "week_start,plans_started,plans_completed,median_days_to_completion",
    );
    expect(csv).toContain(
      "country,plans_started,reached_100,pct_reaching_100,median_days_to_completion,median_sample_size,median_excluded_unknown_start",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("includes the active country filter in the header comment", () => {
    const result = makeResult([]);
    result.filter = { country: "portugal", minPlansForCountryBreakdown: 3, rangeA: null, rangeB: null };
    const csv = renderPlannerAnalyticsCsv(result);
    expect(csv).toContain("# Filter: country=portugal");
  });
});

describe("renderRangeComparisonCsv", () => {
  function makeResult(
    overrides: Partial<PlannerAnalyticsResult> = {},
  ): PlannerAnalyticsResult {
    return {
      generatedAt: "2026-04-28T00:00:00.000Z",
      totalSteps: 10,
      filter: {
        country: null,
        minPlansForCountryBreakdown: 3,
        rangeA: { start: "2026-04-01", end: "2026-04-30" },
        rangeB: { start: "2026-03-01", end: "2026-03-31" },
      },
      countries: [],
      totals: {
        plansStarted: 0,
        plansCompleted: 0,
        completionRatePct: 0,
        medianDaysToCompletion: null,
        medianSampleSize: 0,
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      },
      stepCompletion: [],
      stageDropOff: [],
      weekly: [],
      byCountry: [],
      comparison: {
        rangeA: {
          start: "2026-04-01",
          end: "2026-04-30",
          plansStarted: 12,
          plansCompleted: 6,
          completionRatePct: 50,
          medianDaysToCompletion: 8,
          medianSampleSize: 6,
        },
        rangeB: {
          start: "2026-03-01",
          end: "2026-03-31",
          plansStarted: 8,
          plansCompleted: 2,
          completionRatePct: 25,
          medianDaysToCompletion: 10,
          medianSampleSize: 2,
        },
        delta: {
          plansStarted: 4,
          plansStartedPct: 50,
          plansCompleted: 4,
          plansCompletedPct: 200,
          completionRatePctPoints: 25,
          medianDaysToCompletion: -2,
          medianDaysToCompletionPct: -20,
        },
        byCountry: [],
      },
      ...overrides,
    };
  }

  it("emits one row per metric with range A, range B and delta columns", () => {
    const csv = renderRangeComparisonCsv(makeResult());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("# Planner range comparison");
    expect(lines).toContain("# Range A: 2026-04-01..2026-04-30");
    expect(lines).toContain("# Range B (baseline): 2026-03-01..2026-03-31");
    expect(lines).toContain("# Generated: 2026-04-28T00:00:00.000Z");
    expect(lines).toContain("metric,range_a,range_b,delta,delta_pct");
    expect(lines).toContain("plans_started,12,8,4,50.0");
    expect(lines).toContain("reached_100,6,2,4,200.0");
    // % reaching 100% delta is in percentage points, so delta_pct is blank.
    expect(lines).toContain("pct_reaching_100,50.0,25.0,25.0,");
    expect(lines).toContain("median_days_to_completion,8.0,10.0,-2.0,-20.0");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("includes the active country filter in the header comment", () => {
    const csv = renderRangeComparisonCsv(
      makeResult({
        filter: {
          country: "portugal",
          minPlansForCountryBreakdown: 3,
          rangeA: { start: "2026-04-01", end: "2026-04-30" },
          rangeB: { start: "2026-03-01", end: "2026-03-31" },
        },
      }),
    );
    expect(csv).toContain("# Filter: country=portugal");
  });

  it("renders blank cells when medians are null", () => {
    const csv = renderRangeComparisonCsv(
      makeResult({
        comparison: {
          rangeA: {
            start: "2026-04-01",
            end: "2026-04-30",
            plansStarted: 4,
            plansCompleted: 0,
            completionRatePct: 0,
            medianDaysToCompletion: null,
            medianSampleSize: 0,
          },
          rangeB: {
            start: "2026-03-01",
            end: "2026-03-31",
            plansStarted: 0,
            plansCompleted: 0,
            completionRatePct: 0,
            medianDaysToCompletion: null,
            medianSampleSize: 0,
          },
          delta: {
            plansStarted: 4,
            plansStartedPct: null,
            plansCompleted: 0,
            plansCompletedPct: null,
            completionRatePctPoints: 0,
            medianDaysToCompletion: null,
            medianDaysToCompletionPct: null,
          },
          byCountry: [],
        },
      }),
    );
    const lines = csv.split("\r\n");
    // Baseline of 0 → percentage deltas blank.
    expect(lines).toContain("plans_started,4,0,4,");
    expect(lines).toContain("median_days_to_completion,,,,");
  });

  it("degrades to a header-only file when no comparison is present", () => {
    const csv = renderRangeComparisonCsv(
      makeResult({
        filter: {
          country: null,
          minPlansForCountryBreakdown: 3,
          rangeA: null,
          rangeB: null,
        },
        comparison: null,
      }),
    );
    expect(csv).toContain("# No comparison: supply both rangeA and rangeB");
    expect(csv).not.toContain("metric,range_a,range_b,delta,delta_pct");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("parseDateRange", () => {
  it("parses a valid YYYY-MM-DD..YYYY-MM-DD pair", () => {
    expect(parseDateRange("2026-04-01..2026-04-30")).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
    });
  });

  it("rejects malformed input", () => {
    expect(parseDateRange("2026-04-01")).toBeNull();
    expect(parseDateRange("2026-04-01..bogus")).toBeNull();
    expect(parseDateRange("2026/04/01..2026/04/30")).toBeNull();
    expect(parseDateRange("")).toBeNull();
    expect(parseDateRange(null)).toBeNull();
    expect(parseDateRange(undefined)).toBeNull();
  });

  it("rejects ranges where start is after end", () => {
    expect(parseDateRange("2026-04-30..2026-04-01")).toBeNull();
  });
});

describe("computePlannerAnalytics — range comparison", () => {
  it("returns null comparison when ranges are not supplied", async () => {
    const pool = makePool(async (text: string) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: [] };
      if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });
    const result = await computePlannerAnalytics(pool);
    expect(result.comparison).toBeNull();
    expect(result.filter.rangeA).toBeNull();
    expect(result.filter.rangeB).toBeNull();
  });

  it("computes side-by-side metrics and deltas when both ranges supplied", async () => {
    const rangeQueryCalls: Array<{ text: string; values: unknown[] }> = [];
    const pool = makePool(async (text: string, values?: any[]) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: [] };
      if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
      // Per-country range query — same range filter but grouped by country.
      // Return empty so the byCountry merge stays empty for this test.
      if (/started_at >= \$3::date/.test(text) && /GROUP BY target_country/.test(text)) {
        return { rows: [] };
      }
      // Range-metrics query: per_plan rollup with started_at >= $3
      if (/started_at >= \$3::date/.test(text)) {
        rangeQueryCalls.push({ text, values: values ?? [] });
        // Return rangeA on first call, rangeB on second.
        if (rangeQueryCalls.length === 1) {
          return {
            rows: [
              {
                plans_started: 12,
                plans_completed: 6,
                median_sample_size: 6,
                median_days: 8,
              },
            ],
          };
        }
        return {
          rows: [
            {
              plans_started: 8,
              plans_completed: 2,
              median_sample_size: 2,
              median_days: 10,
            },
          ],
        };
      }
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });
    const result = await computePlannerAnalytics(pool, {
      rangeA: { start: "2026-04-01", end: "2026-04-30" },
      rangeB: { start: "2026-03-01", end: "2026-03-31" },
    });
    expect(rangeQueryCalls).toHaveLength(2);
    // End date is exclusive in SQL — `2026-04-30` becomes `2026-05-01`.
    expect(rangeQueryCalls[0].values[2]).toBe("2026-04-01");
    expect(rangeQueryCalls[0].values[3]).toBe("2026-05-01");
    expect(rangeQueryCalls[1].values[2]).toBe("2026-03-01");
    expect(rangeQueryCalls[1].values[3]).toBe("2026-04-01");
    expect(result.comparison).not.toBeNull();
    const c = result.comparison!;
    expect(c.rangeA).toMatchObject({
      start: "2026-04-01",
      end: "2026-04-30",
      plansStarted: 12,
      plansCompleted: 6,
      completionRatePct: 50,
      medianDaysToCompletion: 8,
      medianSampleSize: 6,
    });
    expect(c.rangeB).toMatchObject({
      plansStarted: 8,
      plansCompleted: 2,
      completionRatePct: 25,
      medianDaysToCompletion: 10,
    });
    // 12 − 8 = +4 plans started, +50% vs baseline of 8
    expect(c.delta.plansStarted).toBe(4);
    expect(c.delta.plansStartedPct).toBe(50);
    // 6 − 2 = +4 plans completed, +200% vs baseline of 2
    expect(c.delta.plansCompleted).toBe(4);
    expect(c.delta.plansCompletedPct).toBe(200);
    // 50% − 25% = +25 pp
    expect(c.delta.completionRatePctPoints).toBe(25);
    // Median dropped from 10d to 8d → −2 days, −20%
    expect(c.delta.medianDaysToCompletion).toBe(-2);
    expect(c.delta.medianDaysToCompletionPct).toBe(-20);
  });

  it("returns null pct deltas when the baseline is zero", async () => {
    const pool = makePool(async (text: string) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: [] };
      if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
      if (/started_at >= \$3::date/.test(text)) {
        // Both call sites get the same shape; the per-range distinction
        // doesn't matter for the zero-baseline assertion.
        return {
          rows: [
            {
              plans_started: 5,
              plans_completed: 1,
              median_sample_size: 1,
              median_days: 3,
            },
          ],
        };
      }
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });
    // Range B is the baseline — make it return zeros by overriding the
    // mock for the second call.
    let callIdx = 0;
    const pool2 = makePool(async (text: string) => {
      if (/started_at >= \$3::date/.test(text) && /GROUP BY target_country/.test(text)) {
        return { rows: [] };
      }
      if (/started_at >= \$3::date/.test(text)) {
        callIdx += 1;
        if (callIdx === 2) {
          return {
            rows: [
              {
                plans_started: 0,
                plans_completed: 0,
                median_sample_size: 0,
                median_days: null,
              },
            ],
          };
        }
        return {
          rows: [
            {
              plans_started: 5,
              plans_completed: 1,
              median_sample_size: 1,
              median_days: 3,
            },
          ],
        };
      }
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: [] };
      if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });
    const result = await computePlannerAnalytics(pool2, {
      rangeA: { start: "2026-04-01", end: "2026-04-30" },
      rangeB: { start: "2026-03-01", end: "2026-03-31" },
    });
    expect(pool).toBeDefined();
    expect(result.comparison!.delta.plansStartedPct).toBeNull();
    expect(result.comparison!.delta.plansCompletedPct).toBeNull();
    // Median is null on one side → null pct
    expect(result.comparison!.delta.medianDaysToCompletionPct).toBeNull();
    expect(result.comparison!.delta.medianDaysToCompletion).toBeNull();
  });

  it("builds a per-country comparison, omits inactive countries, and sorts by absolute change in plans started", async () => {
    // Distinguish range A from range B by the exclusive end bound passed
    // in $4: rangeA ends 2026-05-01, rangeB ends 2026-04-01.
    const pool = makePool(async (text: string, values?: any[]) => {
      if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
      if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
      if (/generate_series/.test(text)) return { rows: [] };
      if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
      // Per-country range query (grouped by country).
      if (
        /started_at >= \$3::date/.test(text) &&
        /GROUP BY target_country/.test(text)
      ) {
        const isRangeA = values?.[3] === "2026-05-01";
        if (isRangeA) {
          return {
            rows: [
              { target_country: "portugal", plans_started: 12, plans_completed: 6, median_days: 8 },
              { target_country: "spain", plans_started: 2, plans_completed: 0, median_days: null },
              // canada: active in A only.
              { target_country: "canada", plans_started: 5, plans_completed: 1, median_days: 4 },
            ],
          };
        }
        return {
          rows: [
            { target_country: "portugal", plans_started: 6, plans_completed: 4, median_days: 10 },
            { target_country: "spain", plans_started: 8, plans_completed: 3, median_days: 5 },
            // germany: appears in B with zero activity → must be omitted.
            { target_country: "germany", plans_started: 0, plans_completed: 0, median_days: null },
          ],
        };
      }
      // Totals range query (not grouped by country).
      if (/started_at >= \$3::date/.test(text)) {
        return {
          rows: [
            {
              plans_started: 0,
              plans_completed: 0,
              median_sample_size: 0,
              median_days: null,
            },
          ],
        };
      }
      if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
        return {
          rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
        };
      }
      return { rows: [{ finished: 0 }] };
    });

    const result = await computePlannerAnalytics(pool, {
      rangeA: { start: "2026-04-01", end: "2026-04-30" },
      rangeB: { start: "2026-03-01", end: "2026-03-31" },
    });

    const byCountry = result.comparison!.byCountry;
    // germany is dropped (zero in both); portugal/canada/spain remain.
    expect(byCountry.map((c) => c.country)).not.toContain("germany");
    // Sorted by absolute change in plans started:
    //   portugal |12−6|=6, canada |5−0|=5, spain |2−8|=6 → portugal then
    //   spain (tie 6, alpha) then canada.
    expect(byCountry.map((c) => c.country)).toEqual([
      "portugal",
      "spain",
      "canada",
    ]);

    const portugal = byCountry[0];
    expect(portugal.rangeA).toEqual({
      plansStarted: 12,
      plansCompleted: 6,
      medianDaysToCompletion: 8,
    });
    expect(portugal.rangeB).toEqual({
      plansStarted: 6,
      plansCompleted: 4,
      medianDaysToCompletion: 10,
    });
    expect(portugal.delta.plansStarted).toBe(6);
    expect(portugal.delta.plansStartedPct).toBe(100);
    expect(portugal.delta.plansCompleted).toBe(2);
    expect(portugal.delta.medianDaysToCompletion).toBe(-2);

    // canada is active in A only → zero-filled B side, null pct baseline.
    const canada = byCountry.find((c) => c.country === "canada")!;
    expect(canada.rangeB).toEqual({
      plansStarted: 0,
      plansCompleted: 0,
      medianDaysToCompletion: null,
    });
    expect(canada.delta.plansStartedPct).toBeNull();
    expect(canada.delta.medianDaysToCompletion).toBeNull();
  });
});

describe("renderPlannerAnalyticsHtml — range comparison", () => {
  function baseResult(
    overrides: Partial<PlannerAnalyticsResult> = {},
  ): PlannerAnalyticsResult {
    return {
      generatedAt: "2026-04-28T00:00:00.000Z",
      totalSteps: 10,
      filter: {
        country: null,
        minPlansForCountryBreakdown: 3,
        rangeA: null,
        rangeB: null,
      },
      countries: [],
      totals: {
        plansStarted: 0,
        plansCompleted: 0,
        completionRatePct: 0,
        medianDaysToCompletion: null,
        medianSampleSize: 0,
        medianExcludedUnknownStart: 0,
        medianExcludedUnknownStartPct: 0,
      },
      stepCompletion: [],
      stageDropOff: [],
      weekly: [],
      byCountry: [],
      comparison: null,
      ...overrides,
    };
  }

  it("renders the date-range form even when no comparison is active", () => {
    const html = renderPlannerAnalyticsHtml(baseResult());
    expect(html).toContain("Compare two date ranges");
    expect(html).toContain('name="rangeAStart"');
    expect(html).toContain('name="rangeBStart"');
  });

  it("renders side-by-side totals and deltas when comparison is present", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: {
          country: null,
          minPlansForCountryBreakdown: 3,
          rangeA: { start: "2026-04-01", end: "2026-04-30" },
          rangeB: { start: "2026-03-01", end: "2026-03-31" },
        },
        comparison: {
          rangeA: {
            start: "2026-04-01",
            end: "2026-04-30",
            plansStarted: 12,
            plansCompleted: 6,
            completionRatePct: 50,
            medianDaysToCompletion: 8,
            medianSampleSize: 6,
          },
          rangeB: {
            start: "2026-03-01",
            end: "2026-03-31",
            plansStarted: 8,
            plansCompleted: 2,
            completionRatePct: 25,
            medianDaysToCompletion: 10,
            medianSampleSize: 2,
          },
          delta: {
            plansStarted: 4,
            plansStartedPct: 50,
            plansCompleted: 4,
            plansCompletedPct: 200,
            completionRatePctPoints: 25,
            medianDaysToCompletion: -2,
            medianDaysToCompletionPct: -20,
          },
          byCountry: [],
        },
      }),
    );
    expect(html).toContain("Range comparison");
    expect(html).toContain("2026-04-01 → 2026-04-30");
    expect(html).toContain("2026-03-01 → 2026-03-31");
    // Range A & B raw totals
    expect(html).toContain(">12<");
    expect(html).toContain(">8<");
    expect(html).toContain("50.0%");
    expect(html).toContain("25.0%");
    // Deltas
    expect(html).toMatch(/\+4/);
    expect(html).toMatch(/\+50\.0%/);
    expect(html).toMatch(/\+200\.0%/);
    expect(html).toMatch(/\+25 pp/);
    // Median delta: −2 days is a good outcome (faster), should be tagged good
    expect(html).toContain("delta-good");
    expect(html).toMatch(/−2 days/);
    expect(html).toMatch(/−20\.0%/);
  });

  it("propagates active ranges into the JSON link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: {
          country: null,
          minPlansForCountryBreakdown: 3,
          rangeA: { start: "2026-04-01", end: "2026-04-30" },
          rangeB: { start: "2026-03-01", end: "2026-03-31" },
        },
      }),
    );
    expect(html).toContain(
      "rangeA=2026-04-01..2026-04-30",
    );
    expect(html).toContain(
      "rangeB=2026-03-01..2026-03-31",
    );
  });

  it("renders a per-country comparison table beneath the totals comparison", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: {
          country: null,
          minPlansForCountryBreakdown: 3,
          rangeA: { start: "2026-04-01", end: "2026-04-30" },
          rangeB: { start: "2026-03-01", end: "2026-03-31" },
        },
        comparison: {
          rangeA: {
            start: "2026-04-01",
            end: "2026-04-30",
            plansStarted: 14,
            plansCompleted: 6,
            completionRatePct: 42.9,
            medianDaysToCompletion: 8,
            medianSampleSize: 6,
          },
          rangeB: {
            start: "2026-03-01",
            end: "2026-03-31",
            plansStarted: 14,
            plansCompleted: 7,
            completionRatePct: 50,
            medianDaysToCompletion: 10,
            medianSampleSize: 7,
          },
          delta: {
            plansStarted: 0,
            plansStartedPct: 0,
            plansCompleted: -1,
            plansCompletedPct: -14.3,
            completionRatePctPoints: -7.1,
            medianDaysToCompletion: -2,
            medianDaysToCompletionPct: -20,
          },
          byCountry: [
            {
              country: "portugal",
              rangeA: { plansStarted: 12, plansCompleted: 6, medianDaysToCompletion: 8 },
              rangeB: { plansStarted: 6, plansCompleted: 4, medianDaysToCompletion: 10 },
              delta: {
                plansStarted: 6,
                plansStartedPct: 100,
                plansCompleted: 2,
                plansCompletedPct: 50,
                medianDaysToCompletion: -2,
              },
            },
            {
              country: "spain",
              rangeA: { plansStarted: 2, plansCompleted: 0, medianDaysToCompletion: null },
              rangeB: { plansStarted: 8, plansCompleted: 3, medianDaysToCompletion: 5 },
              delta: {
                plansStarted: -6,
                plansStartedPct: -75,
                plansCompleted: -3,
                plansCompletedPct: -100,
                medianDaysToCompletion: null,
              },
            },
          ],
        },
      }),
    );
    expect(html).toContain("By country");
    expect(html).toContain("comparison-country");
    expect(html).toContain("Portugal");
    expect(html).toContain("Spain");
    // Portugal's +6 plans-started delta should read as a good (green) move.
    expect(html).toMatch(/\+6/);
    expect(html).toMatch(/\+100\.0%/);
    // Spain's −6 plans-started delta should be tagged bad.
    expect(html).toMatch(/−6/);
    expect(html).toContain("delta-bad");
  });

  it("shows an empty-state for the per-country comparison when no country qualifies", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: {
          country: null,
          minPlansForCountryBreakdown: 3,
          rangeA: { start: "2026-04-01", end: "2026-04-30" },
          rangeB: { start: "2026-03-01", end: "2026-03-31" },
        },
        comparison: {
          rangeA: {
            start: "2026-04-01",
            end: "2026-04-30",
            plansStarted: 0,
            plansCompleted: 0,
            completionRatePct: 0,
            medianDaysToCompletion: null,
            medianSampleSize: 0,
          },
          rangeB: {
            start: "2026-03-01",
            end: "2026-03-31",
            plansStarted: 0,
            plansCompleted: 0,
            completionRatePct: 0,
            medianDaysToCompletion: null,
            medianSampleSize: 0,
          },
          delta: {
            plansStarted: 0,
            plansStartedPct: null,
            plansCompleted: 0,
            plansCompletedPct: null,
            completionRatePctPoints: 0,
            medianDaysToCompletion: null,
            medianDaysToCompletionPct: null,
          },
          byCountry: [],
        },
      }),
    );
    expect(html).toContain("By country");
    expect(html).toContain("No country had any plans started in either range.");
  });
});

describe("GET /admin/planner-analytics-comparison.csv (route)", () => {
  // Fake pool that satisfies every query computePlannerAnalytics fires,
  // returning per-range metrics for the comparison query
  // (`started_at >= $3::date`). rangeA is the first such call, rangeB the
  // second — matching computeRangeMetrics' call order.
  function comparisonPool() {
    let rangeCall = 0;
    return {
      query: jest.fn(async (text: string) => {
        if (/ALTER TABLE user_progress/.test(text)) return { rows: [] };
        if (/CREATE TABLE/.test(text)) return { rows: [] };
        if (/schema_migrations/.test(text)) return { rows: [] };
        if (/SELECT step_id,\s+COUNT/.test(text)) return { rows: [] };
        if (/generate_series/.test(text)) return { rows: [] };
        if (/SELECT DISTINCT target_country/.test(text)) return { rows: [] };
        if (/started_at >= \$3::date/.test(text)) {
          rangeCall += 1;
          return rangeCall === 1
            ? {
                rows: [
                  {
                    plans_started: 12,
                    plans_completed: 6,
                    median_sample_size: 6,
                    median_days: 8,
                  },
                ],
              }
            : {
                rows: [
                  {
                    plans_started: 8,
                    plans_completed: 2,
                    median_sample_size: 2,
                    median_days: 10,
                  },
                ],
              };
        }
        if (/per_plan AS \(/.test(text) && /plans_started,\s+/.test(text)) {
          return {
            rows: [{ plans_started: 0, plans_completed: 0, median_days: null }],
          };
        }
        return { rows: [{ finished: 0 }] };
      }),
      end: jest.fn(async () => undefined),
    };
  }

  function buildApp(opts: { authOk?: boolean; pool?: any }): Express {
    const app = express();
    registerPlannerAnalyticsRoutes(app, {
      requireAdminBasicAuth: (_req: Request, res: Response) => {
        if (opts.authOk === false) {
          res
            .status(401)
            .set("WWW-Authenticate", "Basic")
            .send("Unauthorized");
          return false;
        }
        return true;
      },
      getPool: () => (opts.pool === undefined ? null : (opts.pool as any)),
    });
    return app;
  }

  const RANGE_QS =
    "rangeA=2026-04-01..2026-04-30&rangeB=2026-03-01..2026-03-31";

  it("rejects unauthenticated requests via the admin gate", async () => {
    const app = buildApp({ authOk: false, pool: null });
    const res = await request(app).get(
      `/admin/planner-analytics-comparison.csv?${RANGE_QS}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 plain text when the database is not configured", async () => {
    const app = buildApp({ authOk: true, pool: null });
    const res = await request(app).get(
      `/admin/planner-analytics-comparison.csv?${RANGE_QS}`,
    );
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/not configured/i);
  });

  it("returns 400 with a helpful message when no ranges are supplied", async () => {
    const pool = comparisonPool();
    const app = buildApp({ authOk: true, pool });
    const res = await request(app).get(
      "/admin/planner-analytics-comparison.csv",
    );
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/both rangeA and rangeB are required/i);
    // The pool is still drained even on the 400 path.
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when only one range is supplied", async () => {
    const pool = comparisonPool();
    const app = buildApp({ authOk: true, pool });
    const res = await request(app).get(
      "/admin/planner-analytics-comparison.csv?rangeA=2026-04-01..2026-04-30",
    );
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/both rangeA and rangeB are required/i);
  });

  it("returns 200 text/csv with an attachment filename when both ranges are supplied", async () => {
    const pool = comparisonPool();
    const app = buildApp({ authOk: true, pool });
    const res = await request(app).get(
      `/admin/planner-analytics-comparison.csv?${RANGE_QS}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="planner-analytics-comparison\.csv"/,
    );
    expect(res.text).toMatch(/^# Planner range comparison/);
    expect(res.text).toContain("metric,range_a,range_b,delta,delta_pct");
    expect(res.text).toContain("plans_started,12,8,4,");
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("includes the active country in the attachment filename", async () => {
    const pool = comparisonPool();
    const app = buildApp({ authOk: true, pool });
    const res = await request(app).get(
      `/admin/planner-analytics-comparison.csv?country=portugal&${RANGE_QS}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="planner-analytics-comparison-portugal\.csv"/,
    );
  });
});

// Shared helpers for the two non-comparison download routes. The fake pool
// answers every query computePlannerAnalytics fires for a default (no range)
// request with benign rows, so the routes can render a real JSON/CSV payload.
function analyticsPool() {
  return {
    query: jest.fn(async (text: string) => ({
      rows: rowsForUnfilteredFixture(text, []),
    })),
    end: jest.fn(async () => undefined),
  };
}

function buildAnalyticsApp(opts: { authOk?: boolean; pool?: any }): Express {
  const app = express();
  registerPlannerAnalyticsRoutes(app, {
    requireAdminBasicAuth: (_req: Request, res: Response) => {
      if (opts.authOk === false) {
        res.status(401).set("WWW-Authenticate", "Basic").send("Unauthorized");
        return false;
      }
      return true;
    },
    getPool: () => (opts.pool === undefined ? null : (opts.pool as any)),
  });
  return app;
}

describe("GET /api/admin/planner-analytics (route)", () => {
  it("rejects unauthenticated requests via the admin gate", async () => {
    const app = buildAnalyticsApp({ authOk: false, pool: null });
    const res = await request(app).get("/api/admin/planner-analytics");
    expect(res.status).toBe(401);
  });

  it("returns 503 JSON when the database is not configured", async () => {
    const app = buildAnalyticsApp({ authOk: true, pool: null });
    const res = await request(app).get("/api/admin/planner-analytics");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "Database not configured" });
  });

  it("returns 200 application/json when the pool is configured", async () => {
    const pool = analyticsPool();
    const app = buildAnalyticsApp({ authOk: true, pool });
    const res = await request(app).get("/api/admin/planner-analytics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("totals");
    expect(res.body).toHaveProperty("byCountry");
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

describe("GET /admin/planner-analytics.csv (route)", () => {
  it("rejects unauthenticated requests via the admin gate", async () => {
    const app = buildAnalyticsApp({ authOk: false, pool: null });
    const res = await request(app).get("/admin/planner-analytics.csv");
    expect(res.status).toBe(401);
  });

  it("returns 503 plain text when the database is not configured", async () => {
    const app = buildAnalyticsApp({ authOk: true, pool: null });
    const res = await request(app).get("/admin/planner-analytics.csv");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/not configured/i);
  });

  it("returns 200 text/csv with the by-country attachment filename", async () => {
    const pool = analyticsPool();
    const app = buildAnalyticsApp({ authOk: true, pool });
    const res = await request(app).get("/admin/planner-analytics.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="planner-analytics-by-country\.csv"/,
    );
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("includes the active country in the attachment filename", async () => {
    const pool = analyticsPool();
    const app = buildAnalyticsApp({ authOk: true, pool });
    const res = await request(app).get(
      "/admin/planner-analytics.csv?country=portugal",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="planner-analytics-by-country-portugal\.csv"/,
    );
  });
});
