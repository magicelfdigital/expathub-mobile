import {
  getRecentAuthPromptBackfillRuns,
  recordAuthPromptBackfillRun,
  renderAuthPromptAnalyticsHtml,
  resetAuthPromptBackfillRunsEnsureCache,
  type AuthPromptAnalytics,
  type BackfillRunRecord,
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
});

describe("recordAuthPromptBackfillRun", () => {
  it("creates the runs table and inserts a row with counts and since", async () => {
    const { pool, calls } = makePool();
    await recordAuthPromptBackfillRun(
      pool,
      { fetched: 12, inserted: 7, skipped: 5 },
      "2026-01-01",
    );
    const create = calls.find((c) =>
      c.text.includes("CREATE TABLE IF NOT EXISTS auth_prompt_backfill_runs"),
    );
    expect(create).toBeDefined();
    const insert = calls.find((c) => c.text.startsWith("INSERT"));
    expect(insert).toBeDefined();
    expect(insert!.values).toEqual([12, 7, 5, "2026-01-01"]);
  });

  it("stores NULL for an empty/whitespace since value", async () => {
    const { pool, calls } = makePool();
    await recordAuthPromptBackfillRun(
      pool,
      { fetched: 0, inserted: 0, skipped: 0 },
      "   ",
    );
    const insert = calls.find((c) => c.text.startsWith("INSERT"))!;
    expect(insert.values[3]).toBeNull();
  });

  it("truncates pathologically long since values", async () => {
    const { pool, calls } = makePool();
    await recordAuthPromptBackfillRun(
      pool,
      { fetched: 0, inserted: 0, skipped: 0 },
      "x".repeat(200),
    );
    const insert = calls.find((c) => c.text.startsWith("INSERT"))!;
    expect((insert.values[3] as string).length).toBe(64);
  });
});

describe("getRecentAuthPromptBackfillRuns", () => {
  it("returns rows ordered newest-first with normalized fields", async () => {
    const { pool, calls } = makePool((call) => {
      if (call.text.includes("SELECT id, ran_at")) {
        return {
          rows: [
            {
              id: 3,
              ran_at: new Date("2026-05-16T12:00:00Z"),
              fetched: "100",
              inserted: "80",
              skipped: "20",
              since_value: "2026-01-01",
            },
            {
              id: 2,
              ran_at: new Date("2026-05-15T09:30:00Z"),
              fetched: 5,
              inserted: 5,
              skipped: 0,
              since_value: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const runs = await getRecentAuthPromptBackfillRuns(pool, 5);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({
      id: 3,
      ranAt: "2026-05-16T12:00:00.000Z",
      fetched: 100,
      inserted: 80,
      skipped: 20,
      since: "2026-01-01",
    });
    expect(runs[1].since).toBeNull();
    // limit was passed through and clamped into [1, 50]
    const select = calls.find((c) => c.text.includes("SELECT id, ran_at"))!;
    expect(select.values[0]).toBe(5);
  });

  it("clamps the limit into the [1, 50] range", async () => {
    const { pool, calls } = makePool();
    await getRecentAuthPromptBackfillRuns(pool, 9999);
    const select = calls.find((c) => c.text.includes("SELECT id, ran_at"))!;
    expect(select.values[0]).toBe(50);
  });
});

describe("renderAuthPromptAnalyticsHtml with backfill runs", () => {
  it("renders an empty-state when no runs exist", () => {
    const html = renderAuthPromptAnalyticsHtml(EMPTY_ANALYTICS, null, []);
    expect(html).toContain("No PostHog backfill has run yet");
  });

  it("surfaces the latest run summary and a history disclosure", () => {
    const runs: BackfillRunRecord[] = [
      {
        id: 5,
        ranAt: "2026-05-16T12:00:00.000Z",
        fetched: 1200,
        inserted: 900,
        skipped: 300,
        since: "2026-01-01",
      },
      {
        id: 4,
        ranAt: "2026-05-10T08:00:00.000Z",
        fetched: 800,
        inserted: 800,
        skipped: 0,
        since: null,
      },
      {
        id: 3,
        ranAt: "2026-05-01T00:00:00.000Z",
        fetched: 500,
        inserted: 500,
        skipped: 0,
        since: null,
      },
    ];
    const html = renderAuthPromptAnalyticsHtml(EMPTY_ANALYTICS, null, runs);
    expect(html).toContain("Last PostHog backfill");
    expect(html).toContain("2026-05-16T12:00:00.000Z");
    expect(html).toContain("<code>2026-01-01</code>");
    expect(html).toContain("1,200");
    expect(html).toContain("Previous runs (2)");
    expect(html).toContain("2026-05-10T08:00:00.000Z");
    expect(html).toContain("full history");
    // The history block must appear before the weekly trend section so
    // operators see it at a glance above the chart.
    const historyIdx = html.indexOf("Last PostHog backfill");
    const trendIdx = html.indexOf("Weekly trend");
    expect(historyIdx).toBeGreaterThan(-1);
    expect(trendIdx).toBeGreaterThan(historyIdx);
  });

  it("does not render a history disclosure when only one run exists", () => {
    const runs: BackfillRunRecord[] = [
      {
        id: 1,
        ranAt: "2026-05-16T12:00:00.000Z",
        fetched: 10,
        inserted: 10,
        skipped: 0,
        since: null,
      },
    ];
    const html = renderAuthPromptAnalyticsHtml(EMPTY_ANALYTICS, null, runs);
    expect(html).toContain("Last PostHog backfill");
    expect(html).not.toContain("Previous runs");
  });
});
