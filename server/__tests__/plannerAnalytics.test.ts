import {
  computePlannerAnalytics,
  renderPlannerAnalyticsHtml,
} from "../plannerAnalytics";

type QueryFn = (text: string, values?: any[]) => Promise<{ rows: any[] }>;

function makePool(handler: QueryFn) {
  return {
    query: jest.fn(handler),
  } as any;
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
  const baseResult = {
    generatedAt: "2026-04-28T00:00:00.000Z",
    totalSteps: 10,
    totals: {
      plansStarted: 0,
      plansCompleted: 0,
      completionRatePct: 0,
      medianDaysToCompletion: null,
    },
    stepCompletion: [],
    stageDropOff: [],
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
