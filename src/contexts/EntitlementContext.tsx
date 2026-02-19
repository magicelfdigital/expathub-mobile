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
  isRCInitialized,
  addCustomerInfoListener,
  getCustomerInfo,
} from "@/src/subscriptions/revenuecat";
import { getSubscriptionStatus as stripeGetStatus } from "@/src/subscriptions/stripeWeb";
import {
  SANDBOX_ENABLED,
  ENTITLEMENT_DECISION_ACCESS,
  ENTITLEMENT_FULL_ACCESS,
  ENTITLEMENT_COUNTRY_PREFIX,
  DECISION_PASS_DURATION_DAYS,
  VALID_PROMO_CODES,
} from "@/src/config/subscription";
import { trackEvent } from "@/src/lib/analytics";
import { useAuth, AUTH_API_URL } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";

type EntitlementSource = "revenuecat" | "stripe" | "sandbox" | "none";
type AccessType = "decision_pass" | "country_lifetime" | "subscription" | "sandbox" | "none";

const DECISION_PASS_KEY = "decision_pass_purchased_at";
const COUNTRY_UNLOCKS_KEY = "country_lifetime_unlocks";
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
  promoCodeActive: boolean;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  clearPromoCode: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

function getDecisionPassExpiry(purchasedAt: string): { expiresAt: Date; daysLeft: number; isActive: boolean } {
  const purchased = new Date(purchasedAt);
  const expiresAt = new Date(purchased.getTime() + DECISION_PASS_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  return { expiresAt, daysLeft, isActive: now < expiresAt };
}

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [hasProAccess, setHasProAccess] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [accessType, setAccessType] = useState<AccessType>("none");
  const [source, setSource] = useState<EntitlementSource>("none");
  const [loading, setLoading] = useState(true);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [decisionPassExpiresAt, setDecisionPassExpiresAt] = useState<string | null>(null);
  const [decisionPassDaysLeft, setDecisionPassDaysLeft] = useState<number | null>(null);
  const [unlockedCountries, setUnlockedCountries] = useState<string[]>([]);
  const [sandboxOverride, setSandboxOverrideState] = useState(false);
  const [rcConfigured, setRcConfigured] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [promoCodeActive, setPromoCodeActive] = useState(false);

  const setSandboxOverride = useCallback((value: boolean) => {
    if (!SANDBOX_ENABLED) return;
    setSandboxOverrideState(value);
  }, []);

  const redeemPromoCode = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
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

  const recordDecisionPassPurchase = useCallback(async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(DECISION_PASS_KEY, now);
    const { expiresAt, daysLeft } = getDecisionPassExpiry(now);
    setDecisionPassExpiresAt(expiresAt.toISOString());
    setDecisionPassDaysLeft(daysLeft);
    setHasProAccess(true);
    setHasFullAccess(true);
    setAccessType("decision_pass");
    setSource("revenuecat");
  }, []);

  const recordCountryUnlock = useCallback(async (slug: string) => {
    const existing = await AsyncStorage.getItem(COUNTRY_UNLOCKS_KEY);
    const countries: string[] = existing ? JSON.parse(existing) : [];
    if (!countries.includes(slug)) {
      countries.push(slug);
      await AsyncStorage.setItem(COUNTRY_UNLOCKS_KEY, JSON.stringify(countries));
    }
    setUnlockedCountries(countries);
    setHasProAccess(true);
  }, []);

  const checkAuthApiSubscription = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      let base = AUTH_API_URL;
      if (Platform.OS === "web") {
        try { base = getApiUrl().replace(/\/$/, ""); } catch { /* use default */ }
      }
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "follow",
      });
      if (!res.ok) return false;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return false;
      const data = await res.json();
      return Boolean(data?.hasProAccess || data?.subscription?.active || data?.user?.hasProAccess);
    } catch {
      return false;
    }
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPurchasesError(null);

    try {
      if (SANDBOX_ENABLED && sandboxOverride) {
        gateLog("ACCESS GRANTED: sandbox mode enabled");
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
        const storedPromo = await AsyncStorage.getItem(PROMO_CODE_KEY);
        if (storedPromo && VALID_PROMO_CODES.includes(storedPromo)) {
          gateLog(`ACCESS GRANTED: promo code active (${storedPromo})`);
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
      } catch {}

      let localPassActive = false;
      let localCountries: string[] = [];

      try {
        const passDate = await AsyncStorage.getItem(DECISION_PASS_KEY);
        if (passDate) {
          const { expiresAt, daysLeft, isActive } = getDecisionPassExpiry(passDate);
          if (isActive) {
            setDecisionPassExpiresAt(expiresAt.toISOString());
            setDecisionPassDaysLeft(daysLeft);
            localPassActive = true;
          } else {
            setDecisionPassExpiresAt(null);
            setDecisionPassDaysLeft(null);
          }
        }
      } catch {}

      try {
        const raw = await AsyncStorage.getItem(COUNTRY_UNLOCKS_KEY);
        if (raw) {
          localCountries = JSON.parse(raw);
          setUnlockedCountries(localCountries);
        }
      } catch {}

      let hasSub = false;
      let entSource: EntitlementSource = "none";

      if (Platform.OS === "web") {
        const result = await stripeGetStatus();
        hasSub = Boolean(result?.hasProAccess);
        entSource = hasSub ? "stripe" : "none";
        if (hasSub) {
          gateLog("ACCESS GRANTED: Stripe subscription active");
        }
      } else {
        if (!isRCInitialized()) {
          if (__DEV__) {
            gateLog("DEV MODE: RevenueCat not initialized — skipping RC checks, using local state only");
          } else {
            gateLog("ACCESS DENIED: RevenueCat not initialized — fail closed");
            setPurchasesError("Purchase system not configured. Please restart the app.");
            setHasProAccess(false);
            setHasFullAccess(false);
            setAccessType("none");
            setSource("none");
            setLoading(false);
            return;
          }
        }

        if (isRCInitialized()) {
        const result = await getCustomerInfo();

        if (result.error) {
          if (__DEV__) {
            gateLog(`DEV MODE: CustomerInfo error (${result.error}) — continuing with local state`);
          } else {
            gateLog(`ACCESS DENIED: CustomerInfo error — ${result.error}`);
            setPurchasesError(result.error);
            setHasProAccess(false);
            setHasFullAccess(false);
            setAccessType("none");
            setSource("none");
            setLoading(false);
            return;
          }
        }

        hasSub = Boolean(result.hasProAccess);
        entSource = hasSub ? "revenuecat" : "none";
        setManagementURL(result.managementURL ?? null);
        setExpirationDate(result.expirationDate ?? null);

        if (result.entitlements) {
          if (result.entitlements[ENTITLEMENT_DECISION_ACCESS]) {
            gateLog(`ACCESS GRANTED: entitlement active: ${ENTITLEMENT_DECISION_ACCESS}`);
            setHasProAccess(true);
            setHasFullAccess(true);
            setAccessType("decision_pass");
            setSource("revenuecat");
            trackEvent?.("entitlement_refresh", { source: "decision_pass", hasProAccess: true });
            setLoading(false);
            return;
          }

          if (result.entitlements[ENTITLEMENT_FULL_ACCESS]) {
            gateLog(`ACCESS GRANTED: entitlement active: ${ENTITLEMENT_FULL_ACCESS}`);
          }

          const countryUnlocks: string[] = [];
          for (const key of Object.keys(result.entitlements)) {
            if (key.startsWith(ENTITLEMENT_COUNTRY_PREFIX)) {
              countryUnlocks.push(key.replace(ENTITLEMENT_COUNTRY_PREFIX, "").replace(/_/g, "-"));
            }
          }
          if (countryUnlocks.length > 0) {
            gateLog(`Country entitlements active: ${countryUnlocks.join(", ")}`);
            setUnlockedCountries((prev) => {
              const merged = new Set([...prev, ...countryUnlocks]);
              return Array.from(merged);
            });
          }
        }

        if (!hasSub && localPassActive) {
          if (__DEV__) {
            gateLog("DEV MODE: Honoring local Decision Pass without RC confirmation");
          } else {
            gateLog("Local Decision Pass found but NO RC entitlement — verifying via RC takes priority, denying local-only claim");
            localPassActive = false;
            setDecisionPassExpiresAt(null);
            setDecisionPassDaysLeft(null);
          }
        }

        if (!hasSub && localCountries.length > 0) {
          if (__DEV__) {
            gateLog("DEV MODE: Honoring local country unlocks without RC confirmation");
          } else {
            const rcCountryKeys = Object.keys(result.entitlements ?? {}).filter((k) => k.startsWith(ENTITLEMENT_COUNTRY_PREFIX));
            if (rcCountryKeys.length === 0) {
              gateLog("Local country unlocks found but NO RC country entitlements — denying local-only claim");
              localCountries = [];
              setUnlockedCountries([]);
            }
          }
        }
        } // close if (isRCInitialized())
      }

      if (!hasSub && token) {
        const apiPro = await checkAuthApiSubscription();
        if (apiPro) {
          hasSub = true;
          entSource = "stripe";
          gateLog("ACCESS GRANTED: auth API subscription active");
        }
      }

      if (hasSub) {
        setHasProAccess(true);
        setHasFullAccess(true);
        setAccessType("subscription");
        setSource(entSource);
        gateLog(`Final: ACCESS GRANTED via ${entSource}`);
      } else if (localPassActive) {
        setHasProAccess(true);
        setHasFullAccess(true);
        setAccessType("decision_pass");
        setSource("revenuecat");
        gateLog("Final: ACCESS GRANTED via local Decision Pass");
      } else if (unlockedCountries.length > 0 || localCountries.length > 0) {
        setHasProAccess(true);
        setHasFullAccess(false);
        setAccessType("country_lifetime");
        setSource("revenuecat");
        gateLog("Final: COUNTRY ACCESS via RC entitlements");
      } else {
        setHasProAccess(false);
        setHasFullAccess(false);
        setAccessType("none");
        setSource("none");
        gateLog("Final: NO ACCESS — showing paywall");
      }

      const finalEntitlementKeys = [
        ...(hasSub ? ["full_access"] : []),
        ...(localPassActive ? ["decision_pass_local"] : []),
        ...localCountries.map((c: string) => `country_${c}`),
      ];
      gateLog(`Active entitlement keys after refresh: ${finalEntitlementKeys.length > 0 ? finalEntitlementKeys.join(", ") : "none"}`);
      trackEvent?.("entitlement_refresh", { source: entSource, hasProAccess: hasSub, accessType: hasSub ? "subscription" : "none" });
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
  }, [sandboxOverride, token, checkAuthApiSubscription, unlockedCountries.length]);

  useEffect(() => {
    let mounted = true;
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        if (Platform.OS !== "web") {
          const rcReady = await initPurchases();
          if (mounted) {
            setRcConfigured(rcReady);
          }

          if (rcReady) {
            removeListener = addCustomerInfoListener((info) => {
              if (!mounted) return;
              if (info.hasProAccess) {
                setHasProAccess(true);
                setHasFullAccess(true);
                setAccessType("subscription");
                setSource("revenuecat");
                gateLog("Listener: ACCESS GRANTED via RC update");
              }
              setManagementURL(info.managementURL);
              trackEvent?.("entitlement_refresh", {
                source: info.hasProAccess ? "revenuecat" : "none",
                hasProAccess: info.hasProAccess,
                trigger: "listener",
              });
            });
          } else {
            gateLog("RC init FAILED — will fail closed on native");
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

    return () => {
      mounted = false;
      removeListener?.();
    };
  }, [refresh]);

  const hasCountryAccess = useCallback((slug: string): boolean => {
    if (SANDBOX_ENABLED && sandboxOverride) return true;
    if (promoCodeActive) return true;
    if (hasFullAccess) return true;
    const normalizedSlug = slug.replace(/_/g, "-");
    return unlockedCountries.some((c) => c.replace(/_/g, "-") === normalizedSlug);
  }, [sandboxOverride, promoCodeActive, hasFullAccess, unlockedCountries]);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      hasProAccess: (SANDBOX_ENABLED && sandboxOverride) || promoCodeActive ? true : hasProAccess,
      hasFullAccess: (SANDBOX_ENABLED && sandboxOverride) || promoCodeActive ? true : hasFullAccess,
      accessType: (SANDBOX_ENABLED && sandboxOverride) || promoCodeActive ? "sandbox" : accessType,
      source: (SANDBOX_ENABLED && sandboxOverride) || promoCodeActive ? "sandbox" : source,
      loading,
      sandboxMode: SANDBOX_ENABLED,
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
      promoCodeActive,
      redeemPromoCode,
      clearPromoCode,
    }),
    [hasProAccess, hasFullAccess, accessType, source, loading, sandboxOverride, promoCodeActive, managementURL, expirationDate, decisionPassExpiresAt, decisionPassDaysLeft, unlockedCountries, rcConfigured, purchasesError, hasCountryAccess, setSandboxOverride, refresh, recordDecisionPassPurchase, recordCountryUnlock, redeemPromoCode, clearPromoCode]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}
