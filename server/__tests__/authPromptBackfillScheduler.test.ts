import {
  startAuthPromptBackfillSchedule,
  DEFAULT_BACKFILL_INITIAL_DELAY_MS,
  DEFAULT_BACKFILL_INTERVAL_MS,
} from "../authPromptBackfillScheduler";
import { PostHogBackfillConfigError } from "../authPromptAnalytics";

function makePool() {
  const pool: any = { end: jest.fn(async () => undefined) };
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

describe("startAuthPromptBackfillSchedule", () => {
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
    startAuthPromptBackfillSchedule({
      getPool: () => makePool(),
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

  it("runs the backfill with a rolling `since` window and records the result", async () => {
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
    const handle = startAuthPromptBackfillSchedule({
      getPool: () => pool,
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
    // 7 days before 2026-05-16T12:00:00Z
    expect(calledOpts).toEqual({ since: "2026-05-09T12:00:00.000Z" });
    expect(result.error).toBeNull();
    expect(result.summary?.inserted).toBe(3);
    expect(handle.getLastResult()).toBe(result);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("records and logs failures without throwing", async () => {
    const t = makeFakeTimers();
    const pool = makePool();
    const backfillImpl = jest.fn(async () => {
      throw new Error("boom");
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = startAuthPromptBackfillSchedule({
      getPool: () => pool,
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
    errSpy.mockRestore();
  });

  it("tags config errors distinctly", async () => {
    const t = makeFakeTimers();
    const backfillImpl = jest.fn(async () => {
      throw new PostHogBackfillConfigError("missing api key");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = startAuthPromptBackfillSchedule({
      getPool: () => makePool(),
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
    const handle = startAuthPromptBackfillSchedule({
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
    const handle = startAuthPromptBackfillSchedule({
      getPool: () => makePool(),
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
