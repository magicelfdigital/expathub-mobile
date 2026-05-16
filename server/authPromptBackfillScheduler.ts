import pg from "pg";
import {
  backfillAuthPromptEventsFromPostHog,
  PostHogBackfillConfigError,
  type PostHogBackfillSummary,
} from "./authPromptAnalytics";

// ── Scheduled PostHog backfill (task #105) ────────────────────────────────
//
// The auth-prompt backfill (see authPromptAnalytics.ts) was originally only
// invocable manually — either via the admin dashboard "Run backfill" button
// or by POSTing to /api/admin/auth-prompt-analytics/backfill. That worked
// for one-off catch-up runs but left the local `auth_prompt_events` table
// silently drifting from PostHog whenever a live write to Postgres failed
// while the upstream PostHog write succeeded.
//
// This module wires the same backfill into a recurring timer so the local
// table self-heals on a daily cadence. We use a short rolling `since`
// window (default 7 days) so each run stays cheap — the unique
// `posthog_event_id` index means re-importing rows is free (they just
// land in `skipped`). Failures are logged with full context so they show
// up in the workflow log; we deliberately do not crash the server.

export const DEFAULT_BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
export const DEFAULT_BACKFILL_WINDOW_DAYS = 7;
// Run an initial backfill shortly after boot rather than waiting a full
// interval. Long enough that we don't compete with cold-start work.
export const DEFAULT_BACKFILL_INITIAL_DELAY_MS = 60 * 1000; // 60s

export interface ScheduledBackfillResult {
  ranAt: string;
  durationMs: number;
  summary: PostHogBackfillSummary | null;
  error: string | null;
}

export interface AuthPromptBackfillScheduleOptions {
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
  onResult?: (result: ScheduledBackfillResult) => void;
  // Override the underlying backfill (tests).
  backfillImpl?: typeof backfillAuthPromptEventsFromPostHog;
}

export interface AuthPromptBackfillScheduleHandle {
  stop: () => void;
  runNow: () => Promise<ScheduledBackfillResult>;
  getLastResult: () => ScheduledBackfillResult | null;
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

function formatSince(now: () => Date, windowDays: number): string {
  const ms = now().getTime() - windowDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function startAuthPromptBackfillSchedule(
  options: AuthPromptBackfillScheduleOptions,
): AuthPromptBackfillScheduleHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS;
  const initialDelayMs =
    options.initialDelayMs ?? DEFAULT_BACKFILL_INITIAL_DELAY_MS;
  const windowDays = Math.max(1, options.windowDays ?? DEFAULT_BACKFILL_WINDOW_DAYS);
  const now = options.now ?? (() => new Date());
  const setTimeoutFn = options.setTimeoutImpl ?? setTimeout;
  const setIntervalFn = options.setIntervalImpl ?? setInterval;
  const clearTimeoutFn = options.clearTimeoutImpl ?? clearTimeout;
  const clearIntervalFn = options.clearIntervalImpl ?? clearInterval;
  const runBackfill = options.backfillImpl ?? backfillAuthPromptEventsFromPostHog;

  let lastResult: ScheduledBackfillResult | null = null;
  let stopped = false;
  let initialTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  async function runOnce(): Promise<ScheduledBackfillResult> {
    const ranAt = isoNow(now);
    const started = now().getTime();
    const pool = options.getPool();
    if (!pool) {
      const result: ScheduledBackfillResult = {
        ranAt,
        durationMs: 0,
        summary: null,
        error: "Database not configured (DATABASE_URL missing)",
      };
      console.warn(
        "[auth-prompt-backfill] skipped scheduled run — DATABASE_URL not set",
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    }
    const since = formatSince(now, windowDays);
    try {
      const summary = await runBackfill(pool, { since });
      const durationMs = now().getTime() - started;
      const result: ScheduledBackfillResult = {
        ranAt,
        durationMs,
        summary,
        error: null,
      };
      console.log(
        `[auth-prompt-backfill] scheduled run ok — since=${since} ` +
          `fetched=${summary.fetched} inserted=${summary.inserted} ` +
          `skipped=${summary.skipped} pages=${summary.pages} ` +
          `duration=${durationMs}ms`,
      );
      lastResult = result;
      options.onResult?.(result);
      return result;
    } catch (err: any) {
      const durationMs = now().getTime() - started;
      const message =
        err instanceof PostHogBackfillConfigError
          ? `config error: ${err.message}`
          : err?.message ?? String(err);
      const result: ScheduledBackfillResult = {
        ranAt,
        durationMs,
        summary: null,
        error: message,
      };
      console.error(
        `[auth-prompt-backfill] scheduled run FAILED — since=${since} ` +
          `duration=${durationMs}ms error="${message}"`,
      );
      lastResult = result;
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
  // Don't keep the event loop alive just for the schedule.
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
