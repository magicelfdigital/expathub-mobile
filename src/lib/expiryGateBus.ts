/**
 * Tiny in-memory event bus that lets `requireProAccess` ask the
 * mounted `ReverseTrialExpiryGate` to surface the expiry modal when a
 * user attempts to access a premium feature after their 48-hour reverse
 * trial has expired.
 *
 * The gate registers a handler that returns `true` if it consumed the
 * event (i.e. the modal is now showing). When the handler returns
 * `false` (or no handler is registered), `requireProAccess` falls back
 * to its default behaviour (redirect to /subscribe).
 */

type ExpiryGateHandler = (source?: string) => boolean;

let handler: ExpiryGateHandler | null = null;

export function registerExpiryGate(h: ExpiryGateHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

export function tryShowExpiryGate(source?: string): boolean {
  if (!handler) return false;
  try {
    return handler(source);
  } catch {
    return false;
  }
}
