import {
  startQuizSaveBackfillSchedule,
  DEFAULT_BACKFILL_INITIAL_DELAY_MS,
  DEFAULT_BACKFILL_INTERVAL_MS,
  resetQuizSaveBackfillRunsEnsureCache,
} from "../quizSaveBackfillScheduler";
import {
  PostHogBackfillConfigError,
  resetQuizSaveAnalyticsEnsureCache,
  renderLastBackfillSummary,
} from "../quizSaveAnalytics";

interface FakePool {
  end: jest.Mock;
  query: jest.Mock;
}

function makePool(): FakePool {
  const pool: FakePool = {
    end: jest.fn(async () => undefined),
    // Default: every CREATE TABLE / INDEX / INSERT just resolves with an
    // empty rowset. Individual tests can override per-call as needed.
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  };
  return pool;
}

type TimerEntry = { fn: () => void; delay: number };

function makeFakeTimers() {
  const timeouts: TimerEntry[] = [];
  const intervals: TimerEntry[] = [];
  const setTimeoutImpl: any = (fn: () => void, delay: number) => {
    const handle = { fn, delay, kind: "timeout" } as any;
    timeouts.push(handle);
    return handle;
  };
  const setIntervalImpl: any = (fn: () => void, delay: number) => {
    const handle = { fn, delay, kind: "interval" } as any;
    intervals.push(handle);
    return handle;
  };
  const clearTimeoutImpl: any = jest.fn();
  const clearIntervalImpl: any = jest.fn();
  return {
    timeouts,
    intervals,
    setTimeoutImpl,
    setIntervalImpl,
    clearTimeoutImpl,
    clearIntervalImpl,
  };
}

beforeEach(() => {
  resetQuizSaveBackfillRunsEnsureCache();
  resetQuizSaveAnalyticsEnsureCache();
});

describe("startQuizSaveBackfillSchedule", () => {
  it("schedules an initial delayed run and a recurring interval", () => {
    const t = makeFakeTimers();
    const backfillImpl = jest.fn(async () => ({
      fetched: 0,
      inserted: 0,
      skipped: 0,
      pages: 0,
      firstEventAt: null,
      lastEventAt: null,
    }));
    startQuizSaveBackfillSchedule({
      getPool: () => makePool() as any,
      backfillImpl,
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });

    expect(t.timeouts).toHaveLength(1);
    expect(t.timeouts[0].delay).toBe(DEFAULT_BACKFILL_INITIAL_DELAY_MS);
    expect(t.intervals).toHaveLength(1);
    expect(t.intervals[0].delay).toBe(DEFAULT_BACKFILL_INTERVAL_MS);
  });

  it("runs the backfill with a rolling `since` window, records the result, and persists it", async () => {
    const t = makeFakeTimers();
    const fixedNow = new Date("2026-05-16T12:00:00.000Z");
    const pool = makePool();
    const backfillImpl: any = jest.fn(async (_pool: any, _opts: any) => ({
      fetched: 5,
      inserted: 3,
      skipped: 2,
      pages: 1,
      firstEventAt: "2026-05-10T00:00:00.000Z",
      lastEventAt: "2026-05-16T11:00:00.000Z",
    }));
    const handle = startQuizSaveBackfillSchedule({
      getPool: () => pool as any,
      windowDays: 7,
      backfillImpl,
      now: () => fixedNow,
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });

    const result = await handle.runNow();

    expect(backfillImpl).toHaveBeenCalledTimes(1);
    const [calledPool, calledOpts] = backfillImpl.mock.calls[0];
    expect(calledPool).toBe(pool);
    expect(calledOpts).toEqual({ since: "2026-05-09T12:00:00.000Z" });
    expect(result.error).toBeNull();
    expect(result.summary?.inserted).toBe(3);
    expect(handle.getLastResult()).toBe(result);
    expect(pool.end).toHaveBeenCalledTimes(1);

    // Persistence: must have inserted a row into quiz_save_backfill_runs
    // recording the timestamp, since, counts, and a null error.
    const inserts = pool.query.mock.calls.filter(
      (c) => typeof c[0] === "string" && /INSERT INTO quiz_save_backfill_runs/i.test(c[0]),
    );
    expect(inserts).toHaveLength(1);
    const [, params] = inserts[0];
    expect(params[0]).toBe(result.ranAt);
    expect(params[2]).toBe(5); // fetched
    expect(params[3]).toBe(3); // inserted
    expect(params[4]).toBe(2); // skipped
    expect(params[6]).toBe("2026-05-09T12:00:00.000Z"); // since
    expect(params[7]).toBeNull(); // error
  });

  it("records and logs failures without throwing and still persists the row", async () => {
    const t = makeFakeTimers();
    const pool = makePool();
    const backfillImpl = jest.fn(async () => {
      throw new Error("boom");
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = startQuizSaveBackfillSchedule({
      getPool: () => pool as any,
      backfillImpl,
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });

    const result = await handle.runNow();
    expect(result.error).toBe("boom");
    expect(result.summary).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalledTimes(1);

    const inserts = pool.query.mock.calls.filter(
      (c) => typeof c[0] === "string" && /INSERT INTO quiz_save_backfill_runs/i.test(c[0]),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][7]).toBe("boom"); // error column populated
    errSpy.mockRestore();
  });

  it("tags config errors distinctly", async () => {
    const t = makeFakeTimers();
    const pool = makePool();
    const backfillImpl = jest.fn(async () => {
      throw new PostHogBackfillConfigError("missing api key");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = startQuizSaveBackfillSchedule({
      getPool: () => pool as any,
      backfillImpl,
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });
    const result = await handle.runNow();
    expect(result.error).toBe("config error: missing api key");
  });

  it("skips the run when DATABASE_URL / pool is unavailable", async () => {
    const t = makeFakeTimers();
    const backfillImpl = jest.fn();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const handle = startQuizSaveBackfillSchedule({
      getPool: () => null,
      backfillImpl,
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });
    const result = await handle.runNow();
    expect(backfillImpl).not.toHaveBeenCalled();
    expect(result.summary).toBeNull();
    expect(result.error).toMatch(/DATABASE_URL/);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("stop() clears the pending timers", () => {
    const t = makeFakeTimers();
    const handle = startQuizSaveBackfillSchedule({
      getPool: () => makePool() as any,
      backfillImpl: jest.fn(),
      setTimeoutImpl: t.setTimeoutImpl,
      setIntervalImpl: t.setIntervalImpl,
      clearTimeoutImpl: t.clearTimeoutImpl,
      clearIntervalImpl: t.clearIntervalImpl,
    });
    handle.stop();
    expect(t.clearTimeoutImpl).toHaveBeenCalled();
    expect(t.clearIntervalImpl).toHaveBeenCalled();
  });
});

describe("manual backfill route failure persistence", () => {
  it("records a failed manual run via recordQuizSaveBackfillRun", async () => {
    const { recordQuizSaveBackfillRun } = await import(
      "../quizSaveBackfillScheduler"
    );
    const pool = makePool();
    await recordQuizSaveBackfillRun(pool as any, {
      ranAt: "2026-05-16T12:00:00.000Z",
      durationMs: 42,
      summary: null,
      error: "config error: missing api key",
      since: "2026-05-09T12:00:00.000Z",
    });
    const inserts = pool.query.mock.calls.filter(
      (c) =>
        typeof c[0] === "string" &&
        /INSERT INTO quiz_save_backfill_runs/i.test(c[0]),
    );
    expect(inserts).toHaveLength(1);
    const params = inserts[0][1] as any[];
    expect(params[0]).toBe("2026-05-16T12:00:00.000Z");
    expect(params[2]).toBe(0); // fetched (no summary)
    expect(params[3]).toBe(0); // inserted
    expect(params[4]).toBe(0); // skipped
    expect(params[6]).toBe("2026-05-09T12:00:00.000Z");
    expect(params[7]).toBe("config error: missing api key");
  });
});

describe("renderLastBackfillSummary", () => {
  it("renders 'never run yet' when there is no record", () => {
    const html = renderLastBackfillSummary(null);
    expect(html).toContain("never run yet");
  });

  it("renders a successful last run with inserted/skipped counts", () => {
    const html = renderLastBackfillSummary(
      {
        ranAt: "2026-05-16T11:00:00.000Z",
        inserted: 12,
        skipped: 34,
        fetched: 46,
        error: null,
      },
      new Date("2026-05-16T11:30:00.000Z"),
    );
    expect(html).toContain("Last backfill:");
    expect(html).toContain("30m ago");
    expect(html).toContain("inserted <strong>12</strong>");
    expect(html).toContain("skipped <strong>34</strong>");
  });

  it("renders a failed last run with the error message", () => {
    const html = renderLastBackfillSummary(
      {
        ranAt: "2026-05-16T11:00:00.000Z",
        inserted: 0,
        skipped: 0,
        fetched: 0,
        error: "boom",
      },
      new Date("2026-05-16T12:00:00.000Z"),
    );
    expect(html).toContain("failed");
    expect(html).toContain("boom");
  });
});
