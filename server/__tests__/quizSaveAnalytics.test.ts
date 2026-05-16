import {
  classifyPlacement,
  classifySurface,
  computeQuizSaveAnalytics,
  isQuizSaveEventName,
  recordQuizSaveEvent,
  renderQuizSaveAnalyticsWeeklyCsv,
  resetQuizSaveAnalyticsEnsureCache,
  type WeeklyMetrics,
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

describe("classifyPlacement", () => {
  it("returns 'mid_quiz' / 'result_screen' for the two known placements", () => {
    expect(
      classifyPlacement({
        event: "quiz_save_shown",
        properties: { placement: "mid_quiz" },
      }),
    ).toBe("mid_quiz");
    expect(
      classifyPlacement({
        event: "quiz_save_shown",
        properties: { placement: "result_screen" },
      }),
    ).toBe("result_screen");
  });

  it("returns 'unknown' for missing / unrecognised placements", () => {
    expect(classifyPlacement({ event: "quiz_save_shown" })).toBe("unknown");
    expect(
      classifyPlacement({
        event: "quiz_save_shown",
        properties: { placement: "weird_value" },
      }),
    ).toBe("unknown");
    expect(classifyPlacement(null)).toBe("unknown");
  });
});

describe("recordQuizSaveEvent", () => {
  it("inserts the event with surface + distinct_id + placement and ensures the table once", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));

    await recordQuizSaveEvent(pool, {
      event: "quiz_save_submitted",
      distinct_id: "anon_42",
      properties: { surface: "web", placement: "mid_quiz" },
    });
    await recordQuizSaveEvent(pool, {
      event: "quiz_save_dismissed",
      distinct_id: "anon_43",
      properties: { surface: "web", placement: "result_screen" },
    });

    const createCalls = calls.filter((c) => /CREATE TABLE/.test(c.text));
    const alterCalls = calls.filter((c) =>
      /ALTER TABLE quiz_save_events ADD COLUMN IF NOT EXISTS placement/.test(c.text),
    );
    const insertCalls = calls.filter((c) => /INSERT INTO quiz_save_events/.test(c.text));
    expect(createCalls).toHaveLength(1);
    // The ALTER migration also only runs once thanks to the ensure cache.
    expect(alterCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].values).toEqual([
      "quiz_save_submitted",
      "web",
      "anon_42",
      "mid_quiz",
    ]);
    expect(insertCalls[1].values).toEqual([
      "quiz_save_dismissed",
      "web",
      "anon_43",
      "result_screen",
    ]);
  });

  it("persists NULL placement when the event has no placement attribute", async () => {
    const { pool, calls } = makeFakePool(() => ({ rows: [] }));
    await recordQuizSaveEvent(pool, {
      event: "quiz_save_shown",
      distinct_id: "anon_99",
      properties: { surface: "web" },
    });
    const insert = calls.find((c) => /INSERT INTO quiz_save_events/.test(c.text));
    expect(insert?.values).toEqual(["quiz_save_shown", "web", "anon_99", null]);
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
    expect(insert?.values).toEqual([
      "quiz_save_shown",
      "mobile",
      "device_99",
      null,
    ]);
  });
});

describe("computeQuizSaveAnalytics", () => {
  it("computes recovery rate, surface split, and email-gate cannibalisation", async () => {
    const eventRows = [
      // Web rows are all mid-quiz (the legacy placement); mobile is split
      // between the new post-result modal and a few legacy rows that landed
      // before the placement column was backfilled (placement: null).
      { event: "quiz_save_shown", surface: "web", placement: "mid_quiz", n: "100" },
      { event: "quiz_save_submitted", surface: "web", placement: "mid_quiz", n: "20" },
      { event: "quiz_save_dismissed", surface: "web", placement: "mid_quiz", n: "70" },
      { event: "quiz_save_shown", surface: "mobile", placement: "result_screen", n: "40" },
      { event: "quiz_save_submitted", surface: "mobile", placement: "result_screen", n: "4" },
      { event: "quiz_save_dismissed", surface: "mobile", placement: "result_screen", n: "32" },
      { event: "quiz_save_shown", surface: "mobile", placement: null, n: "10" },
      { event: "quiz_save_submitted", surface: "mobile", placement: null, n: "1" },
      { event: "quiz_save_dismissed", surface: "mobile", placement: null, n: "8" },
    ];
    const leadRows = [
      { source: "web_funnel", n: "60" },
      { source: "web_funnel_save", n: "20" },
      { source: null, n: "5" },
    ];

    // The weekly query now groups by (week_start, placement, surface) and
    // the grid CROSS JOIN guarantees every (placement, surface) cell exists
    // per week. The fake rows below mirror that shape: each week emits one
    // row per (placement × surface), with zeros where nothing landed in
    // that bucket.
    const placements = ["mid_quiz", "result_screen", "unknown"];
    const surfaces = ["web", "mobile"];
    const weeklyTotals = [
      { week_start: "2026-03-09", shown: 0, submitted: 0, dismissed: 0 },
      { week_start: "2026-03-16", shown: 0, submitted: 0, dismissed: 0 },
      { week_start: "2026-03-23", shown: 10, submitted: 1, dismissed: 8 },
      { week_start: "2026-03-30", shown: 20, submitted: 4, dismissed: 14 },
      { week_start: "2026-04-06", shown: 30, submitted: 6, dismissed: 22 },
      { week_start: "2026-04-13", shown: 25, submitted: 5, dismissed: 18 },
      { week_start: "2026-04-20", shown: 40, submitted: 7, dismissed: 30 },
      { week_start: "2026-04-27", shown: 25, submitted: 2, dismissed: 18 },
    ];
    // For weeks with activity we split: half to mid_quiz, half to
    // result_screen, and any odd remainder to the unknown bucket. We then
    // attribute mid_quiz to web and result_screen + unknown to mobile so
    // the surface split mirrors the real-world emission pattern (web =
    // legacy mid-quiz prompt, mobile = new post-result modal + pre-
    // migration NULL placements) and the per-surface assertions below
    // stay deterministic.
    const surfaceFor: Record<string, string> = {
      mid_quiz: "web",
      result_screen: "mobile",
      unknown: "mobile",
    };
    const weeklyRows = weeklyTotals.flatMap((wk) => {
      const split = {
        mid_quiz: {
          shown: Math.floor(wk.shown / 2),
          submitted: Math.floor(wk.submitted / 2),
          dismissed: Math.floor(wk.dismissed / 2),
        },
        result_screen: {
          shown: Math.floor(wk.shown / 2),
          submitted: Math.floor(wk.submitted / 2),
          dismissed: Math.floor(wk.dismissed / 2),
        },
        unknown: {
          shown: wk.shown - 2 * Math.floor(wk.shown / 2),
          submitted: wk.submitted - 2 * Math.floor(wk.submitted / 2),
          dismissed: wk.dismissed - 2 * Math.floor(wk.dismissed / 2),
        },
      } as const;
      // Emit zero rows for every (placement × surface) cell — the SQL grid
      // does this via CROSS JOIN, so the fake response must too — and then
      // fill in the non-zero counts for the (placement, attributed-surface)
      // pair so the totals stay deterministic.
      return placements.flatMap((p) =>
        surfaces.map((s) => ({
          week_start: wk.week_start,
          placement: p,
          surface: s,
          shown: s === surfaceFor[p] ? split[p as keyof typeof split].shown : 0,
          submitted:
            s === surfaceFor[p] ? split[p as keyof typeof split].submitted : 0,
          dismissed:
            s === surfaceFor[p]
              ? split[p as keyof typeof split].dismissed
              : 0,
        })),
      );
    });

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
    // Placement split: mid_quiz reflects the web rows, result_screen reflects
    // the new mobile post-result modal, and unknown captures the legacy
    // mobile rows that landed before the placement column existed.
    expect(result.byPlacement.mid_quiz).toEqual({
      shown: 100,
      submitted: 20,
      dismissed: 70,
      recoveryRate: 0.2,
    });
    expect(result.byPlacement.result_screen).toEqual({
      shown: 40,
      submitted: 4,
      dismissed: 32,
      recoveryRate: 0.1,
    });
    expect(result.byPlacement.unknown).toEqual({
      shown: 10,
      submitted: 1,
      dismissed: 8,
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
    // Each week also carries a per-placement breakdown so the dashboard can
    // plot the new post-result modal against the legacy mid-quiz prompt.
    expect(result.weekly).toHaveLength(8);
    expect(result.weekly[0].weekStart).toBe("2026-03-09");
    expect(result.weekly[0].shown).toBe(0);
    expect(result.weekly[0].recoveryRate).toBeNull();
    // A quiet week still emits a full placement record with zero-filled
    // counts and a null recoveryRate so the chart can rely on a consistent
    // shape across every series.
    expect(result.weekly[0].byPlacement.mid_quiz).toEqual({
      shown: 0,
      submitted: 0,
      dismissed: 0,
      recoveryRate: null,
    });
    expect(result.weekly[0].byPlacement.result_screen).toEqual({
      shown: 0,
      submitted: 0,
      dismissed: 0,
      recoveryRate: null,
    });
    // Week of 2026-03-23: totals = shown 10 / submitted 1 / dismissed 8,
    // split evenly between mid_quiz and result_screen (5/0/4 each) with the
    // odd remainders falling into the unknown bucket (0/1/0).
    expect(result.weekly[2].weekStart).toBe("2026-03-23");
    expect(result.weekly[2].shown).toBe(10);
    expect(result.weekly[2].submitted).toBe(1);
    expect(result.weekly[2].dismissed).toBe(8);
    expect(result.weekly[2].recoveryRate).toBe(0.1);
    expect(result.weekly[2].byPlacement.mid_quiz).toEqual({
      shown: 5,
      submitted: 0,
      dismissed: 4,
      recoveryRate: 0,
    });
    expect(result.weekly[2].byPlacement.result_screen).toEqual({
      shown: 5,
      submitted: 0,
      dismissed: 4,
      recoveryRate: 0,
    });
    expect(result.weekly[2].byPlacement.unknown).toEqual({
      shown: 0,
      submitted: 1,
      dismissed: 0,
      recoveryRate: null,
    });
    // Week of 2026-04-13: totals = shown 25 / submitted 5 / dismissed 18;
    // mid_quiz and result_screen each see 12 shown / 2 submitted / 9
    // dismissed, with the odd remainder in unknown.
    expect(result.weekly[5].byPlacement.mid_quiz).toEqual({
      shown: 12,
      submitted: 2,
      dismissed: 9,
      recoveryRate: 2 / 12,
    });
    expect(result.weekly[5].byPlacement.result_screen).toEqual({
      shown: 12,
      submitted: 2,
      dismissed: 9,
      recoveryRate: 2 / 12,
    });
    expect(result.weekly[7].weekStart).toBe("2026-04-27");
    expect(result.weekly[7].recoveryRate).toBeCloseTo(2 / 25);

    // Per-surface weekly split: web carries the mid_quiz attribution
    // (half of each week's totals) and mobile carries result_screen +
    // unknown (the other half plus odd remainders). Quiet weeks emit
    // zero-filled buckets with a null recoveryRate so the small-multiples
    // chart can rely on a consistent shape.
    expect(result.weekly[0].bySurface.web).toEqual({
      shown: 0,
      submitted: 0,
      dismissed: 0,
      recoveryRate: null,
    });
    expect(result.weekly[0].bySurface.mobile).toEqual({
      shown: 0,
      submitted: 0,
      dismissed: 0,
      recoveryRate: null,
    });
    // Week of 2026-03-23: web sees mid_quiz only (5/0/4); mobile sees
    // result_screen (5/0/4) plus the unknown remainder (0/1/0), so mobile
    // totals are 5/1/4.
    expect(result.weekly[2].bySurface.web).toEqual({
      shown: 5,
      submitted: 0,
      dismissed: 4,
      recoveryRate: 0,
    });
    expect(result.weekly[2].bySurface.mobile).toEqual({
      shown: 5,
      submitted: 1,
      dismissed: 4,
      recoveryRate: 0.2,
    });
    // Week of 2026-04-13: web = mid_quiz (12/2/9); mobile = result_screen
    // (12/2/9) + unknown remainder (1/1/0) = 13/3/9.
    expect(result.weekly[5].bySurface.web).toEqual({
      shown: 12,
      submitted: 2,
      dismissed: 9,
      recoveryRate: 2 / 12,
    });
    expect(result.weekly[5].bySurface.mobile).toEqual({
      shown: 13,
      submitted: 3,
      dismissed: 9,
      recoveryRate: 3 / 13,
    });
    // Web + mobile must always reconcile back to the combined weekly totals.
    for (const w of result.weekly) {
      expect(w.bySurface.web.shown + w.bySurface.mobile.shown).toBe(w.shown);
      expect(w.bySurface.web.submitted + w.bySurface.mobile.submitted).toBe(
        w.submitted,
      );
      expect(w.bySurface.web.dismissed + w.bySurface.mobile.dismissed).toBe(
        w.dismissed,
      );
    }
  });

  it("groups the weekly SQL query by (week_start, placement, surface) and CROSS JOINs the surface grid", async () => {
    // Guard against accidental regression: the dashboard depends on the
    // weekly query emitting a per-surface row for every (week, placement)
    // cell so a quiet surface still anchors the small-multiples chart.
    const captured: string[] = [];
    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      if (/per_week/.test(call.text)) {
        captured.push(call.text);
        return { rows: [] };
      }
      return { rows: [] };
    });

    await computeQuizSaveAnalytics(pool, { windowDays: 30 });

    expect(captured).toHaveLength(1);
    const sql = captured[0];
    expect(sql).toMatch(/CROSS JOIN placements pl CROSS JOIN surfaces s/);
    expect(sql).toMatch(/unnest\(ARRAY\['web', 'mobile'\]\) AS surface/);
    expect(sql).toMatch(/GROUP BY 1, 2, 3/);
    expect(sql).toMatch(/AND p\.surface = g\.surface/);
  });

  it("rolls unexpected weekly placement values into the unknown bucket", async () => {
    // The fixed grid in the SQL only enumerates mid_quiz/result_screen/unknown.
    // The CASE in per_week maps any other placement (legacy or malformed) to
    // 'unknown' so it still reconciles against the grid and contributes to
    // the weekly totals instead of silently dropping out.
    const weeklyRows = [
      // Eight Mondays' worth of zero rows for the two known buckets so the
      // grid is fully covered; only one week has activity and only in the
      // unknown bucket (post-CASE normalisation).
      ...["2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30",
          "2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"].flatMap(
        (week_start) => [
          { week_start, placement: "mid_quiz", shown: 0, submitted: 0, dismissed: 0 },
          { week_start, placement: "result_screen", shown: 0, submitted: 0, dismissed: 0 },
          {
            week_start,
            placement: "unknown",
            shown: week_start === "2026-04-20" ? 6 : 0,
            submitted: week_start === "2026-04-20" ? 3 : 0,
            dismissed: week_start === "2026-04-20" ? 3 : 0,
          },
        ],
      ),
    ];
    const { pool } = makeFakePool((call) => {
      if (/CREATE TABLE/.test(call.text)) return { rows: [] };
      if (/per_week/.test(call.text)) return { rows: weeklyRows };
      if (/FROM quiz_save_events/.test(call.text)) return { rows: [] };
      return { rows: [] };
    });

    const result = await computeQuizSaveAnalytics(pool, { windowDays: 30 });

    const activeWeek = result.weekly.find((w) => w.weekStart === "2026-04-20");
    expect(activeWeek).toBeDefined();
    expect(activeWeek!.shown).toBe(6);
    expect(activeWeek!.submitted).toBe(3);
    expect(activeWeek!.recoveryRate).toBe(0.5);
    expect(activeWeek!.byPlacement.unknown).toEqual({
      shown: 6,
      submitted: 3,
      dismissed: 3,
      recoveryRate: 0.5,
    });
    expect(activeWeek!.byPlacement.mid_quiz.shown).toBe(0);
    expect(activeWeek!.byPlacement.result_screen.shown).toBe(0);
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
    expect(result.byPlacement.mid_quiz.recoveryRate).toBeNull();
    expect(result.byPlacement.result_screen.recoveryRate).toBeNull();
    expect(result.byPlacement.unknown.recoveryRate).toBeNull();
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

describe("renderQuizSaveAnalyticsWeeklyCsv", () => {
  const baseWeek = (overrides: Partial<WeeklyMetrics>): WeeklyMetrics => ({
    weekStart: "2026-04-27",
    shown: 0,
    submitted: 0,
    dismissed: 0,
    recoveryRate: null,
    byPlacement: {
      mid_quiz: { shown: 0, submitted: 0, dismissed: 0, recoveryRate: null },
      result_screen: {
        shown: 0,
        submitted: 0,
        dismissed: 0,
        recoveryRate: null,
      },
      unknown: { shown: 0, submitted: 0, dismissed: 0, recoveryRate: null },
    },
    ...overrides,
  });

  it("emits the full header on the first line", () => {
    const csv = renderQuizSaveAnalyticsWeeklyCsv([]);
    const header = csv.split("\n")[0];
    expect(header).toBe(
      [
        "week_start",
        "shown",
        "submitted",
        "dismissed",
        "recovery_rate",
        "mid_quiz_shown",
        "mid_quiz_submitted",
        "mid_quiz_recovery_rate",
        "result_screen_shown",
        "result_screen_submitted",
        "result_screen_recovery_rate",
        "unknown_shown",
        "unknown_submitted",
        "unknown_recovery_rate",
      ].join(","),
    );
  });

  it("renders totals and per-placement counts with recovery rates", () => {
    const csv = renderQuizSaveAnalyticsWeeklyCsv([
      baseWeek({
        weekStart: "2026-04-20",
        shown: 40,
        submitted: 7,
        dismissed: 30,
        recoveryRate: 7 / 40,
        byPlacement: {
          mid_quiz: {
            shown: 20,
            submitted: 3,
            dismissed: 15,
            recoveryRate: 3 / 20,
          },
          result_screen: {
            shown: 20,
            submitted: 4,
            dismissed: 15,
            recoveryRate: 4 / 20,
          },
          unknown: {
            shown: 0,
            submitted: 0,
            dismissed: 0,
            recoveryRate: null,
          },
        },
      }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    // recovery_rate column is rounded to 4dp; the unknown bucket has a null
    // rate and renders as an empty cell so spreadsheet readers see a blank
    // rather than "0" for a quiet bucket.
    expect(lines[1]).toBe(
      "2026-04-20,40,7,30,0.1750,20,3,0.1500,20,4,0.2000,0,0,",
    );
  });

  it("leaves recovery_rate blank for weeks with no impressions", () => {
    const csv = renderQuizSaveAnalyticsWeeklyCsv([
      baseWeek({ weekStart: "2026-03-09" }),
    ]);
    expect(csv.trim().split("\n")[1]).toBe(
      "2026-03-09,0,0,0,,0,0,,0,0,,0,0,",
    );
  });

  it("ends with a trailing newline for POSIX-friendly imports", () => {
    const csv = renderQuizSaveAnalyticsWeeklyCsv([
      baseWeek({ weekStart: "2026-03-09" }),
    ]);
    expect(csv.endsWith("\n")).toBe(true);
  });
});
