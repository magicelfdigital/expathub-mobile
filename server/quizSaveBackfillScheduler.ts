import pg from "pg";
import {
  backfillQuizSaveEventsFromPostHog,
  ensureQuizSaveEventsTable,
  PostHogBackfillConfigError,
  type QuizSavePostHogBackfillSummary,
} from "./quizSaveAnalytics";

// ── Scheduled PostHog backfill for quiz-save events (task #116) ──────────
//
// Mirrors `authPromptBackfillScheduler.ts` but for the quiz "save your
// progress" prompt. The /api/admin/quiz-save-analytics/backfill endpoint
// was previously only callable from the admin dashboard form, which meant
// the local `quiz_save_events` table silently drifted from PostHog
// whenever a live write to Postgres failed while the PostHog write
// succeeded.
//
// In addition to the rolling-window timer (same as the auth-prompt
// scheduler), this module persists the outcome of every run to a small
// `quiz_save_backfill_runs` table so the admin dashboard can show "Last
// backfill: <time> · inserted N / skipped N" without having to keep the
// information in process memory. That matters because the server is
// restarted on every deploy; without persistence the dashboard would
// always read "never run" until the next scheduled tick.

export const DEFAULT_BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
export const DEFAULT_BACKFILL_WINDOW_DAYS = 7;
// Run an initial backfill shortly after boot rather than waiting a full
// interval. Long enough that we don't compete with cold-start work.
export const DEFAULT_BACKFILL_INITIAL_DELAY_MS = 60 * 1000; // 60s

export interface QuizSaveBackfillRunRecord {
  ranAt: string;
  durationMs: number;
  summary: QuizSavePostHogBackfillSummary | null;
  error: string | null;
}

export interface QuizSaveBackfillScheduleOptions {
  getPool: () => pg.Pool | null;
  intervalMs?: number;
  initialDelayMs?: number;
  windowDays?: number;
  // Injectable for tests.
  now?: () => Date;
  setTimeoutImpl?: typeof setTimeout;
  setIntervalImpl?: typeof setInterval;
  clearTimeoutImpl?: typeof clearTimeout;
  clearIntervalImpl?: typeof clearInterval;
  onResult?: (result: QuizSaveBackfillRunRecord) => void;
  // Override the underlying backfill (tests).
  backfillImpl?: typeof backfillQuizSaveEventsFromPostHog;
}

export interface QuizSaveBackfillScheduleHandle {
  stop: () => void;
  runNow: () => Promise<QuizSaveBackfillRunRecord>;
  getLastResult: () => QuizSaveBackfillRunRecord | null;
}

let ensureRunsTablePromise: Promise<void> | null = null;

export function resetQuizSaveBackfillRunsEnsureCache(): void {
  ensureRunsTablePromise = null;
}

export async function ensureQuizSaveBackfillRunsTable(
  pool: pg.Pool,
): Promise<void> {
  if (!ensureRunsTablePromise) {
    ensureRunsTablePromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS quiz_save_backfill_runs (
           id SERIAL PRIMARY KEY,
           ran_at TIMESTAMPTZ NOT NULL,
           duration_ms INTEGER NOT NULL DEFAULT 0,
           fetched INTEGER NOT NULL DEFAULT 0,
           inserted INTEGER NOT NULL DEFAULT 0,
           skipped INTEGER NOT NULL DEFAULT 0,
           pages INTEGER NOT NULL DEFAULT 0,
           since_value TEXT,
           error TEXT
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS quiz_save_backfill_runs_ran_at_idx
           ON quiz_save_backfill_runs (ran_at DESC)`,
      );
    })().catch((err) => {
      ensureRunsTablePromise = null;
      throw err;
    });
  }
  await ensureRunsTablePromise;
}

export async function recordQuizSaveBackfillRun(
  pool: pg.Pool,
  run: QuizSaveBackfillRunRecord & { since: string | null },
): Promise<void> {
  await ensureQuizSaveBackfillRunsTable(pool);
  await pool.query(
    `INSERT INTO quiz_save_backfill_runs
       (ran_at, duration_ms, fetched, inserted, skipped, pages, since_value, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      run.ranAt,
      run.durationMs,
      run.summary?.fetched ?? 0,
      run.summary?.inserted ?? 0,
      run.summary?.skipped ?? 0,
      run.summary?.pages ?? 0,
      run.since,
      run.error,
    ],
  );
}

export interface LatestQuizSaveBackfillRun {
  ranAt: string;
  durationMs: number;
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  since: string | null;
  error: string | null;
}

export async function getLatestQuizSaveBackfillRun(
  pool: pg.Pool,
): Promise<LatestQuizSaveBackfillRun | null> {
  await ensureQuizSaveBackfillRunsTable(pool);
  const result = await pool.query<{
    ran_at: Date | string;
    duration_ms: number;
    fetched: number;
    inserted: number;
    skipped: number;
    pages: number;
    since_value: string | null;
    error: string | null;
  }>(
    `SELECT ran_at, duration_ms, fetched, inserted, skipped, pages,
            since_value, error
       FROM quiz_save_backfill_runs
      ORDER BY ran_at DESC
      LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  const ranAt =
    row.ran_at instanceof Date ? row.ran_at.toISOString() : String(row.ran_at);
  return {
    ranAt,
    durationMs: Number(row.duration_ms) || 0,
    fetched: Number(row.fetched) || 0,
    inserted: Number(row.inserted) || 0,
    skipped: Number(row.skipped) || 0,
    pages: Number(row.pages) || 0,
    since: row.since_value,
    error: row.error,
  };
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

function formatSince(now: () => Date, windowDays: number): string {
  const ms = now().getTime() - windowDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function startQuizSaveBackfillSchedule(
  options: QuizSaveBackfillScheduleOptions,
): QuizSaveBackfillScheduleHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS;
  const initialDelayMs =
    options.initialDelayMs ?? DEFAULT_BACKFILL_INITIAL_DELAY_MS;
  const windowDays = Math.max(
    1,
    options.windowDays ?? DEFAULT_BACKFILL_WINDOW_DAYS,
  );
  const now = options.now ?? (() => new Date());
  const setTimeoutFn = options.setTimeoutImpl ?? setTimeout;
  const setIntervalFn = options.setIntervalImpl ?? setInterval;
  const clearTimeoutFn = options.clearTimeoutImpl ?? clearTimeout;
  const clearIntervalFn = options.clearIntervalImpl ?? clearInterval;
  const runBackfill =
    options.backfillImpl ?? backfillQuizSaveEventsFromPostHog;

  let lastResult: QuizSaveBackfillRunRecord | null = null;
  let stopped = false;
  let initialTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  async function persistResult(
    result: QuizSaveBackfillRunRecord,
    since: string | null,
    pool: pg.Pool,
  ): Promise<void> {
    try {
      // Make sure the events table (and its idempotency index) exists
      // before we record a run that may report 0/0/0 because the underlying
      // events table was empty on the first boot.
      await ensureQuizSaveEventsTable(pool);
      await recordQuizSaveBackfillRun(pool, { ...result, since });
    } catch (err: any) {
      // Persistence is best-effort: a logging failure must not crash the
      // server or mask the underlying backfill outcome.
      console.error(
        `[quiz-save-backfill] failed to persist run record: ${err?.message ?? err}`,
      );
    }
  }

  async function runOnce(): Promise<QuizSaveBackfillRunRecord> {
    const ranAt = isoNow(now);
    const started = now().getTime();
    const pool = options.getPool();
    if (!pool) {
      const result: QuizSaveBackfillRunRecord = {
        ranAt,
        durationMs: 0,
        summary: null,
        error: "Database not configured (DATABASE_URL missing)",
      };
      console.warn(
        "[quiz-save-backfill] skipped scheduled run — DATABASE_URL not set",
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    }
    const since = formatSince(now, windowDays);
    try {
      const summary = await runBackfill(pool, { since });
      const durationMs = now().getTime() - started;
      const result: QuizSaveBackfillRunRecord = {
        ranAt,
        durationMs,
        summary,
        error: null,
      };
      console.log(
        `[quiz-save-backfill] scheduled run ok — since=${since} ` +
          `fetched=${summary.fetched} inserted=${summary.inserted} ` +
          `skipped=${summary.skipped} pages=${summary.pages} ` +
          `duration=${durationMs}ms`,
      );
      lastResult = result;
      await persistResult(result, since, pool);
      options.onResult?.(result);
      return result;
    } catch (err: any) {
      const durationMs = now().getTime() - started;
      const message =
        err instanceof PostHogBackfillConfigError
          ? `config error: ${err.message}`
          : err?.message ?? String(err);
      const result: QuizSaveBackfillRunRecord = {
        ranAt,
        durationMs,
        summary: null,
        error: message,
      };
      console.error(
        `[quiz-save-backfill] scheduled run FAILED — since=${since} ` +
          `duration=${durationMs}ms error="${message}"`,
      );
      lastResult = result;
      await persistResult(result, since, pool);
      options.onResult?.(result);
      return result;
    } finally {
      // The backfill uses a fresh pool each run; close it so we don't
      // accumulate idle connections.
      try {
        await pool.end();
      } catch {
        // ignore — pool may already be ended by handler
      }
    }
  }

  initialTimer = setTimeoutFn(() => {
    initialTimer = null;
    if (stopped) return;
    void runOnce();
  }, initialDelayMs);
  (initialTimer as any)?.unref?.();

  intervalTimer = setIntervalFn(() => {
    if (stopped) return;
    void runOnce();
  }, intervalMs);
  (intervalTimer as any)?.unref?.();

  return {
    stop: () => {
      stopped = true;
      if (initialTimer) clearTimeoutFn(initialTimer);
      if (intervalTimer) clearIntervalFn(intervalTimer);
      initialTimer = null;
      intervalTimer = null;
    },
    runNow: runOnce,
    getLastResult: () => lastResult,
  };
}
