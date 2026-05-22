import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { CancellationModal } from "@/src/components/CancellationModal";
import { getBackendBase } from "@/src/billing/backendClient";
import { getApiUrl } from "@/lib/query-client";
import { tokens } from "@/theme/tokens";
import { testCrash, isNativeBuild } from "@/utils/crashlytics";
import { trackEvent } from "@/src/lib/analytics";
import { FREE_TIER_DISPLAY_NAME, PAID_TIER_DISPLAY_NAME } from "@/constants/tiers";
import { getOrchestrator, clearRefreshCooldown } from "@/src/billing";
import { EntitlementPollingTimeoutError } from "@/src/billing/errors";
import { DEFAULT_POLLING_CONFIG } from "@/src/billing/types";
import { getReadinessLabel, MAX_SCORE } from "@/src/data/quiz";
import { getReadinessBadgeColor, getReadinessFillPercent } from "@/src/data/readinessUi";
import { usePlan } from "@/src/contexts/PlanContext";
import { useProgressPercent } from "@/src/hooks/useProgress";
import { getCountries, getCountry, getPathways, isLaunchCountry, sortCountriesAlpha } from "@/src/data";

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const {
    hasActiveSubscription,
    hasFullAccess,
    accessType,
    source,
    expirationDate,
    sandboxMode,
    setSandboxOverride,
    refresh,
    reverseTrialActive,
    reverseTrialExpiresAt,
  } = useSubscription();

  const { quizResult, clearForRetake } = useOnboarding();
  const { activeCountrySlug, startPlan, requestResetPlan } = usePlan();
  const { percent: planPercent } = useProgressPercent(activeCountrySlug);
  const planCountry = activeCountrySlug ? getCountry(activeCountrySlug) ?? null : null;
  const planCountryName =
    planCountry?.name ??
    (activeCountrySlug
      ? activeCountrySlug.charAt(0).toUpperCase() + activeCountrySlug.slice(1).replace(/-/g, " ")
      : null);

  const [showPlanSwitcher, setShowPlanSwitcher] = useState(false);

  const switchableCountries = useMemo(
    () =>
      getCountries()
        .filter((c) => isLaunchCountry(c.slug) && c.slug !== activeCountrySlug)
        .sort(sortCountriesAlpha),
    [activeCountrySlug],
  );

  const goActivePlan = useCallback(() => {
    if (!activeCountrySlug) return;
    router.push({
      pathname: "/(tabs)/(home)/country/[slug]/planner",
      params: { slug: activeCountrySlug },
    });
  }, [activeCountrySlug, router]);

  const handlePickSwitchCountry = useCallback(
    (slug: string, name: string) => {
      const pathways = getPathways(slug);
      const firstPathway = pathways[0];
      if (!firstPathway) return;
      setShowPlanSwitcher(false);
      // Defer so the Modal finishes dismissing before the native confirmation
      // alert in PlanContext.startPlan opens (avoids overlapping presentations
      // on iOS).
      setTimeout(() => {
        startPlan(slug, firstPathway.key, name);
      }, 0);
    },
    [startPlan],
  );

  const handleResetPlan = useCallback(() => {
    setShowPlanSwitcher(false);
    // PlanContext.requestResetPlan renders the branded ResetPlanDialog on
    // web and falls back to Alert.alert on native. Closing the switcher
    // sheet first avoids overlapping presentations on iOS.
    if (Platform.OS === "web") {
      requestResetPlan();
    } else {
      setTimeout(() => requestResetPlan(), 0);
    }
  }, [requestResetPlan]);

  const [deleting, setDeleting] = useState(false);
  const [deletedSuccess, setDeletedSuccess] = useState(false);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreHint, setRestoreHint] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [exitOfferEligible, setExitOfferEligible] = useState(false);
  const [exitSubscriptionId, setExitSubscriptionId] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;
  const WEB_TOP = Platform.OS === "web" ? 67 : 0;
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = useCallback(() => {
    if (!__DEV__) return;
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      router.push("/debug-billing" as any);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const handleRestore = async () => {
    if (!user) {
      setStatusMsg("Please sign in first to restore purchases.");
      return;
    }
    setRestoring(true);
    setStatusMsg(null);
    setRestoreHint("Confirming with the App Store…");
    const timeoutSeconds = Math.round(DEFAULT_POLLING_CONFIG.timeoutMs / 1000);
    const hintTimer = setTimeout(() => {
      setRestoreHint(`Still confirming — this can take up to ${timeoutSeconds} seconds.`);
    }, 5000);
    try {
      clearRefreshCooldown(user.id.toString());
      const orchestrator = getOrchestrator(() => token);
      const result = await orchestrator.restore(user.id.toString());
      await refresh();
      if (result.status === "confirmed") {
        setStatusMsg("Purchases restored successfully.");
      } else {
        setStatusMsg("No active purchases found for your account.");
      }
    } catch (err) {
      // Refresh anyway — even on a polling timeout the backend may have
      // partially updated, and we want the UI to reflect whatever it has.
      await refresh().catch(() => {});
      if (err instanceof EntitlementPollingTimeoutError) {
        setStatusMsg(
          "Your purchase is still being processed. This can take a minute — please try again shortly.",
        );
      } else {
        setStatusMsg("Restore failed. Please try again later.");
      }
    } finally {
      clearTimeout(hintTimer);
      setRestoreHint(null);
      setRestoring(false);
    }
  };

  const apiBase = Platform.OS === "web"
    ? getApiUrl().replace(/\/$/, "")
    : getBackendBase();

  async function resolveSubscriptionIdForExitOffer(): Promise<string | null> {
    // The exit-offer endpoint only accepts Stripe subscription IDs. On every
    // platform we resolve it from the authenticated backend user — never
    // from RevenueCat's productIdentifier, which is an SKU, not a sub id.
    try {
      const meRes = await fetch(`${apiBase}/api/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });
      if (!meRes.ok) return null;
      const me: { user?: { stripeSubscriptionId?: string } } | null = await meRes
        .json()
        .catch(() => null);
      const subId = me?.user?.stripeSubscriptionId;
      return typeof subId === "string" && subId.length > 0 ? subId : null;
    } catch {
      return null;
    }
  }

  // The Stripe customer id is derived server-side from the auth token
  // (see /api/stripe/portal in server/routes.ts). The client never sends
  // a customerId — that would be an IDOR vector.
  async function openStripePortal(): Promise<boolean> {
    try {
      const res = await fetch(`${apiBase}/api/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      const url = data?.url;
      if (!url) return false;
      await Linking.openURL(url);
      return true;
    } catch (e: any) {
      console.log(`[STRIPE_PORTAL] open failed: ${e?.message ?? e}`);
      return false;
    }
  }

  async function fetchExitOfferEligibility(subscriptionId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${apiBase}/api/subscription/exit-offer/eligibility?subscriptionId=${encodeURIComponent(subscriptionId)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        },
      );
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return !!data?.eligible;
    } catch {
      return false;
    }
  }

  async function postExitOfferAction(
    subscriptionId: string,
    action: "accept" | "decline" | "shown",
  ) {
    try {
      await fetch(`${apiBase}/api/subscription/exit-offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ subscriptionId, action }),
      });
    } catch (e: any) {
      console.log(`[EXIT_OFFER] ${action} error: ${e?.message ?? e}`);
    }
  }

  const handleManageSubscription = async () => {
    if (!hasPaidAccess) {
      openSubscriptionManagement();
      return;
    }
    const subId = await resolveSubscriptionIdForExitOffer();
    setExitSubscriptionId(subId);
    if (subId) {
      const eligible = source === "stripe"
        ? await fetchExitOfferEligibility(subId)
        : false;
      setExitOfferEligible(eligible);
      if (eligible) {
        await postExitOfferAction(subId, "shown");
      }
    } else {
      setExitOfferEligible(false);
    }
    setShowCancelModal(true);
  };

  // Routes the user to the right "manage subscription" surface for their
  // billing source. Stripe subscriptions deep-link into the hosted billing
  // portal (server derives the customer id from the auth token) — RC
  // subs (iOS / Android) go to the relevant store.
  const openSubscriptionManagement = async () => {
    setShowCancelModal(false);
    if (source === "stripe") {
      const opened = await openStripePortal();
      if (opened) return;
      // Fall through to the generic alert if the portal couldn't open.
      Alert.alert(
        "Manage Subscription",
        "We couldn't open the billing portal. Please try again from the web account page.",
      );
      return;
    }
    if (Platform.OS === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      Alert.alert(
        "Manage Subscription",
        "Visit your app store account settings to manage your subscription."
      );
    }
  };

  const handleContactSupport = () => {
    const subject = encodeURIComponent("ExpatHub Support Request");
    const body = encodeURIComponent(
      `\n\n---\nEmail: ${user?.email ?? "unknown"}\nPlatform: ${Platform.OS}`
    );
    Linking.openURL(
      `mailto:support@magicelfdigital.com?subject=${subject}&body=${body}`
    );
  };

  const handleDeleteAccount = async () => {
    if (Platform.OS === "web") {
      // Use the branded in-app confirmation (mirrors SwitchPlanDialog /
      // ResetPlanDialog) instead of the native browser `window.confirm`.
      setShowDeletePrompt(true);
      return;
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Delete Account",
        "This will permanently delete your account and associated data. This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Confirm Delete", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });

    if (!confirmed) return;

    await performDeleteAccount();
  };

  const performDeleteAccount = async () => {
    await AsyncStorage.removeItem("pending_purchase");
    setDeleting(true);
    try {
      const base = Platform.OS === "web"
        ? getApiUrl().replace(/\/$/, "")
        : getBackendBase();
      console.log(`[DELETE_ACCOUNT] DELETE ${base}/api/account`);
      const res = await fetch(`${base}/api/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = await res.text();
      console.log(`[DELETE_ACCOUNT] status=${res.status} body=${body}`);
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status}): ${body}`);
      }
      await logout();
      // Belt-and-suspenders: logout() already wipes local data via
      // clearLocalDataIfSignedOut, but that helper is gated on the auth
      // token being absent. If anything left a stale token behind, the
      // wipe would silently no-op and the next session would see leftover
      // quiz results / "saved on device" banner. After an account deletion
      // the user wants nothing saved anywhere, so force the wipe
      // unconditionally.
      try {
        const { forceClearLocalData } = await import("@/src/lib/clearDeviceData");
        await forceClearLocalData();
      } catch (clearErr) {
        console.log(`[DELETE_ACCOUNT] local data clear failed: ${clearErr}`);
      }
      trackEvent("account_deleted", { platform: Platform.OS });
      setDeletedSuccess(true);
      setTimeout(() => {
        router.replace("/");
      }, 2500);
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      console.log(`[DELETE_ACCOUNT] error: ${msg}`);
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  const accessLabel = (() => {
    switch (accessType) {
      case "subscription":
        return PAID_TIER_DISPLAY_NAME;
      case "sandbox":
        return "Sandbox";
      case "reverse_trial":
        return "Free Trial";
      default:
        return FREE_TIER_DISPLAY_NAME;
    }
  })();

  const reverseTrialEndsLabel = (() => {
    if (!reverseTrialActive || !reverseTrialExpiresAt) return null;
    const d = new Date(reverseTrialExpiresAt);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  })();

  // Reverse-trial users are entitled to read pro content but have NO underlying
  // billing subscription — they must not enter the cancel/manage flow.
  const hasPaidAccess =
    hasActiveSubscription &&
    accessType !== "sandbox" &&
    accessType !== "none" &&
    accessType !== "reverse_trial";

  if (deletedSuccess) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <Ionicons name="checkmark-circle" size={64} color={tokens.color.primary} />
        <Text style={{ fontSize: 22, fontWeight: "700", fontFamily: tokens.font.bodyBold, color: tokens.color.text, marginTop: 16, textAlign: "center" }}>
          Account Deleted
        </Text>
        <Text style={{ fontSize: 15, fontFamily: tokens.font.body, color: tokens.color.subtext, marginTop: 8, textAlign: "center" }}>
          Your account has been successfully deleted.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.container, { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 }]}
      contentContainerStyle={[s.scrollContent, isLargeScreen && s.scrollContentLarge]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/"); }} hitSlop={12}>
          <Ionicons name="close" size={28} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle}>Account</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={s.section}>
        <View style={s.avatarCircle}>
          <Ionicons name="person" size={36} color={tokens.color.primary} />
        </View>
        <Text style={s.email}>{user?.email ?? "Not signed in"}</Text>
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowLabel}>Access</Text>
          <View
            style={[
              s.badge,
              hasPaidAccess || accessType === "sandbox" || reverseTrialActive
                ? s.badgePro
                : s.badgeFree,
            ]}
          >
            <Text
              style={[
                s.badgeText,
                hasPaidAccess || accessType === "sandbox" || reverseTrialActive
                  ? s.badgeTextPro
                  : s.badgeTextFree,
              ]}
            >
              {accessLabel}
            </Text>
          </View>
        </View>

        {hasPaidAccess && expirationDate ? (
          <View style={s.row}>
            <Text style={s.rowLabel}>Renews</Text>
            <Text style={s.rowValue}>{new Date(expirationDate).toLocaleDateString()}</Text>
          </View>
        ) : null}

        {reverseTrialActive && reverseTrialEndsLabel ? (
          <View style={s.row}>
            <Text style={s.rowLabel}>Trial ends</Text>
            <Text style={s.rowValue}>{reverseTrialEndsLabel}</Text>
          </View>
        ) : null}

        {hasPaidAccess ? (
          <View style={s.row}>
            <Text style={s.rowLabel}>Source</Text>
            <Text style={s.rowValue}>
              {source === "revenuecat" ? "App Store" : source === "stripe" ? "Web" : source}
            </Text>
          </View>
        ) : null}

      </View>

      {activeCountrySlug && planCountryName ? (
        <View style={s.planCardWrap}>
          <Pressable
            onPress={goActivePlan}
            style={({ pressed }) => [s.planCard, pressed && { opacity: 0.7 }]}
            testID="account-active-plan-card"
          >
            <View style={s.planCardRow}>
              <View style={s.planCardIcon}>
                <Ionicons name="flag" size={16} color={tokens.color.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.planCardTitle}>Active plan</Text>
                <Text style={s.planCardSub}>
                  {planCountryName} – {planPercent}% complete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.color.primary} />
            </View>
            <View style={s.planCardBarTrack}>
              <View
                style={[
                  s.planCardBarFill,
                  { width: `${Math.max(0, Math.min(100, planPercent))}%` },
                ]}
              />
            </View>
          </Pressable>
          <Pressable
            onPress={() => setShowPlanSwitcher(true)}
            style={({ pressed }) => [s.planSwitchLink, pressed && { opacity: 0.6 }]}
            hitSlop={8}
            testID="account-active-plan-switch"
          >
            <Ionicons name="swap-horizontal" size={14} color={tokens.color.primary} />
            <Text style={s.planSwitchLinkText}>Switch or reset</Text>
          </Pressable>
        </View>
      ) : null}

      {quizResult ? (() => {
        const qrMax = quizResult.maxScore ?? MAX_SCORE;
        const qrReadiness = quizResult.readiness ?? getReadinessLabel(quizResult.score, qrMax);
        const badgeColor = getReadinessBadgeColor(qrReadiness.level);
        const fillPct = getReadinessFillPercent(quizResult.score, qrMax);
        return (
        <View style={s.card}>
          <Text style={[s.rowLabel, { marginBottom: 12 }]}>Relocation readiness</Text>
          <View style={{ height: 8, backgroundColor: "rgba(28,43,94,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <View style={{ height: 8, width: `${fillPct}%`, backgroundColor: tokens.color.teal, borderRadius: 4 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <View style={{ backgroundColor: badgeColor, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 12 }}>
              <Text style={{ color: "#fff", fontSize: 13, fontFamily: tokens.font.bodySemiBold, fontWeight: "600" }}>{qrReadiness.label}</Text>
            </View>
          </View>
          {quizResult.topMatch ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 20 }}>{quizResult.topMatch.flag}</Text>
              <Text style={[s.rowValue, { flex: 1 }]}>Top Match: {quizResult.topMatch.name}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={async () => {
              await clearForRetake();
              router.push("/onboarding/intro");
            }}
            style={({ pressed }) => [{ paddingVertical: 8 }, pressed && { opacity: 0.7 }]}
          >
            <Text style={{ fontSize: 15, fontFamily: tokens.font.bodySemiBold, fontWeight: "600", color: tokens.color.primary }}>Retake Quiz</Text>
          </Pressable>
        </View>
        );
      })() : null}

      {__DEV__ ? (
        <View style={s.sandboxToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.sandboxToggleTitle}>Sandbox Mode</Text>
            <Text style={s.sandboxToggleSub}>Bypass paywall for testing</Text>
          </View>
          <Switch
            value={hasActiveSubscription && accessType === "sandbox"}
            onValueChange={(val) => setSandboxOverride(val)}
            trackColor={{ false: tokens.color.textSoft, true: tokens.color.primaryBorder }}
            thumbColor={hasActiveSubscription && accessType === "sandbox" ? tokens.color.primary : tokens.color.bg}
          />
        </View>
      ) : null}

      {statusMsg ? (
        <View style={s.statusBox}>
          <Text style={s.statusText}>{statusMsg}</Text>
        </View>
      ) : null}

      <View style={s.actionsGroup}>
        <Pressable
          onPress={handleRestore}
          disabled={restoring}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={tokens.color.primary} />
          ) : (
            <Ionicons name="arrow-undo" size={18} color={tokens.color.primary} />
          )}
          <View style={{ flex: 1, marginLeft: 0 }}>
            <Text style={s.actionRowText}>Restore Purchases</Text>
            {restoring && restoreHint ? (
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 13,
                  color: tokens.color.subtext,
                  fontFamily: tokens.font.body,
                }}
              >
                {restoreHint}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={handleManageSubscription}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="settings-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Manage Subscription</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={handleContactSupport}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="mail-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Contact Support</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={() => Linking.openURL("https://www.expathub.website")}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="globe-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Visit www.expathub.website</Text>
          <Ionicons name="open-outline" size={14} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={() => router.push("/about" as any)}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="information-circle-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>About</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>
      </View>

      <Pressable style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
        <Text style={s.logoutText}>Sign Out</Text>
      </Pressable>

      <Text style={s.dangerHeader}>Danger Zone</Text>
      <Pressable
        style={s.deleteBtn}
        onPress={handleDeleteAccount}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator size="small" color="#991b1b" />
        ) : (
          <Ionicons name="trash-outline" size={20} color="#991b1b" />
        )}
        <Text style={s.deleteText}>Delete Account</Text>
      </Pressable>

      {__DEV__ ? (
        <Pressable
          style={s.debugBillingBtn}
          onPress={() => router.push("/debug-billing" as any)}
        >
          <Ionicons name="code-slash-outline" size={20} color="#1e40af" />
          <Text style={s.debugBillingText}>Billing Debug (Dev Only)</Text>
        </Pressable>
      ) : null}

      {__DEV__ ? (
        <Pressable
          style={s.crashTestBtn}
          onPress={() => {
            if (isNativeBuild()) {
              Alert.alert(
                "Test Crash",
                "This will force-crash the app to test Crashlytics. Continue?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Crash Now", style: "destructive", onPress: () => testCrash() },
                ]
              );
            } else {
              Alert.alert(
                "Not Available",
                "Crashlytics test crashes only work in native builds (EAS), not in Expo Go or web."
              );
            }
          }}
        >
          <Ionicons name="bug-outline" size={20} color={tokens.color.gold} />
          <Text style={s.crashTestText}>Test Crashlytics (Dev Only)</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={handleVersionTap} style={s.versionLabel}>
        <Text style={s.versionText}>
          ExpatHub v{Constants.expoConfig?.version ?? "1.0.0"}
          {Platform.OS === "ios" && Constants.expoConfig?.ios?.buildNumber
            ? ` (build ${Constants.expoConfig.ios.buildNumber})`
            : Platform.OS === "android" && Constants.expoConfig?.android?.versionCode
              ? ` (build ${Constants.expoConfig.android.versionCode})`
              : ""}
        </Text>
      </Pressable>

      <CancellationModal
        visible={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setExitOfferEligible(false);
        }}
        onProceed={openSubscriptionManagement}
        exitOffer={
          exitOfferEligible && exitSubscriptionId
            ? {
                eligible: true,
                subscriptionId: exitSubscriptionId,
                onAccept: async () => {
                  // Backend applies the 50%-off-3mo coupon to the subscription
                  // and records the action. Then we deep-link the user into
                  // the Stripe billing portal so they can review/manage the
                  // discounted subscription right away.
                  await postExitOfferAction(exitSubscriptionId, "accept");
                  await refresh();
                  setStatusMsg("50% off applied to your next 3 billing periods.");
                  await openStripePortal();
                },
                onDecline: async () => {
                  // Decline → record only. CancellationModal advances to its
                  // existing "before_you_go" confirmation step, where the
                  // user taps Continue to Cancel → onProceed →
                  // openSubscriptionManagement() → Stripe portal (or App
                  // Store / Play, depending on `source`).
                  await postExitOfferAction(exitSubscriptionId, "decline");
                },
              }
            : undefined
        }
      />

      <Modal
        visible={showPlanSwitcher}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlanSwitcher(false)}
      >
        <Pressable
          style={s.switchOverlay}
          onPress={() => setShowPlanSwitcher(false)}
        >
          <Pressable
            style={s.switchSheet}
            onPress={(e) => e.stopPropagation()}
            testID="account-plan-switch-sheet"
          >
            <View style={s.switchHeader}>
              <Text style={s.switchTitle}>Switch or reset plan</Text>
              <Pressable
                onPress={() => setShowPlanSwitcher(false)}
                hitSlop={12}
                testID="account-plan-switch-close"
              >
                <Ionicons name="close" size={22} color={tokens.color.text} />
              </Pressable>
            </View>

            {planCountryName ? (
              <Text style={s.switchSub}>
                Active: {planCountryName}
              </Text>
            ) : null}

            {switchableCountries.length > 0 ? (
              <>
                <Text style={s.switchSectionLabel}>Switch focus to</Text>
                <ScrollView
                  style={s.switchList}
                  contentContainerStyle={{ gap: 6 }}
                  showsVerticalScrollIndicator={false}
                >
                  {switchableCountries.map((c) => (
                    <Pressable
                      key={c.slug}
                      onPress={() => handlePickSwitchCountry(c.slug, c.name)}
                      style={({ pressed }) => [s.switchCountryRow, pressed && { opacity: 0.7 }]}
                      testID={`account-plan-switch-country-${c.slug}`}
                    >
                      <Ionicons name="flag-outline" size={16} color={tokens.color.primary} />
                      <Text style={s.switchCountryText}>{c.name}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={tokens.color.subtext}
                        style={{ marginLeft: "auto" as any }}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Pressable
              onPress={handleResetPlan}
              style={({ pressed }) => [s.switchResetBtn, pressed && { opacity: 0.85 }]}
              testID="account-plan-reset"
            >
              <Ionicons name="refresh" size={16} color="#991b1b" />
              <Text style={s.switchResetText}>Reset active plan</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS === "web" ? (
        <Modal
          visible={showDeletePrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeletePrompt(false)}
        >
          <Pressable
            style={deleteDialogStyles.overlay}
            onPress={() => setShowDeletePrompt(false)}
            testID="delete-account-overlay"
          >
            <Pressable
              style={deleteDialogStyles.sheet}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={deleteDialogStyles.title}>Delete account?</Text>
              <Text style={deleteDialogStyles.body}>
                This will permanently delete your account and associated data.
                This action cannot be undone.
              </Text>

              <View style={deleteDialogStyles.actions}>
                <Pressable
                  testID="delete-account-cancel"
                  onPress={() => setShowDeletePrompt(false)}
                  style={({ pressed }) => [
                    deleteDialogStyles.cancelBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={deleteDialogStyles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="delete-account-confirm"
                  disabled={deleting}
                  onPress={() => {
                    setShowDeletePrompt(false);
                    void performDeleteAccount();
                  }}
                  style={({ pressed }) => [
                    deleteDialogStyles.confirmBtn,
                    pressed && { opacity: 0.9 },
                    deleting && { opacity: 0.6 },
                  ]}
                >
                  <Text style={deleteDialogStyles.confirmBtnText}>
                    Confirm Delete
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </ScrollView>
  );
}

const DELETE_DESTRUCTIVE = "#B3261E";

const deleteDialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  body: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  cancelBtnText: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: DELETE_DESTRUCTIVE,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
});

const s = {
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  } as const,

  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  } as const,

  scrollContentLarge: {
    maxWidth: 900,
    alignSelf: "center" as const,
    width: "100%" as const,
  } as const,

  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 32,
  } as const,

  headerTitle: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  } as const,

  section: {
    alignItems: "center" as const,
    marginBottom: 32,
  } as const,

  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: tokens.color.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  } as const,

  email: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 16,
    marginBottom: 24,
  } as const,

  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  } as const,

  rowLabel: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  } as const,

  rowValue: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    flexShrink: 1,
    textAlign: "right" as const,
  } as const,

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  } as const,

  badgePro: { backgroundColor: tokens.color.primary } as const,
  badgeFree: { backgroundColor: tokens.color.border } as const,

  badgeText: { fontSize: tokens.text.small, fontWeight: tokens.weight.black, fontFamily: tokens.font.bodyBold } as const,
  badgeTextPro: { color: tokens.color.white } as const,
  badgeTextFree: { color: tokens.color.subtext } as const,

  countrySection: {
    gap: 8,
  } as const,

  countryLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
  } as const,

  countryChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  } as const,

  countryChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  } as const,

  countryChipText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
  } as const,

  upgradeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: tokens.color.gold,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    marginTop: 4,
  } as const,

  upgradeBtnText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  planCardWrap: {
    marginBottom: 24,
    gap: 8,
  } as const,

  planCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  } as const,

  planSwitchLink: {
    alignSelf: "flex-end" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  } as const,

  planSwitchLinkText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
  } as const,

  switchOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 24,
  } as const,

  switchSheet: {
    width: "100%" as const,
    maxWidth: 420,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 20,
    gap: 12,
  } as const,

  switchHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  } as const,

  switchTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  switchSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  } as const,

  switchSectionLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginTop: 4,
  } as const,

  switchList: {
    maxHeight: 320,
  } as const,

  switchCountryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  } as const,

  switchCountryText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  switchResetBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 4,
  } as const,

  switchResetText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: "#991b1b",
  } as const,

  planCardRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  } as const,

  planCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  } as const,

  planCardTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  planCardSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 2,
  } as const,

  planCardBarTrack: {
    marginTop: 12,
    height: 6,
    backgroundColor: "rgba(28,43,94,0.08)",
    borderRadius: 3,
    overflow: "hidden" as const,
  } as const,

  planCardBarFill: {
    height: 6,
    backgroundColor: tokens.color.primary,
    borderRadius: 3,
  } as const,

  statusBox: {
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  } as const,

  statusText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.primary,
    textAlign: "center" as const,
  } as const,

  actionsGroup: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: 24,
    overflow: "hidden" as const,
  } as const,

  actionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  } as const,

  actionRowText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  } as const,

  actionDivider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginHorizontal: 16,
  } as const,

  logoutBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  } as const,

  logoutText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: "#b91c1c",
  } as const,

  dangerHeader: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: "#991b1b",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginTop: 32,
    marginBottom: 8,
  } as const,

  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
  } as const,

  deleteText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: "#991b1b",
  } as const,

  sandboxToggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    marginTop: 16,
  } as const,

  sandboxToggleTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: "#166534",
  } as const,

  sandboxToggleSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: "#4ade80",
    marginTop: 1,
  } as const,

  debugBillingBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    marginTop: 16,
  } as const,

  debugBillingText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: "#1e40af",
  } as const,

  crashTestBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.gold,
    backgroundColor: tokens.color.goldLight,
    marginTop: 16,
  } as const,

  crashTestText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.gold,
  } as const,

  versionLabel: {
    alignItems: "center" as const,
    paddingVertical: 24,
    marginTop: 16,
  } as const,

  versionText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    opacity: 0.5,
  } as const,
} as const;
