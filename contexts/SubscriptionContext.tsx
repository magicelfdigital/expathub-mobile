import React, { createContext, useContext, useMemo } from "react";
import { EntitlementProvider, useEntitlement } from "@/src/contexts/EntitlementContext";

type SubscriptionContextValue = {
  hasActiveSubscription: boolean;
  hasFullAccess: boolean;
  accessType: "subscription" | "sandbox" | "none" | "reverse_trial";
  setHasActiveSubscription: (value: boolean) => void;
  source: "revenuecat" | "stripe" | "sandbox" | "none" | "reverse_trial";
  loading: boolean;
  sandboxMode: boolean;
  managementURL: string | null;
  expirationDate: string | null;
  rcConfigured: boolean;
  purchasesError: string | null;
  setSandboxOverride: (value: boolean) => void;
  refresh: () => Promise<void>;
  promoCodeActive: boolean;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  clearPromoCode: () => Promise<void>;
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
    rcConfigured,
    purchasesError,
    setSandboxOverride,
    refresh,
    promoCodeActive,
    redeemPromoCode,
    clearPromoCode,
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
      rcConfigured,
      purchasesError,
      setSandboxOverride,
      refresh,
      promoCodeActive,
      redeemPromoCode,
      clearPromoCode,
    }),
    [hasProAccess, hasFullAccess, accessType, source, loading, sandboxMode, managementURL, expirationDate, rcConfigured, purchasesError, setSandboxOverride, refresh, promoCodeActive, redeemPromoCode, clearPromoCode]
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
