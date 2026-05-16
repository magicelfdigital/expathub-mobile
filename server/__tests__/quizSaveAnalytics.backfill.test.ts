import {
  backfillQuizSaveEventsFromPostHog,
  PostHogBackfillConfigError,
  resetQuizSaveAnalyticsEnsureCache,
} from "../quizSaveAnalytics";

type QueryCall = { text: string; values: unknown[] };

function makePool(
  insertResult: (call: QueryCall) => { rowCount: number; rows: any[] } = () => ({
    rowCount: 1,
    rows: [{ id: 1 }],
  }),
) {
  const calls: QueryCall[] = [];
  const pool: any = {
    query: jest.fn(async (text: string, values?: unknown[]) => {
      const call: QueryCall = { text, values: values ?? [] };
      calls.push(call);
      if (text.startsWith("INSERT")) return insertResult(call);
      return { rowCount: 0, rows: [] };
    }),
  };
  return { pool, calls };
}

function makeFetch(pages: any[][]) {
  let i = 0;
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  const impl = jest.fn(async (url: any, init: any) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : null,
      headers: init?.headers,
    });
    const page = pages[i++] ?? [];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ results: page }),
      text: async () => "",
    } as any;
  });
  return { impl, calls };
}

beforeEach(() => {
  resetQuizSaveAnalyticsEnsureCache();
});

describe("backfillQuizSaveEventsFromPostHog", () => {
  it("throws a config error when PostHog credentials are missing", async () => {
    const { pool } = makePool();
    await expect(
      backfillQuizSaveEventsFromPostHog(pool, {
        posthogProjectId: "",
        posthogApiKey: "",
      }),
    ).rejects.toBeInstanceOf(PostHogBackfillConfigError);
  });

  it("inserts events preserving timestamp, surface, and placement", async () => {
    const { pool, calls } = makePool();
    const { impl: fetchImpl, calls: fetchCalls } = makeFetch([
      [
        // web mid-quiz shown
        [
          "uuid-1",
          "quiz_save_shown",
          "2026-01-15T10:00:00Z",
          "web",
          null,
          "mid_quiz",
          "anon:abc",
        ],
        // mobile result_screen submitted
        [
          "uuid-2",
          "quiz_save_submitted",
          "2026-01-15T10:05:00Z",
          null,
          "ios",
          "result_screen",
          "user:42",
        ],
        // dismissed without placement → "unknown" → stored as NULL
        [
          "uuid-3",
          "quiz_save_dismissed",
          "2026-01-15T10:10:00Z",
          "web",
          null,
          null,
          "anon:xyz",
        ],
      ],
      [],
    ]);

    const summary = await backfillQuizSaveEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogHost: "https://us.posthog.com",
      posthogProjectId: "999",
      posthogApiKey: "phk_test",
      pageSize: 1000,
    });

    expect(summary.fetched).toBe(3);
    expect(summary.inserted).toBe(3);
    expect(summary.skipped).toBe(0);
    expect(summary.firstEventAt).toBe("2026-01-15T10:00:00.000Z");
    expect(summary.lastEventAt).toBe("2026-01-15T10:10:00.000Z");

    // PostHog API called with bearer token + correct project endpoint
    expect(fetchCalls[0].url).toBe(
      "https://us.posthog.com/api/projects/999/query/",
    );
    expect(fetchCalls[0].headers.Authorization).toBe("Bearer phk_test");
    expect(fetchCalls[0].body.query.kind).toBe("HogQLQuery");
    expect(fetchCalls[0].body.query.query).toContain("quiz_save_shown");
    expect(fetchCalls[0].body.query.query).toContain("quiz_save_submitted");
    expect(fetchCalls[0].body.query.query).toContain("quiz_save_dismissed");

    const inserts = calls.filter((c) => c.text.startsWith("INSERT"));
    expect(inserts).toHaveLength(3);
    expect(inserts[0].text).toContain("ON CONFLICT");
    expect(inserts[0].text).toContain("posthog_event_id");

    // Row 1: explicit surface=web, placement=mid_quiz
    expect(inserts[0].values[0]).toBe("quiz_save_shown");
    expect(inserts[0].values[1]).toBe("web");
    expect(inserts[0].values[2]).toBe("anon:abc");
    expect(inserts[0].values[3]).toBe("mid_quiz");
    expect(inserts[0].values[4]).toBeInstanceOf(Date);
    expect((inserts[0].values[4] as Date).toISOString()).toBe(
      "2026-01-15T10:00:00.000Z",
    );
    expect(inserts[0].values[5]).toBe("uuid-1");

    // Row 2: platform=ios → mobile; placement=result_screen kept verbatim
    expect(inserts[1].values[1]).toBe("mobile");
    expect(inserts[1].values[3]).toBe("result_screen");

    // Row 3: missing placement → stored as NULL (matches live-write path)
    expect(inserts[2].values[3]).toBeNull();
  });

  it("reports skipped rows when ON CONFLICT DO NOTHING returns rowCount 0", async () => {
    const { pool } = makePool(() => ({ rowCount: 0, rows: [] }));
    const { impl: fetchImpl } = makeFetch([
      [["uuid-a", "quiz_save_shown", "2026-02-01T00:00:00Z", "web", null, "mid_quiz", "anon:1"]],
      [],
    ]);
    const summary = await backfillQuizSaveEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogProjectId: "1",
      posthogApiKey: "k",
    });
    expect(summary.inserted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.fetched).toBe(1);
  });

  it("skips rows with unknown event names or missing uuid/timestamp", async () => {
    const { pool, calls } = makePool();
    const { impl: fetchImpl } = makeFetch([
      [
        ["", "quiz_save_shown", "2026-02-01T00:00:00Z", "web", null, "mid_quiz", "a"],
        ["u2", "some_other_event", "2026-02-01T00:00:00Z", "web", null, "mid_quiz", "a"],
        ["u3", "quiz_save_shown", "not-a-date", "web", null, "mid_quiz", "a"],
        // unrecognised placement string collapses to NULL (unknown bucket)
        ["u4", "quiz_save_shown", "2026-02-01T00:00:00Z", "web", null, "bogus", "a"],
      ],
      [],
    ]);
    const summary = await backfillQuizSaveEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogProjectId: "1",
      posthogApiKey: "k",
    });
    expect(summary.fetched).toBe(1);
    expect(summary.inserted).toBe(1);
    const inserts = calls.filter((c) => c.text.startsWith("INSERT"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values[3]).toBeNull();
  });

  it("paginates with OFFSET until a short page is returned", async () => {
    const { pool } = makePool();
    const page1 = Array.from({ length: 3 }).map((_, i) => [
      `u${i}`,
      "quiz_save_shown",
      `2026-02-0${i + 1}T00:00:00Z`,
      "web",
      null,
      "mid_quiz",
      "a",
    ]);
    const page2 = [
      ["u3", "quiz_save_submitted", "2026-02-04T00:00:00Z", "web", null, "mid_quiz", "a"],
    ];
    const { impl: fetchImpl, calls: fetchCalls } = makeFetch([page1, page2]);
    const summary = await backfillQuizSaveEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogProjectId: "1",
      posthogApiKey: "k",
      pageSize: 3,
    });
    expect(summary.fetched).toBe(4);
    expect(summary.pages).toBe(2);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].body.query.query).toContain("OFFSET 0");
    expect(fetchCalls[1].body.query.query).toContain("OFFSET 3");
  });

  it("applies the since filter to the HogQL query", async () => {
    const { pool } = makePool();
    const { impl: fetchImpl, calls: fetchCalls } = makeFetch([[]]);
    await backfillQuizSaveEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogProjectId: "1",
      posthogApiKey: "k",
      since: "2026-01-01",
    });
    expect(fetchCalls[0].body.query.query).toContain(
      "timestamp >= toDateTime('2026-01-01')",
    );
  });

  it("surfaces upstream HTTP failures", async () => {
    const { pool } = makePool();
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "bad token",
    })) as any;
    await expect(
      backfillQuizSaveEventsFromPostHog(pool, {
        fetchImpl,
        posthogProjectId: "1",
        posthogApiKey: "k",
      }),
    ).rejects.toThrow(/401/);
  });
});
