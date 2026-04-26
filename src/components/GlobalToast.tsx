import React, { useEffect, useState } from "react";

import { Toast } from "@/src/components/Toast";
import { registerToast, type ToastPayload } from "@/src/lib/toastBus";

/**
 * Top-level toast surface mounted in `app/_layout.tsx`.
 *
 * Any component can call `showToast(...)` from `@/src/lib/toastBus` and
 * the message will render here, surviving unmounts of the caller.
 */
export function GlobalToast() {
  const [payload, setPayload] = useState<ToastPayload | null>(null);

  useEffect(() => {
    return registerToast((next) => {
      // Re-trigger the underlying Toast even if the same message fires twice.
      setPayload(null);
      setTimeout(() => setPayload(next), 0);
    });
  }, []);

  return (
    <Toast
      visible={!!payload}
      message={payload?.message ?? ""}
      variant={payload?.variant ?? "info"}
      durationMs={payload?.durationMs ?? 2800}
      onHide={() => setPayload(null)}
    />
  );
}
