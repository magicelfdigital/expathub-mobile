import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  initPurchases,
  loginUser as rcLoginUser,
} from "@/src/subscriptions/revenuecat";
import {
  SANDBOX_ENABLED,
  VALID_PROMO_CODES,
} from "@/src/config/subscription";
import { trackEvent } from "@/src/lib/analytics";
import { useAuth, AUTH_API_URL } from "@/contexts/AuthContext";
import { getBackendClientInstance } from "@/src/billing";
import type { BackendEntitlements } from "@/src/billing";
import { hasEntitlement } from "@/src/billing";
import { shouldRefresh as cooldownAllows, recordRefresh } from "@/src/billing/refreshCooldown";

type EntitlementSource = "revenuecat" | "stripe" | "sandbox" | "none";
type AccessType = "subscription" | "sandbox" | "none";

const PROMO_CODE_KEY = "promo_code_redeemed";

function gateLog(msg: string) {
  console.log(`[GATE] ${msg}`);
}

interface EntitlementContextValue {
  hasProAccess: boolean;
  hasFullAccess: boolean;
  accessType: AccessType;
  source: EntitlementSource;
  loading: boolean;
  sandboxMode: boolean;
  managementURL: string | null;
  expirationDate: string | null;
  rcConfigured: boolean;
  purchasesError: string | null;
  hasCountryAccess: (slug: string) => boolean;
  setSandboxOverride: (value: boolean) => void;
  refresh: () => Promise<void>;
  promoCodeActive: boolean;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  clearPromoCode: () => Promise<void>;
  backendEntitlements: BackendEntitlements | null;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [hasProAccess, setHasProAccess] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [accessType, setAccessType] = useState<AccessType>("none");
  const [source, setSource] = useState<EntitlementSource>("none");
  const [loading, setLoading] = useState(true);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [sandboxOverride, setSandboxOverrideState] = useState(false);
  const [rcConfigured, setRcConfigured] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [promoCodeActive, setPromoCodeActive] = useState(false);
  const [backendEntitlements, setBackendEntitlements] = useState<BackendEntitlements | null>(null);

  const setSandboxOverride = useCallback((value: boolean) => {
    if (!SANDBOX_ENABLED) return;
    setSandboxOverrideState(value);
  }, []);

  const redeemPromoCode = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!__DEV__) {
      return { success: false, error: "Not available." };
    }
    const normalized = code.trim().toUpperCase();
    if (!VALID_PROMO_CODES.includes(normalized)) {
      gateLog(`Promo code rejected: "${normalized}"`);
      return { success: false, error: "Invalid code. Please check and try again." };
    }
    await AsyncStorage.setItem(PROMO_CODE_KEY, normalized);
    setPromoCodeActive(true);
    setHasProAccess(true);
    setHasFullAccess(true);
    setAccessType("sandbox");
    setSource("sandbox");
    gateLog(`Promo code redeemed: ${normalized}`);
    trackEvent?.("promo_code_redeemed", { code: normalized });
    return { success: true };
  }, []);

  const clearPromoCode = useCallback(async () => {
    await AsyncStorage.removeItem(PROMO_CODE_KEY);
    setPromoCodeActive(false);
    gateLog("Promo code cleared");
    trackEvent?.("promo_code_cleared", {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPurchasesError(null);

    try {
      if (__DEV__ && SANDBOX_ENABLED && sandboxOverride) {
        gateLog("ACCESS GRANTED: sandbox mode enabled [DEV ONLY]");
        setHasProAccess(true);
        setHasFullAccess(true);
        setAccessType("sandbox");
        setSource("sandbox");
        setManagementURL(null);
        setExpirationDate(null);
        trackEvent?.("entitlement_refresh", { source: "sandbox", hasProAccess: true });
        return;
      }

      try {
        if (__DEV__) {
          const storedPromo = await AsyncStorage.getItem(PROMO_CODE_KEY);
          if (storedPromo && VALID_PROMO_CODES.includes(storedPromo)) {
            gateLog(`ACCESS GRANTED: promo code active (${storedPromo}) [DEV ONLY]`);
            setPromoCodeActive(true);
            setHasProAccess(true);
            setHasFullAccess(true);
            setAccessType("sandbox");
            setSource("sandbox");
            setManagementURL(null);
            setExpirationDate(null);
            trackEvent?.("entitlement_refresh", { source: "promo_code", hasProAccess: true });
            return;
          } else if (storedPromo) {
            gateLog(`Stored promo code no longer valid: ${storedPromo}`);
            await AsyncStorage.removeItem(PROMO_CODE_KEY);
            setPromoCodeActive(false);
          }
        } else {
          const storedPromo = await AsyncStorage.getItem(PROMO_CODE_KEY);
          if (storedPromo) {
            gateLog("Clearing promo code in production build");
            await AsyncStorage.removeItem(PROMO_CODE_KEY);
            setPromoCodeActive(false);
          }
        }
      } catch {}

      if (!token) {
        gateLog("No auth token — no backend entitlement check possible, showing paywall");
        setHasProAccess(false);
        setHasFullAccess(false);
        setAccessType("none");
        setSource("none");
        setBackendEntitlements(null);
        setLoading(false);
        return;
      }

      const backendClient = getBackendClientInstance(() => token);
      const userId = user?.id?.toString() ?? "";

      if (userId && cooldownAllows(userId)) {
        gateLog(`Login sync: refreshing backend billing for user=${userId}`);
        try {
          await backendClient.refreshMobileBilling({
            userId,
            source: "revenuecat",
          });
          recordRefresh(userId);
          gateLog("Login sync: backend refresh complete");
        } catch (e: any) {
          gateLog(`Login sync: backend refresh failed (non-fatal): ${e?.message}`);
          recordRefresh(userId);
        }
      } else if (userId) {
        gateLog(`Login sync: skipping refresh for user=${userId} (cooldown active)`);
      }

      gateLog("Fetching entitlements from backend (single source of truth)");
      const ent = await backendClient.getEntitlements(userId);
      setBackendEntitlements(ent);

      if (hasEntitlement(ent)) {
        const entSource: EntitlementSource = (ent.accessSource as EntitlementSource) ?? "none";
        if (ent.subscription?.currentPeriodEnd) {
          setExpirationDate(ent.subscription.currentPeriodEnd);
        } else {
          setExpirationDate(null);
        }

        setHasProAccess(true);
        setHasFullAccess(true);
        setAccessType("subscription");
        setSource(entSource);
        setManagementURL(null);
        gateLog(`ACCESS GRANTED via backend: source=${entSource}, type=subscription`);
        trackEvent?.("entitlement_refresh", { source: entSource, hasProAccess: true, accessType: "subscription" });
      } else {
        setHasProAccess(false);
        setHasFullAccess(false);
        setAccessType("none");
        setSource("none");
        setManagementURL(null);
        setExpirationDate(null);
        gateLog("NO ACCESS from backend — showing paywall");
        trackEvent?.("entitlement_refresh", { source: "none", hasProAccess: false });
      }
    } catch (e: any) {
      gateLog(`Refresh ERROR: ${e?.message ?? e} — fail closed, no access`);
      setPurchasesError(e?.message ?? "Unknown error checking purchases");
      setHasProAccess(false);
      setHasFullAccess(false);
      setAccessType("none");
      setSource("none");
      trackEvent?.("entitlement_refresh_error", { source: "none" });
    } finally {
      setLoading(false);
    }
  }, [sandboxOverride, token, user?.id]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (Platform.OS !== "web") {
          const rcReady = await initPurchases();
          if (mounted) setRcConfigured(rcReady);

          if (!rcReady) {
            gateLog("RC init FAILED — RC is for purchase UX only, backend remains authority");
          }
        }
        if (mounted) {
          await refresh();
        }
      } catch (e: any) {
        gateLog(`Init ERROR: ${e?.message ?? e} — fail closed`);
        if (mounted) {
          setHasProAccess(false);
          setHasFullAccess(false);
          setAccessType("none");
          setSource("none");
          setLoading(false);
          setPurchasesError(e?.message ?? "Initialization error");
        }
      }
    })();

    return () => { mounted = false; };
  }, [refresh]);

  const hasCountryAccess = useCallback((_slug: string): boolean => {
    if (__DEV__ && SANDBOX_ENABLED && sandboxOverride) return true;
    if (__DEV__ && promoCodeActive) return true;
    return hasFullAccess;
  }, [sandboxOverride, promoCodeActive, hasFullAccess]);

  const devBypass = __DEV__ && ((SANDBOX_ENABLED && sandboxOverride) || promoCodeActive);
  const value = useMemo<EntitlementContextValue>(
    () => ({
      hasProAccess: devBypass ? true : hasProAccess,
      hasFullAccess: devBypass ? true : hasFullAccess,
      accessType: devBypass ? "sandbox" : accessType,
      source: devBypass ? "sandbox" : source,
      loading,
      sandboxMode: SANDBOX_ENABLED,
      managementURL,
      expirationDate,
      rcConfigured,
      purchasesError,
      hasCountryAccess,
      setSandboxOverride,
      refresh,
      promoCodeActive,
      redeemPromoCode,
      clearPromoCode,
      backendEntitlements,
    }),
    [hasProAccess, hasFullAccess, accessType, source, loading, devBypass, managementURL, expirationDate, rcConfigured, purchasesError, hasCountryAccess, setSandboxOverride, refresh, redeemPromoCode, clearPromoCode, backendEntitlements, promoCodeActive]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}
