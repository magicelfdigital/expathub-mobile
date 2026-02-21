export interface PollOptions<T> {
  fn: () => Promise<T>;
  shouldStop: (result: T) => boolean;
  intervalMs: number;
  timeoutMs: number;
}

export interface PollResult<T> {
  result: T;
  timedOut: boolean;
  pollCount: number;
  elapsedMs: number;
}

export async function poll<T>(options: PollOptions<T>): Promise<PollResult<T>> {
  const { fn, shouldStop, intervalMs, timeoutMs } = options;
  const start = Date.now();
  let pollCount = 0;

  while (true) {
    pollCount++;
    const result = await fn();

    if (shouldStop(result)) {
      return {
        result,
        timedOut: false,
        pollCount,
        elapsedMs: Date.now() - start,
      };
    }

    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      return {
        result,
        timedOut: true,
        pollCount,
        elapsedMs: elapsed,
      };
    }

    await delay(intervalMs);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
