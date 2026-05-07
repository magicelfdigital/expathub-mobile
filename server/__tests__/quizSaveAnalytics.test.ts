import {
  classifySurface,
  computeQuizSaveAnalytics,
  isQuizSaveEventName,
  recordQuizSaveEvent,
  resetQuizSaveAnalyticsEnsureCache,
} from "../quizSaveAnalytics";

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
  resetQuizSaveAnalyticsEnsureCache();
});

describe("classifySurface", () => {
  it("returns 'web' when properties.surface = 'web'", () => {
    expect(
      classifySurface({
        event: "quiz_save_shown",
        properties: { surface: "web" },
      }),
    ).toBe("web");
  });

  it("returns 'web' when top-level platform = 'web'", () => {
    expect(
      classifySurface({ event: "quiz_save_shown", platform: "web" }),
    ).toBe("web");
  });

  it("returns 'mobile' for ios/android platforms", () => {
    expect(
      classifySurface({ event: "quiz_save_shown", platform: "ios" }),
    ).toBe("mobile");
    expect(
      classifySurface({ event: "quiz_save_shown", platform: "android" }),
    ).toBe("mobile");
  });

  it("returns 'mobile' when no surface or platform info is present", () => {
    expect(classifySurface({ event: "quiz_save_shown" })).toBe("mobile");
    expect(classifySurface(null)).toBe("mobile");
  });
});

describe("isQuizSaveEventName", () => {
  it.each([
    "quiz_save_shown",
    "quiz_save_submitted",
    "quiz_save_dismissed",
  ])("recognises %s", (name) => {
    expect(isQuizSaveEventName(name)).toBe(true);
  });

  it("rejects unrelated events", () => {
    expect(isQuizSaveEventName("quiz_completed")).toBe(false);
    expect(isQuizSaveEventName("$identify")).toBe(false);
    expect(isQuizSaveEventName(undefined)).toBe(false);
  });
});

describe("recordQuizSaveEvent", () => {
  it("inserts the event with surface + distinct_id and ensures the table once", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));

    await recordQuizSaveEvent(pool, {
      event: "quiz_save_submitted",
      distinct_id: "anon_42",
      properties: { surface: "web" },
    });
    await recordQuizSaveEvent(pool, {
      event: "quiz_save_dismissed",
      distinct_id: "anon_43",
      properties: { surface: "web" },
    });

    const createCalls = calls.filter((c) => /CREATE TABLE/.test(c.text));
    const insertCalls = calls.filter((c) => /INSERT INTO quiz_save_events/.test(c.text));
    expect(createCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].values).toEqual([
      "quiz_save_submitted",
      "web",
      "anon_42",
    ]);
    expect(insertCalls[1].values).toEqual([
      "quiz_save_dismissed",
      "web",
      "anon_43",
    ]);
  });

  it("ignores non-quiz-save events", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordQuizSaveEvent(pool, {
      event: "quiz_completed",
      properties: { surface: "web" },
    });
    expect(calls.filter((c) => /INSERT INTO quiz_save_events/.test(c.text))).toHaveLength(0);
  });

  it("ignores non-object payloads", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordQuizSaveEvent(pool, null);
    await recordQuizSaveEvent(pool, "not-json");
    expect(calls).toHaveLength(0);
  });

  it("classifies a missing surface as 'mobile'", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordQuizSaveEvent(pool, {
      event: "quiz_save_shown",
      distinct_id: "device_99",
      platform: "ios",
    });
    const insert = calls.find((c) => /INSERT INTO quiz_save_events/.test(c.text));
    expect(insert?.values).toEqual(["quiz_save_shown", "mobile", "device_99"]);
  });
});

describe("computeQuizSaveAnalytics", () => {
  it("computes recovery rate, surface split, and email-gate cannibalisation", async () => {
    const eventRows = [
      { event: "quiz_save_shown", surface: "web", n: "100" },
      { event: "quiz_save_submitted", surface: "web", n: "20" },
      { event: "quiz_save_dismissed", surface: "web", n: "70" },
      { event: "quiz_save_shown", surface: "mobile", n: "50" },
      { event: "quiz_save_submitted", surface: "mobile", n: "5" },
      { event: "quiz_save_dismissed", surface: "mobile", n: "40" },
    ];
    const leadRows = [
      { source: "web_funnel", n: "60" },
      { source: "web_funnel_save", n: "20" },
      { source: null, n: "5" },
    ];

    const weeklyRows = [
      { week_start: "2026-03-09", shown: 0, submitted: 0, dismissed: 0 },
      { week_start: "2026-03-16", shown: 0, submitted: 0, dismissed: 0 },
      { week_start: "2026-03-23", shown: 10, submitted: 1, dismissed: 8 },
      { week_start: "2026-03-30", shown: 20, submitted: 4, dismissed: 14 },
      { week_start: "2026-04-06", shown: 30, submitted: 6, dismissed: 22 },
      { week_start: "2026-04-13", shown: 25, submitted: 5, dismissed: 18 },
      { week_start: "2026-04-20", shown: 40, submitted: 7, dismissed: 30 },
      { week_start: "2026-04-27", shown: 25, submitted: 2, dismissed: 18 },
    ];

    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      // The weekly bucket query also reads from quiz_save_events but selects
      // a different shape (week_start/shown/submitted/dismissed), so match it
      // first via its CTE name before falling through to the totals query.
      if (/per_week/.test(call.text)) return { rows: weeklyRows };
      if (/FROM quiz_save_events/.test(call.text)) return { rows: eventRows };
      if (/FROM quiz_leads/.test(call.text)) return { rows: leadRows };
      return { rows: [] };
    });

    const result = await computeQuizSaveAnalytics(pool, { windowDays: 30 });

    expect(result.windowDays).toBe(30);
    expect(result.totals).toEqual({
      shown: 150,
      submitted: 25,
      dismissed: 110,
      recoveryRate: 25 / 150,
    });
    expect(result.bySurface.web).toEqual({
      shown: 100,
      submitted: 20,
      dismissed: 70,
      recoveryRate: 0.2,
    });
    expect(result.bySurface.mobile).toEqual({
      shown: 50,
      submitted: 5,
      dismissed: 40,
      recoveryRate: 0.1,
    });
    // Direct = web_funnel (60) + null source (5); save = web_funnel_save (20).
    expect(result.emailGate).toEqual({
      directCaptures: 65,
      saveCaptures: 20,
      saveShareOfCaptures: 20 / 85,
      unavailable: false,
    });
    // Weekly buckets: 8 rows oldest-first, recoveryRate computed per week
    // and null when shown is 0 so a quiet week renders as "—" instead of 0%.
    expect(result.weekly).toHaveLength(8);
    expect(result.weekly[0]).toEqual({
      weekStart: "2026-03-09",
      shown: 0,
      submitted: 0,
      dismissed: 0,
      recoveryRate: null,
    });
    expect(result.weekly[2]).toEqual({
      weekStart: "2026-03-23",
      shown: 10,
      submitted: 1,
      dismissed: 8,
      recoveryRate: 0.1,
    });
    expect(result.weekly[7].weekStart).toBe("2026-04-27");
    expect(result.weekly[7].recoveryRate).toBeCloseTo(2 / 25);
  });

  it("returns null recoveryRate / saveShare when there's no data", async () => {
    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      return { rows: [] };
    });

    const result = await computeQuizSaveAnalytics(pool, { windowDays: 7 });

    expect(result.totals.recoveryRate).toBeNull();
    expect(result.bySurface.web.recoveryRate).toBeNull();
    expect(result.bySurface.mobile.recoveryRate).toBeNull();
    expect(result.emailGate.saveShareOfCaptures).toBeNull();
    expect(result.emailGate.unavailable).toBe(false);
  });

  it("clamps the window to the [1, 365] day range", async () => {
    const captured: unknown[][] = [];
    const { pool } = makeFakePool((call) => {
      captured.push(call.values);
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      return { rows: [] };
    });

    const tooSmall = await computeQuizSaveAnalytics(pool, { windowDays: 0 });
    const tooLarge = await computeQuizSaveAnalytics(pool, { windowDays: 9999 });

    expect(tooSmall.windowDays).toBe(1);
    expect(tooLarge.windowDays).toBe(365);
    // Every parameterised query should receive the clamped interval string.
    const intervals = captured
      .filter((vals) => typeof vals?.[0] === "string")
      .map((vals) => vals[0]);
    expect(intervals).toEqual(
      expect.arrayContaining(["1 days", "365 days"]),
    );
  });

  it("flags unavailable when quiz_leads is missing (SQLSTATE 42P01) and zeroes the email-gate row", async () => {
    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      if (/FROM quiz_save_events/.test(call.text)) {
        return {
          rows: [
            { event: "quiz_save_shown", surface: "web", n: "10" },
            { event: "quiz_save_submitted", surface: "web", n: "1" },
          ],
        };
      }
      if (/FROM quiz_leads/.test(call.text)) {
        const err: any = new Error('relation "quiz_leads" does not exist');
        err.code = "42P01";
        throw err;
      }
      return { rows: [] };
    });

    const result = await computeQuizSaveAnalytics(pool, { windowDays: 30 });

    expect(result.bySurface.web.shown).toBe(10);
    expect(result.bySurface.web.recoveryRate).toBe(0.1);
    expect(result.emailGate).toEqual({
      directCaptures: 0,
      saveCaptures: 0,
      saveShareOfCaptures: null,
      unavailable: true,
    });
  });

  it("re-throws non-missing-table errors so silent zeros don't hide real DB failures", async () => {
    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      if (/FROM quiz_save_events/.test(call.text)) return { rows: [] };
      if (/FROM quiz_leads/.test(call.text)) {
        const err: any = new Error("statement timeout");
        err.code = "57014";
        throw err;
      }
      return { rows: [] };
    });

    await expect(
      computeQuizSaveAnalytics(pool, { windowDays: 30 }),
    ).rejects.toThrow(/statement timeout/);
  });
});
