import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { useEntitlement } from "@/src/contexts/EntitlementContext";
import { ExpiryModal } from "@/src/components/ExpiryModal";
import { trackEvent } from "@/src/lib/analytics";
import { registerExpiryGate } from "@/src/lib/expiryGateBus";

/**
 * Top-level controller that surfaces the ExpiryModal when the user
 * attempts to access a premium feature after their 48-hour reverse
 * trial has expired. Mounted near the root inside the
 * EntitlementProvider so it can observe trial state across the app.
 */
export function ReverseTrialExpiryGate() {
  const router = useRouter();
  const {
    reverseTrialUsed,
    reverseTrialActive,
    reverseTrialExpiresAt,
    hasFullAccess,
  } = useEntitlement();

  const [open, setOpen] = useState(false);
  const [lastSource, setLastSource] = useState<string | undefined>(undefined);

  // Stable handler that the bus calls when requireProAccess is invoked.
  // Returning true tells the caller "I'm handling the prompt — don't
  // navigate". Returning false lets the caller fall back to /subscribe.
  useEffect(() => {
    return registerExpiryGate((source) => {
      if (!reverseTrialUsed) return false;
      if (reverseTrialActive) return false;
      if (hasFullAccess) return false;
      if (!reverseTrialExpiresAt) return false;
      if (Date.now() < reverseTrialExpiresAt) return false;

      setLastSource(source);
      setOpen(true);
      trackEvent("reverse_trial_expired", {
        surface: "expiry_modal",
        source: source ?? "unknown",
      });
      return true;
    });
  }, [
    reverseTrialUsed,
    reverseTrialActive,
    reverseTrialExpiresAt,
    hasFullAccess,
  ]);

  const goToSubscribe = useCallback(
    (plan: "monthly" | "annual") => {
      setOpen(false);
      trackEvent("paywall_unlock_tapped", {
        source: "expiry_modal",
        plan,
        from: lastSource ?? "unknown",
      });
      router.push(`/subscribe?plan=${plan}` as any);
    },
    [router, lastSource],
  );

  return (
    <ExpiryModal
      visible={open}
      onClose={() => setOpen(false)}
      onSelectMonthly={() => goToSubscribe("monthly")}
      onSelectAnnual={() => goToSubscribe("annual")}
    />
  );
}

export default ReverseTrialExpiryGate;
