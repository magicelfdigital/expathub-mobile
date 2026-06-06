/**
 * Tiny global toast bus.
 *
 * Components like ProPaywall need to show a confirmation toast _while
 * unmounting themselves_ (e.g. on dismiss → close).
 * If the Toast lives inside the unmounting component the user never sees
 * it. This bus lets any component fire a toast that is rendered by the
 * top-level `<GlobalToast />` mounted in `app/_layout.tsx`, so the toast
 * survives the unmount.
 */

export type ToastVariant = "success" | "info";

export type ToastPayload = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastHandler = (payload: ToastPayload) => void;

let handler: ToastHandler | null = null;

export function registerToast(h: ToastHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

export function showToast(payload: ToastPayload | string) {
  if (!handler) return;
  const normalized: ToastPayload =
    typeof payload === "string" ? { message: payload } : payload;
  try {
    handler(normalized);
  } catch {
    // swallow — toast is non-critical UX
  }
}
