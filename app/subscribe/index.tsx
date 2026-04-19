import React, { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Screen } from "@/components/Screen";
import { ProPaywall } from "@/src/components/ProPaywall";

export default function SubscribeScreen() {
  const { country, unlockLabel, redirectTo } = useLocalSearchParams<{
    country?: string;
    unlockLabel?: string;
    redirectTo?: string;
  }>();
  const { selectedCountrySlug } = useCountry();
  const { hasActiveSubscription, hasFullAccess, loading } = useSubscription();
  const router = useRouter();
  const redirectedRef = useRef(false);

  const resolvedCountry = country || selectedCountrySlug || undefined;

  useEffect(() => {
    if (!redirectTo || redirectedRef.current || loading) return;
    if (hasActiveSubscription || hasFullAccess) {
      redirectedRef.current = true;
      router.replace(redirectTo as any);
    }
  }, [redirectTo, hasActiveSubscription, hasFullAccess, loading, router]);

  return (
    <Screen>
      <ProPaywall
        showClose
        countrySlug={resolvedCountry}
        entryPoint={resolvedCountry ? "country" : "general"}
        unlockLabel={unlockLabel}
      />
    </Screen>
  );
}
