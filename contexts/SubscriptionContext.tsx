import React, { createContext, useContext, useMemo } from "react";
import { EntitlementProvider, useEntitlement } from "@/src/contexts/EntitlementContext";

type SubscriptionContextValue = {
  hasActiveSubscription: boolean;
  hasFullAccess: boolean;
  accessType: "decision_pass" | "country_lifetime" | "subscription" | "sandbox" | "none";
  setHasActiveSubscription: (value: boolean) => void;
  source: "revenuecat" | "stripe" | "sandbox" | "none";
  loading: boolean;
  sandboxMode: boolean;
  managementURL: string | null;
  expirationDate: string | null;
  decisionPassExpiresAt: string | null;
  decisionPassDaysLeft: number | null;
  unlockedCountries: string[];
  rcConfigured: boolean;
  purchasesError: string | null;
  hasCountryAccess: (slug: string) => boolean;
  setSandboxOverride: (value: boolean) => void;
  refresh: () => Promise<void>;
  recordDecisionPassPurchase: () => Promise<void>;
  recordCountryUnlock: (slug: string) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

function SubscriptionBridge({ children }: { children: React.ReactNode }) {
  const {
    hasProAccess,
    hasFullAccess,
    accessType,
    source,
    loading,
    sandboxMode,
    managementURL,
    expirationDate,
    decisionPassExpiresAt,
    decisionPassDaysLeft,
    unlockedCountries,
    rcConfigured,
    purchasesError,
    hasCountryAccess,
    setSandboxOverride,
    refresh,
    recordDecisionPassPurchase,
    recordCountryUnlock,
  } = useEntitlement();

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      hasActiveSubscription: hasProAccess,
      hasFullAccess,
      accessType,

      setHasActiveSubscription: (next: boolean) => {
        if (sandboxMode) {
          setSandboxOverride(next);
          return;
        }
        void refresh();
      },

      source,
      loading,
      sandboxMode,
      managementURL,
      expirationDate,
      decisionPassExpiresAt,
      decisionPassDaysLeft,
      unlockedCountries,
      rcConfigured,
      purchasesError,
      hasCountryAccess,
      setSandboxOverride,
      refresh,
      recordDecisionPassPurchase,
      recordCountryUnlock,
    }),
    [hasProAccess, hasFullAccess, accessType, source, loading, sandboxMode, managementURL, expirationDate, decisionPassExpiresAt, decisionPassDaysLeft, unlockedCountries, rcConfigured, purchasesError, hasCountryAccess, setSandboxOverride, refresh, recordDecisionPassPurchase, recordCountryUnlock]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  return (
    <EntitlementProvider>
      <SubscriptionBridge>{children}</SubscriptionBridge>
    </EntitlementProvider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
