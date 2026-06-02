import {
  DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS,
  computeBackfillFreshness,
  getAuthPromptBackfillFreshness,
  getAuthPromptBackfillStaleThresholdDays,
  renderAuthPromptAnalyticsHtml,
  resetAuthPromptBackfillRunsEnsureCache,
  type AuthPromptAnalytics,
  type BackfillFreshness,
} from "../authPromptAnalytics";

type QueryCall = { text: string; values: unknown[] };

function makePool(
  handler: (call: QueryCall) => { rows: any[]; rowCount?: number } = () => ({
    rows: [],
    rowCount: 0,
  }),
) {
  const calls: QueryCall[] = [];
  const pool: any = {
    query: jest.fn(async (text: string, values?: unknown[]) => {
      const call: QueryCall = { text, values: values ?? [] };
      calls.push(call);
      return handler(call);
    }),
  };
  return { pool, calls };
}

const EMPTY_ANALYTICS: AuthPromptAnalytics = {
  windowDays: 30,
  totals: { entryPoint: "all", shown: 0, converted: 0, conversionRate: null },
  byEntryPoint: [],
  weekly: [],
};

beforeEach(() => {
  resetAuthPromptBackfillRunsEnsureCache();
  delete process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
});

describe("getAuthPromptBackfillStaleThresholdDays", () => {
  it("defaults to 14 days when unset", () => {
    expect(getAuthPromptBackfillStaleThresholdDays()).toBe(
      DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS,
    );
    expect(DEFAULT_AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS).toBe(14);
  });

  it("reads a positive override from the environment", () => {
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "3";
    expect(getAuthPromptBackfillStaleThresholdDays()).toBe(3);
  });

  it("falls back to the default for non-numeric or non-positive values", () => {
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "nope";
    expect(getAuthPromptBackfillStaleThresholdDays()).toBe(14);
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "0";
    expect(getAuthPromptBackfillStaleThresholdDays()).toBe(14);
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "-5";
    expect(getAuthPromptBackfillStaleThresholdDays()).toBe(14);
  });
});

describe("computeBackfillFreshness", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("is fresh when the newest run is within the threshold", () => {
    const f = computeBackfillFreshness(
      "2026-05-28T00:00:00Z", // 4 days ago
      now,
      14,
    );
    expect(f.hasRun).toBe(true);
    expect(f.stale).toBe(false);
    expect(f.ageDays).toBeCloseTo(4, 5);
    expect(f.thresholdDays).toBe(14);
  });

  it("is stale when the newest run is older than the threshold", () => {
    const f = computeBackfillFreshness(
      "2026-05-10T00:00:00Z", // 22 days ago
      now,
      14,
    );
    expect(f.stale).toBe(true);
    expect(f.ageDays).toBeCloseTo(22, 5);
  });

  it("treats the empty/never-run state as NOT stale to avoid deploy-time false alarms", () => {
    const f = computeBackfillFreshness(null, now, 14);
    expect(f.hasRun).toBe(false);
    expect(f.stale).toBe(false);
    expect(f.lastRanAt).toBeNull();
    expect(f.ageDays).toBeNull();
  });

  it("treats an unparseable timestamp as never-run (not stale)", () => {
    const f = computeBackfillFreshness("not-a-date", now, 14);
    expect(f.hasRun).toBe(false);
    expect(f.stale).toBe(false);
  });

  it("clamps a negative age to zero (clock skew defensive)", () => {
    const f = computeBackfillFreshness("2026-06-02T00:00:00Z", now, 14);
    expect(f.ageMs).toBe(0);
    expect(f.stale).toBe(false);
  });
});

describe("getAuthPromptBackfillFreshness", () => {
  it("reads the newest run and computes staleness with the env threshold", async () => {
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "7";
    const { pool, calls } = makePool((call) => {
      if (call.text.includes("SELECT id, ran_at")) {
        return {
          rows: [
            {
              id: 9,
              ran_at: new Date("2026-05-01T00:00:00Z"),
              fetched: 1,
              inserted: 1,
              skipped: 0,
              since_value: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const freshness = await getAuthPromptBackfillFreshness(pool, {
      now: () => new Date("2026-06-01T00:00:00Z"),
    });
    expect(freshness.stale).toBe(true);
    expect(freshness.thresholdDays).toBe(7);
    expect(freshness.lastRanAt).toBe("2026-05-01T00:00:00.000Z");
    // only asks for the single newest row
    const select = calls.find((c) => c.text.includes("SELECT id, ran_at"))!;
    expect(select.values[0]).toBe(1);
  });

  it("reports never-run (not stale) when the table is empty", async () => {
    const { pool } = makePool(() => ({ rows: [] }));
    const freshness = await getAuthPromptBackfillFreshness(pool, {
      now: () => new Date("2026-06-01T00:00:00Z"),
    });
    expect(freshness.hasRun).toBe(false);
    expect(freshness.stale).toBe(false);
  });
});

describe("renderAuthPromptAnalyticsHtml stale warning", () => {
  const runs = [
    {
      id: 1,
      ranAt: "2026-05-01T00:00:00.000Z",
      fetched: 10,
      inserted: 10,
      skipped: 0,
      since: null,
    },
  ];

  it("shows a stale warning when freshness is stale", () => {
    const freshness: BackfillFreshness = {
      hasRun: true,
      lastRanAt: "2026-05-01T00:00:00.000Z",
      ageMs: 22 * 24 * 60 * 60 * 1000,
      ageDays: 22,
      thresholdDays: 14,
      stale: true,
    };
    const html = renderAuthPromptAnalyticsHtml(
      EMPTY_ANALYTICS,
      null,
      runs,
      freshness,
    );
    expect(html).toContain("Backfill is stale");
    expect(html).toContain("22.0");
    expect(html).toContain("14");
  });

  it("does not show a stale warning when fresh", () => {
    const freshness: BackfillFreshness = {
      hasRun: true,
      lastRanAt: "2026-05-30T00:00:00.000Z",
      ageMs: 2 * 24 * 60 * 60 * 1000,
      ageDays: 2,
      thresholdDays: 14,
      stale: false,
    };
    const html = renderAuthPromptAnalyticsHtml(
      EMPTY_ANALYTICS,
      null,
      runs,
      freshness,
    );
    expect(html).not.toContain("Backfill is stale");
  });

  it("omits the warning when no freshness is supplied (backward compatible)", () => {
    const html = renderAuthPromptAnalyticsHtml(EMPTY_ANALYTICS, null, runs);
    expect(html).not.toContain("Backfill is stale");
  });
});
