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
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";
import { getBackendClientInstance } from "@/src/billing";
import type { BackendEntitlements } from "@/src/billing";
import { hasEntitlement } from "@/src/billing";
import { shouldRefresh as cooldownAllows, recordRefresh } from "@/src/billing/refreshCooldown";
import { deriveEntitlement } from "@/src/contexts/entitlementDerivation";

type EntitlementSource = "revenuecat" | "stripe" | "sandbox" | "none" | "reverse_trial";
type AccessType = "subscription" | "sandbox" | "none" | "reverse_trial";

const PROMO_CODE_KEY = "promo_code_redeemed";
const REVERSE_TRIAL_STARTED_KEY = "reverseTrial_startedAt";
const REVERSE_TRIAL_USED_KEY = "reverseTrial_used";
const REVERSE_TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;

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
  setSandboxOverride: (value: boolean) => void;
  refresh: () => Promise<void>;
  promoCodeActive: boolean;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  clearPromoCode: () => Promise<void>;
  backendEntitlements: BackendEntitlements | null;
  reverseTrialActive: boolean;
  reverseTrialUsed: boolean;
  reverseTrialExpiresAt: number | null;
  startReverseTrial: () => Promise<{ ok: boolean; expiresAt: number }>;
  resetReverseTrial: () => Promise<void>;
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
  const [reverseTrialStartedAt, setReverseTrialStartedAt] = useState<number | null>(null);
  const [reverseTrialUsed, setReverseTrialUsed] = useState(false);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [startedRaw, usedRaw] = await Promise.all([
          AsyncStorage.getItem(REVERSE_TRIAL_STARTED_KEY),
          AsyncStorage.getItem(REVERSE_TRIAL_USED_KEY),
        ]);
        if (!mounted) return;
        const started = startedRaw ? Number(startedRaw) : null;
        setReverseTrialStartedAt(Number.isFinite(started ?? NaN) ? started : null);
        setReverseTrialUsed(usedRaw === "true");
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const reverseTrialExpiresAt = reverseTrialStartedAt
    ? reverseTrialStartedAt + REVERSE_TRIAL_DURATION_MS
    : null;
  const reverseTrialActive =
    !!reverseTrialExpiresAt && reverseTrialExpiresAt > Date.now();

  // Re-render when reverse trial expires so consumers can react.
  useEffect(() => {
    if (!reverseTrialExpiresAt) return;
    const remaining = reverseTrialExpiresAt - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => {
      setNowTick((v) => v + 1);
      trackEvent?.("reverse_trial_expired", {});
    }, Math.min(remaining, 2_147_000_000));
    return () => clearTimeout(t);
  }, [reverseTrialExpiresAt]);

  // Best-effort sync of the locally-granted reverse trial to the backend
  // so server-side entitlement checks (e.g. worksheet submit) honor it.
  // Idempotent on the server; safe to call repeatedly. Silently no-ops
  // when the user isn't signed in or the request fails.
  const syncReverseTrialToServer = useCallback(async () => {
    if (!token) return;
    let base: string;
    try {
      base = getBackendBase();
    } catch {
      base = getApiUrl().replace(/\/$/, "");
    }
    try {
      await fetch(`${base}/api/reverse-trial/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Non-fatal — local state remains the source of truth for the UI,
      // and the server call will be retried on the next grant / login.
    }
  }, [token]);

  const startReverseTrial = useCallback(async () => {
    const now = Date.now();
    await AsyncStorage.setItem(REVERSE_TRIAL_STARTED_KEY, String(now));
    await AsyncStorage.setItem(REVERSE_TRIAL_USED_KEY, "true");
    setReverseTrialStartedAt(now);
    setReverseTrialUsed(true);
    gateLog(`Reverse trial granted; expires at ${new Date(now + REVERSE_TRIAL_DURATION_MS).toISOString()}`);
    trackEvent?.("reverse_trial_granted", {
      expiresAt: now + REVERSE_TRIAL_DURATION_MS,
    });
    // Fire and forget — server-side record enables worksheet submit etc.
    void syncReverseTrialToServer();
    return { ok: true, expiresAt: now + REVERSE_TRIAL_DURATION_MS };
  }, [syncReverseTrialToServer]);

  // If the trial was granted before the user signed in, register it the
  // first time we see them authenticated with an active local trial.
  useEffect(() => {
    if (!token || !user) return;
    if (!reverseTrialActive) return;
    void syncReverseTrialToServer();
  }, [token, user, reverseTrialActive, syncReverseTrialToServer]);

  const resetReverseTrial = useCallback(async () => {
    await AsyncStorage.removeItem(REVERSE_TRIAL_STARTED_KEY);
    await AsyncStorage.removeItem(REVERSE_TRIAL_USED_KEY);
    setReverseTrialStartedAt(null);
    setReverseTrialUsed(false);
  }, []);

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

  const derived = deriveEntitlement({
    isDev: !!__DEV__,
    sandboxOverrideActive: SANDBOX_ENABLED && sandboxOverride,
    promoCodeActive,
    isAuthenticated: !!token,
    hasFullAccess,
    hasProAccess,
    rawAccessType: accessType,
    rawSource: source,
    rawExpirationDate: expirationDate,
    reverseTrialActive,
    reverseTrialExpiresAt,
  });
  const effectiveHasFullAccess = derived.hasFullAccess;
  const effectiveHasProAccess = derived.hasProAccess;
  const effectiveAccessType: AccessType = derived.accessType;
  const effectiveSource: EntitlementSource = derived.source;
  const effectiveExpirationDate = derived.expirationDate;

  const value = useMemo<EntitlementContextValue>(
    () => ({
      hasProAccess: effectiveHasProAccess,
      hasFullAccess: effectiveHasFullAccess,
      accessType: effectiveAccessType,
      source: effectiveSource,
      loading,
      sandboxMode: SANDBOX_ENABLED,
      managementURL,
      expirationDate: effectiveExpirationDate,
      rcConfigured,
      purchasesError,
      setSandboxOverride,
      refresh,
      promoCodeActive,
      redeemPromoCode,
      clearPromoCode,
      backendEntitlements,
      reverseTrialActive,
      reverseTrialUsed,
      reverseTrialExpiresAt,
      startReverseTrial,
      resetReverseTrial,
    }),
    [effectiveHasProAccess, effectiveHasFullAccess, effectiveAccessType, effectiveSource, loading, managementURL, effectiveExpirationDate, rcConfigured, purchasesError, setSandboxOverride, refresh, redeemPromoCode, clearPromoCode, backendEntitlements, promoCodeActive, reverseTrialActive, reverseTrialUsed, reverseTrialExpiresAt, startReverseTrial, resetReverseTrial]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}
