import {
  backfillAuthPromptEventsFromPostHog,
  PostHogBackfillConfigError,
  resetAuthPromptAnalyticsEnsureCache,
  resetAuthPromptBackfillRunsEnsureCache,
} from "../authPromptAnalytics";

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
  resetAuthPromptAnalyticsEnsureCache();
  resetAuthPromptBackfillRunsEnsureCache();
});

describe("backfillAuthPromptEventsFromPostHog", () => {
  it("throws a config error when PostHog credentials are missing", async () => {
    const { pool } = makePool();
    await expect(
      backfillAuthPromptEventsFromPostHog(pool, {
        posthogProjectId: "",
        posthogApiKey: "",
      }),
    ).rejects.toBeInstanceOf(PostHogBackfillConfigError);
  });

  it("inserts events from PostHog preserving timestamp and entry_point", async () => {
    const { pool, calls } = makePool();
    const { impl: fetchImpl, calls: fetchCalls } = makeFetch([
      [
        [
          "uuid-1",
          "auth_prompt_shown",
          "2026-01-15T10:00:00Z",
          "worksheet_list_anon",
          "anon:abc",
        ],
        [
          "uuid-2",
          "auth_prompt_converted",
          "2026-01-15T10:05:00Z",
          "worksheet_list_anon",
          "user:42",
        ],
      ],
      [], // empty page terminates pagination
    ]);

    const summary = await backfillAuthPromptEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogHost: "https://us.posthog.com",
      posthogProjectId: "999",
      posthogApiKey: "phk_test",
      pageSize: 1000,
    });

    expect(summary.fetched).toBe(2);
    expect(summary.inserted).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.firstEventAt).toBe("2026-01-15T10:00:00.000Z");
    expect(summary.lastEventAt).toBe("2026-01-15T10:05:00.000Z");

    // PostHog API called with bearer token + correct project endpoint
    expect(fetchCalls[0].url).toBe(
      "https://us.posthog.com/api/projects/999/query/",
    );
    expect(fetchCalls[0].headers.Authorization).toBe("Bearer phk_test");
    expect(fetchCalls[0].body.query.kind).toBe("HogQLQuery");
    expect(fetchCalls[0].body.query.query).toContain("auth_prompt_shown");
    expect(fetchCalls[0].body.query.query).toContain("auth_prompt_converted");

    // Two INSERTs into auth_prompt_events with explicit created_at +
    // posthog_event_id, plus one summary INSERT into auth_prompt_backfill_runs.
    const inserts = calls.filter((c) =>
      c.text.startsWith("INSERT INTO auth_prompt_events"),
    );
    expect(inserts).toHaveLength(2);
    const runInserts = calls.filter((c) =>
      c.text.startsWith("INSERT INTO auth_prompt_backfill_runs"),
    );
    expect(runInserts).toHaveLength(1);
    expect(runInserts[0].values).toEqual([2, 2, 0, null]);
    expect(inserts[0].text).toContain("ON CONFLICT");
    expect(inserts[0].text).toContain("posthog_event_id");
    expect(inserts[0].values[0]).toBe("auth_prompt_shown");
    expect(inserts[0].values[1]).toBe("worksheet_list_anon");
    expect(inserts[0].values[2]).toBe("anon:abc");
    expect(inserts[0].values[3]).toBeInstanceOf(Date);
    expect((inserts[0].values[3] as Date).toISOString()).toBe(
      "2026-01-15T10:00:00.000Z",
    );
    expect(inserts[0].values[4]).toBe("uuid-1");
  });

  it("reports skipped rows when ON CONFLICT DO NOTHING returns rowCount 0", async () => {
    const { pool } = makePool(() => ({ rowCount: 0, rows: [] }));
    const { impl: fetchImpl } = makeFetch([
      [["uuid-a", "auth_prompt_shown", "2026-02-01T00:00:00Z", "x", "anon:1"]],
      [],
    ]);
    const summary = await backfillAuthPromptEventsFromPostHog(pool, {
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
        ["", "auth_prompt_shown", "2026-02-01T00:00:00Z", "x", "a"], // empty uuid
        ["u2", "some_other_event", "2026-02-01T00:00:00Z", "x", "a"], // wrong event
        ["u3", "auth_prompt_shown", "not-a-date", "x", "a"], // bad ts
        ["u4", "auth_prompt_shown", "2026-02-01T00:00:00Z", "  ", "a"], // empty entry
      ],
      [],
    ]);
    const summary = await backfillAuthPromptEventsFromPostHog(pool, {
      fetchImpl: fetchImpl as any,
      posthogProjectId: "1",
      posthogApiKey: "k",
    });
    expect(summary.fetched).toBe(1);
    expect(summary.inserted).toBe(1);
    const inserts = calls.filter((c) =>
      c.text.startsWith("INSERT INTO auth_prompt_events"),
    );
    expect(inserts).toHaveLength(1);
    // Empty entry_point falls back to "unknown"
    expect(inserts[0].values[1]).toBe("unknown");
  });

  it("paginates with OFFSET until a short page is returned", async () => {
    const { pool } = makePool();
    const page1 = Array.from({ length: 3 }).map((_, i) => [
      `u${i}`,
      "auth_prompt_shown",
      `2026-02-0${i + 1}T00:00:00Z`,
      "ep",
      "a",
    ]);
    const page2 = [
      ["u3", "auth_prompt_converted", "2026-02-04T00:00:00Z", "ep", "a"],
    ];
    const { impl: fetchImpl, calls: fetchCalls } = makeFetch([page1, page2]);
    const summary = await backfillAuthPromptEventsFromPostHog(pool, {
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
    await backfillAuthPromptEventsFromPostHog(pool, {
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
      backfillAuthPromptEventsFromPostHog(pool, {
        fetchImpl,
        posthogProjectId: "1",
        posthogApiKey: "k",
      }),
    ).rejects.toThrow(/401/);
  });
});
