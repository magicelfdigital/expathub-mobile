import {
  computePlannerAnalytics,
  renderPlannerAnalyticsCsv,
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
    filter: { country: null, minPlansForCountryBreakdown: 3 },
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
      filter: { country: null, minPlansForCountryBreakdown: 3 },
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
        filter: { country: "portugal", minPlansForCountryBreakdown: 3 },
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
        filter: { country: "portugal", minPlansForCountryBreakdown: 3 },
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
        filter: { country: "portugal", minPlansForCountryBreakdown: 3 },
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

  it("links to the CSV export for the per-country breakdown", () => {
    const html = renderPlannerAnalyticsHtml(baseResult());
    expect(html).toContain('href="/admin/planner-analytics.csv"');
    expect(html).toContain(">Download CSV</a>");
  });

  it("propagates the active country filter into the CSV download link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: "portugal", minPlansForCountryBreakdown: 3 },
      }),
    );
    expect(html).toContain(
      'href="/admin/planner-analytics.csv?country=portugal"',
    );
  });

  it("propagates a non-default minPlans value into the CSV download link", () => {
    const html = renderPlannerAnalyticsHtml(
      baseResult({
        filter: { country: null, minPlansForCountryBreakdown: 7 },
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
      filter: { country: null, minPlansForCountryBreakdown: 3 },
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
    };
  }

  it("renders the header and one row per country with median formatting", () => {
    const csv = renderPlannerAnalyticsCsv(
      makeResult([
        {
          country: "portugal",
          plansStarted: 6,
          plansCompleted: 2,
          completionRatePct: 33.3,
          medianDaysToCompletion: 10,
        },
        {
          country: "spain",
          plansStarted: 4,
          plansCompleted: 0,
          completionRatePct: 0,
          medianDaysToCompletion: null,
        },
      ]),
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "country,plans_started,reached_100,pct_reaching_100,median_days_to_completion",
    );
    expect(lines[1]).toBe("portugal,6,2,33.3,10.0");
    expect(lines[2]).toBe("spain,4,0,0.0,");
  });

  it("returns just the header row when no countries qualify", () => {
    const csv = renderPlannerAnalyticsCsv(makeResult([]));
    expect(csv).toBe(
      "country,plans_started,reached_100,pct_reaching_100,median_days_to_completion\r\n",
    );
  });
});
