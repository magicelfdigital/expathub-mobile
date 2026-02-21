const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

const lastRefreshMap = new Map<string, number>();

export function shouldRefresh(
  userId: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
  now: number = Date.now(),
): boolean {
  const last = lastRefreshMap.get(userId);
  if (last === undefined) return true;
  return now - last >= cooldownMs;
}

export function recordRefresh(
  userId: string,
  now: number = Date.now(),
): void {
  lastRefreshMap.set(userId, now);
}

export function clearCooldown(userId?: string): void {
  if (userId) {
    lastRefreshMap.delete(userId);
  } else {
    lastRefreshMap.clear();
  }
}

export function _getLastRefreshTime(userId: string): number | undefined {
  return lastRefreshMap.get(userId);
}
