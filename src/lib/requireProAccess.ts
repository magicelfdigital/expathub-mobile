import { router } from "expo-router";

import { trackEvent } from "@/src/lib/analytics";

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

  if (onBlocked) {
    onBlocked();
  } else {
    router.push("/subscribe" as any);
  }
}
