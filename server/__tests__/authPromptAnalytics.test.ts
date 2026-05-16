import {
  computeAuthPromptAnalytics,
  extractEntryPoint,
  isAuthPromptEventName,
  recordAuthPromptEvent,
  renderAuthPromptAnalyticsCsv,
  resetAuthPromptAnalyticsEnsureCache,
  UNKNOWN_ENTRY_POINT,
} from "../authPromptAnalytics";

type QueryCall = { text: string; values: unknown[] };

function makeFakePool(handler: (call: QueryCall) => { rows: any[] }) {
  const calls: QueryCall[] = [];
  const pool = {
    query: jest.fn(async (text: string, values?: unknown[]) => {
      const call: QueryCall = { text, values: values ?? [] };
      calls.push(call);
      return handler(call);
    }),
  } as any;
  return { pool, calls };
}

beforeEach(() => {
  resetAuthPromptAnalyticsEnsureCache();
});

describe("isAuthPromptEventName", () => {
  it("recognises both event names", () => {
    expect(isAuthPromptEventName("auth_prompt_shown")).toBe(true);
    expect(isAuthPromptEventName("auth_prompt_converted")).toBe(true);
  });
  it("rejects unrelated events", () => {
    expect(isAuthPromptEventName("quiz_save_shown")).toBe(false);
    expect(isAuthPromptEventName(undefined)).toBe(false);
  });
});

describe("extractEntryPoint", () => {
  it("returns the entry_point string when present in properties", () => {
    expect(
      extractEntryPoint({
        event: "auth_prompt_shown",
        properties: { entry_point: "worksheet_list_anon" },
      }),
    ).toBe("worksheet_list_anon");
  });

  it("falls back to 'unknown' for missing or non-string entry_point", () => {
    expect(extractEntryPoint({ event: "auth_prompt_shown" })).toBe(
      UNKNOWN_ENTRY_POINT,
    );
    expect(
      extractEntryPoint({
        event: "auth_prompt_shown",
        properties: { entry_point: 42 },
      }),
    ).toBe(UNKNOWN_ENTRY_POINT);
    expect(
      extractEntryPoint({
        event: "auth_prompt_shown",
        properties: { entry_point: "   " },
      }),
    ).toBe(UNKNOWN_ENTRY_POINT);
    expect(extractEntryPoint(null)).toBe(UNKNOWN_ENTRY_POINT);
  });

  it("truncates pathological entry_point values to fit the column", () => {
    const long = "x".repeat(200);
    expect(extractEntryPoint({ properties: { entry_point: long } })).toHaveLength(
      64,
    );
  });
});

describe("recordAuthPromptEvent", () => {
  it("inserts a row with event, entry_point, and distinct_id", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordAuthPromptEvent(pool, {
      event: "auth_prompt_shown",
      distinct_id: "anon:123",
      properties: { entry_point: "worksheet_detail_anon" },
    });
    const insert = calls.find((c) => c.text.includes("INSERT INTO auth_prompt_events"));
    expect(insert).toBeDefined();
    expect(insert!.values).toEqual([
      "auth_prompt_shown",
      "worksheet_detail_anon",
      "anon:123",
    ]);
  });

  it("ignores non-auth-prompt events", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordAuthPromptEvent(pool, {
      event: "quiz_save_shown",
      properties: { entry_point: "worksheet_list_anon" },
    });
    expect(calls.find((c) => c.text.startsWith("INSERT"))).toBeUndefined();
  });
});

describe("computeAuthPromptAnalytics", () => {
  it("aggregates conversion rate per entry_point and totals", async () => {
    const { pool } = makeFakePool((call) => {
      if (call.text.includes("FROM auth_prompt_events") && call.text.includes("GROUP BY event, entry_point")) {
        return {
          rows: [
            { event: "auth_prompt_shown", entry_point: "worksheet_list_anon", n: "100" },
            { event: "auth_prompt_converted", entry_point: "worksheet_list_anon", n: "20" },
            { event: "auth_prompt_shown", entry_point: "worksheet_detail_anon", n: "40" },
            { event: "auth_prompt_converted", entry_point: "worksheet_detail_anon", n: "16" },
          ],
        };
      }
      // weekly query
      return {
        rows: [
          { week_start: "2026-05-04", shown: 50, converted: 10 },
          { week_start: "2026-05-11", shown: 90, converted: 26 },
        ],
      };
    });
    const data = await computeAuthPromptAnalytics(pool, { windowDays: 30 });
    expect(data.windowDays).toBe(30);
    expect(data.totals).toMatchObject({ shown: 140, converted: 36 });
    expect(data.totals.conversionRate).toBeCloseTo(36 / 140, 5);
    // sorted by shown desc
    expect(data.byEntryPoint.map((e) => e.entryPoint)).toEqual([
      "worksheet_list_anon",
      "worksheet_detail_anon",
    ]);
    expect(data.byEntryPoint[0].conversionRate).toBeCloseTo(0.2, 5);
    expect(data.byEntryPoint[1].conversionRate).toBeCloseTo(0.4, 5);
    expect(data.weekly).toHaveLength(2);
    expect(data.weekly[1].conversionRate).toBeCloseTo(26 / 90, 5);
  });

  it("clamps windowDays into the 1..365 range", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await computeAuthPromptAnalytics(pool, { windowDays: 9999 });
    const evCall = calls.find((c) => c.text.includes("GROUP BY event, entry_point"));
    expect(evCall!.values[0]).toBe("365 days");
  });

  it("returns null conversion rate when no impressions", async () => {
    const { pool } = makeFakePool(() => ({ rows: [] }));
    const data = await computeAuthPromptAnalytics(pool, { windowDays: 30 });
    expect(data.totals.conversionRate).toBeNull();
    expect(data.byEntryPoint).toEqual([]);
  });
});

describe("renderAuthPromptAnalyticsCsv", () => {
  it("emits per-entry-point rows, a total row, and weekly rows", () => {
    const csv = renderAuthPromptAnalyticsCsv({
      windowDays: 30,
      totals: { entryPoint: "all", shown: 140, converted: 36, conversionRate: 36 / 140 },
      byEntryPoint: [
        { entryPoint: "worksheet_list_anon", shown: 100, converted: 20, conversionRate: 0.2 },
        { entryPoint: "worksheet_detail_anon", shown: 40, converted: 16, conversionRate: 0.4 },
      ],
      weekly: [
        { weekStart: "2026-05-04", shown: 50, converted: 10, conversionRate: 0.2 },
        { weekStart: "2026-05-11", shown: 0, converted: 0, conversionRate: null },
      ],
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("# Auth-prompt analytics — last 30 days");
    expect(lines[2]).toBe("section,key,shown,converted,conversion_rate");
    expect(lines).toContain("entry_point,worksheet_list_anon,100,20,0.2000");
    expect(lines).toContain("entry_point,worksheet_detail_anon,40,16,0.4000");
    expect(lines).toContain("entry_point,__total__,140,36,0.2571");
    expect(lines).toContain("weekly,2026-05-04,50,10,0.2000");
    // Null conversion rate becomes an empty field.
    expect(lines).toContain("weekly,2026-05-11,0,0,");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("escapes entry_point values containing commas or quotes", () => {
    const csv = renderAuthPromptAnalyticsCsv({
      windowDays: 7,
      totals: { entryPoint: "all", shown: 1, converted: 0, conversionRate: 0 },
      byEntryPoint: [
        { entryPoint: 'weird,"value"', shown: 1, converted: 0, conversionRate: 0 },
      ],
      weekly: [],
    });
    expect(csv).toContain('entry_point,"weird,""value""",1,0,0.0000');
  });

  it("defuses CSV formula injection on caller-supplied entry_point values", () => {
    const csv = renderAuthPromptAnalyticsCsv({
      windowDays: 7,
      totals: { entryPoint: "all", shown: 0, converted: 0, conversionRate: null },
      byEntryPoint: [
        { entryPoint: "=SUM(A1:A9)", shown: 1, converted: 0, conversionRate: 0 },
        { entryPoint: "@cmd", shown: 1, converted: 0, conversionRate: 0 },
      ],
      weekly: [],
    });
    expect(csv).toContain("entry_point,'=SUM(A1:A9),1,0,0.0000");
    expect(csv).toContain("entry_point,'@cmd,1,0,0.0000");
  });
});
