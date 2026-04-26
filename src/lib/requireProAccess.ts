import { router } from "expo-router";

import { trackEvent } from "@/src/lib/analytics";
import { tryShowExpiryGate } from "@/src/lib/expiryGateBus";

type RequireProAccessOptions = {
  hasProAccess: boolean;
  onAllowed: () => void;
  onBlocked?: () => void;
  source?: string;
};

export function requireProAccess({
  hasProAccess,
  onAllowed,
  onBlocked,
  source,
}: RequireProAccessOptions) {
  if (hasProAccess) {
    onAllowed();
    return;
  }

  trackEvent("paywall_shown", { source: source ?? "unknown" });

  // If the user previously had a 48h reverse trial that has now expired,
  // surface the expiry modal in place of an immediate redirect — this is
  // the conversion moment the spec calls out (premium feature access
  // after preview ends). The gate component decides whether to handle.
  if (tryShowExpiryGate(source)) return;

  if (onBlocked) {
    onBlocked();
  } else {
    router.push("/subscribe" as any);
  }
}
