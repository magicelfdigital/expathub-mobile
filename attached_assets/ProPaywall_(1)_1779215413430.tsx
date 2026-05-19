import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useEntitlement } from "@/src/contexts/EntitlementContext";
import { getProOffer, isLaunchCountry } from "@/src/data";
import type { ProOffer } from "@/src/data";
import { getOfferings } from "@/src/subscriptions/revenuecat";
import { showToast } from "@/src/lib/toastBus";
import { createCheckoutSession, createCustomerPortalSession } from "@/src/subscriptions/stripeWeb";
import {
  RC_MONTHLY_PRODUCT,
  RC_ANNUAL_PRODUCT,
  SANDBOX_ENABLED,
  TERMS_URL,
  PRIVACY_URL,
  TRIAL_DURATION_DAYS,
  MONTHLY_PRICE,
  ANNUAL_PRICE,
} from "@/src/config/subscription";
import { COVERAGE_SUMMARY } from "@/src/data";
import { PAID_TIER_DISPLAY_NAME } from "@/constants/tiers";
import { trackEvent, logFbEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";
import { COUNTRIES } from "@/data/countries";
import {
  getOrchestrator,
  EntitlementPollingTimeoutError,
  RevenueCatPurchaseError,
  clearRefreshCooldown,
} from "@/src/billing";
import { applyReverseTrialOnDismiss } from "@/src/lib/conversionLifts";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PaywallTab = "features" | "plans" | "faq";

const PAYWALL_TABS: { key: PaywallTab; label: string }[] = [
  { key: "features", label: "What you get" },
  { key: "plans", label: "Plans" },
  { key: "faq", label: "FAQ" },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What's included in Decision Briefs?",
    answer: "Each Decision Brief is a detailed analysis covering visa requirements, work authorization rules, tax implications, healthcare access, and common mistakes to avoid. They are built from official government sources and verified expert input.",
  },
  {
    question: "Can I access multiple countries?",
    answer: "Both the Monthly Explorer and Annual Pathfinder plans give you full access to all 11 country guides while your subscription is active.",
  },
  {
    question: "How do I cancel a subscription?",
    answer: "On iOS, go to Settings > Apple ID > Subscriptions. On Android, open Google Play > Subscriptions. On web, use the Manage Subscription link in your account.",
  },
  {
    question: "Is there a free trial?",
    answer: "Both plans include a 14-day free trial. Cancel before day 14 in your App Store, Google Play, or Stripe billing settings and you won't be charged. After the trial, Monthly Explorer renews at $14.99/month and Annual Pathfinder renews at $89/year, unless cancelled.",
  },
  {
    question: "What payment methods are accepted?",
    answer: "iOS uses Apple Pay and App Store billing. Android uses Google Play billing. On web, payments are processed through Stripe (credit/debit cards).",
  },
];

function FAQItem({ item }: { item: { question: string; answer: string } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
      }}
      style={s.faqCard}
    >
      <View style={s.faqHeader}>
        <Text style={s.faqQuestion}>{item.question}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={tokens.color.subtext} />
      </View>
      {expanded ? <Text style={s.faqAnswer}>{item.answer}</Text> : null}
    </Pressable>
  );
}

function parsePrice(price: string): number {
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function logFbPurchaseEvent(type: string, opts?: { slug?: string; priceUSD?: number }) {
  if (type === "annual_subscription" || type === "annual") {
    logFbEvent("StartTrial", 0, { plan: "annual" });
    return;
  }
  if (type === "monthly_subscription" || type === "monthly") {
    // Both plans now include a 14-day free trial — fire StartTrial (not
    // Subscribe) so Meta sees the trial conversion, not a paid purchase.
    // A `Subscribe` event with revenue will fire later from the
    // RevenueCat/Stripe webhook when the trial converts to a paid charge.
    logFbEvent("StartTrial", 0, { plan: "monthly" });
    return;
  }
}

async function getActualPriceUSD(productId: string): Promise<number | undefined> {
  try {
    const offerings = await getOfferings();
    const pkg = offerings.current.find((p) => p.productId === productId);
    return typeof pkg?.price === "number" && pkg.price > 0 ? pkg.price : undefined;
  } catch {
    return undefined;
  }
}

type PaywallEntryPoint =
  | "compare"
  | "brief"
  | "pathway"
  | "general"
  | "country"
  // Surfaces added when the paywall placement was moved to end-of-results
  // and worksheet-open. Tagged distinctly so dashboards can split
  // conversion by the new placements vs. the legacy mid-list ones.
  | "result_screen"
  | "worksheet_list"
  | "worksheet_detail";

type ProPaywallProps = {
  countrySlug?: string;
  pathwayKey?: string;
  entryPoint?: PaywallEntryPoint;
  showClose?: boolean;
  onClose?: () => void;
  unlockLabel?: string;
};

function getCountryName(slug: string): string {
  return COUNTRIES.find((c) => c.slug === slug)?.name ?? slug;
}

export function ProPaywall({
  countrySlug,
  pathwayKey,
  entryPoint,
  showClose = false,
  onClose,
  unlockLabel,
}: ProPaywallProps) {
  const router = useRouter();
  const { user, token } = useAuth();
  const { selectedCountrySlug } = useCountry();
  const {
    hasActiveSubscription,
    hasFullAccess,
    accessType,
    source,
    loading: entitlementLoading,
    sandboxMode,
    managementURL,
    expirationDate,
    setSandboxOverride,
    refresh,
    promoCodeActive,
    redeemPromoCode,
    clearPromoCode,
  } = useSubscription();
  const { reverseTrialUsed, reverseTrialActive, startReverseTrial } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PaywallTab>("plans");
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState(false);
  const [personalAttrs, setPersonalAttrs] = useState<{ topCountry: string | null; firstName: string | null }>({ topCountry: null, firstName: null });
  const [livePrices, setLivePrices] = useState<{ monthly: string | null; annual: string | null }>({ monthly: null, annual: null });
  const showPromoCodeFeature = __DEV__;
  const insets = useSafeAreaInsets();
  const resolvedCountrySlug = countrySlug ?? selectedCountrySlug ?? undefined;
  const pendingPurchaseHandled = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tc, fn] = await Promise.all([
          AsyncStorage.getItem("user_top_country"),
          AsyncStorage.getItem("user_first_name"),
        ]);
        if (mounted) setPersonalAttrs({ topCountry: tc ?? null, firstName: fn ?? null });
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const offer: ProOffer = getProOffer(resolvedCountrySlug, pathwayKey);
  const mountedAtRef = useRef<number>(Date.now());

  const resolvedEntryPoint: PaywallEntryPoint =
    entryPoint ?? (pathwayKey ? "pathway" : resolvedCountrySlug ? "country" : "general");

  const countryName = resolvedCountrySlug ? getCountryName(resolvedCountrySlug) : null;

  // Spec format: `Your {top_country} roadmap is ready, {first_name}`.
  // Fallbacks degrade gracefully when one or both attributes are missing.
  const personalizedHeadline = (() => {
    if (unlockLabel) return `Unlock: ${unlockLabel}`;
    const topSlug = personalAttrs.topCountry;
    const topName = topSlug ? getCountryName(topSlug) : null;
    const first = personalAttrs.firstName?.trim() || null;
    const country = topName ?? countryName;
    if (country && first) return `Your ${country} roadmap is ready, ${first}`;
    if (country) return `Your ${country} roadmap is ready`;
    if (first) return `Your relocation roadmap is ready, ${first}`;
    return "Your relocation roadmap is ready";
  })();
  const isLaunch = !resolvedCountrySlug || isLaunchCountry(resolvedCountrySlug);

  async function storePendingPurchase(type: string, slug?: string) {
    const pending = JSON.stringify({ type, countrySlug: slug ?? null });
    await AsyncStorage.setItem("pending_purchase", pending);
    console.log(`[PURCHASE] Stored pending purchase: ${pending}`);
  }

  async function clearPendingPurchase() {
    await AsyncStorage.removeItem("pending_purchase");
    console.log("[PURCHASE] Cleared pending purchase");
  }

  useEffect(() => {
    if (!user || pendingPurchaseHandled.current || entitlementLoading) return;
    let cancelled = false;
    const currentUser = user;

    const closePurchaseModal = () => {
      if (onClose) onClose();
      else if (router.canGoBack()) router.back();
    };

    (async () => {
      try {
        const raw = await AsyncStorage.getItem("pending_purchase");
        if (!raw || cancelled) return;
        const pending = JSON.parse(raw) as { type: string; countrySlug: string | null };
        console.log(`[PURCHASE] User returned from auth, resuming pending purchase: ${JSON.stringify(pending)}`);
        pendingPurchaseHandled.current = true;
        await clearPendingPurchase();

        if (Platform.OS !== "web") {
          const productId =
            pending.type === "monthly" ? RC_MONTHLY_PRODUCT
            : pending.type === "annual" ? RC_ANNUAL_PRODUCT
            : null;

          if (!productId) return;

          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;

          const userId = currentUser.id.toString();
          const orchestrator = getOrchestrator(() => token);
          setError(null);
          setBusy(true);
          console.log(`[PURCHASE] Resuming ${pending.type} via orchestrator: productId=${productId}`);

          try {
            const priceUSD = await getActualPriceUSD(productId);
            const result = await orchestrator.purchase(productId, userId);
            if (result.status === "confirmed") {
              trackEvent("purchase_success", { type: pending.type, platform: Platform.OS, status: "confirmed" });
              logFbPurchaseEvent(pending.type, { slug: pending.countrySlug ?? undefined, priceUSD });
              await refresh();
              closePurchaseModal();
            } else {
              setError("Purchase is being processed. Please check back in a moment.");
            }
          } catch (purchaseErr: any) {
            if (purchaseErr instanceof RevenueCatPurchaseError && purchaseErr.userCancelled) {
              console.log(`[PURCHASE] ${pending.type}: user cancelled resumed purchase`);
              setError(null);
              return;
            }
            if (purchaseErr instanceof EntitlementPollingTimeoutError) {
              setError("Purchase received. Access will activate shortly. If not, tap Restore Purchases.");
              return;
            }
            console.log(`[PURCHASE] Resume error: ${purchaseErr?.message}`);
            setError("We couldn't complete your purchase. Please tap the button to try again.");
          } finally {
            setBusy(false);
          }
        } else {
          console.log(`[PURCHASE] Pending ${pending.type} on web — user can tap the button now`);
        }
      } catch (e) {
        console.log(`[PURCHASE] Error resuming pending purchase: ${e}`);
        setBusy(false);
        setError("We couldn't start your purchase automatically. Please tap the purchase button to try again.");
      }
    })();

    return () => { cancelled = true; };
  }, [user, entitlementLoading]);

  useEffect(() => {
    const props = {
      platform: Platform.OS,
      country: resolvedCountrySlug ?? "none",
      pathway: pathwayKey ?? "none",
      entryPoint: resolvedEntryPoint,
    };
    trackEvent("paywall_shown", props);
    trackEvent("paywall_viewed", props);
    logFbEvent("ViewedPaywall", undefined, {
      entry_point: resolvedEntryPoint,
      top_country: resolvedCountrySlug ?? "none",
    });
  }, []);

  // Fire personalized_paywall_viewed once we know the attributes (or know they're absent).
  const personalizedFiredRef = useRef(false);
  useEffect(() => {
    if (personalizedFiredRef.current) return;
    personalizedFiredRef.current = true;
    trackEvent("personalized_paywall_viewed", {
      hasTopCountry: !!personalAttrs.topCountry,
      hasFirstName: !!personalAttrs.firstName,
      topCountry: personalAttrs.topCountry ?? "none",
      country: resolvedCountrySlug ?? "none",
    });
  }, [personalAttrs.topCountry, personalAttrs.firstName]);

  useEffect(() => {
    if (Platform.OS === "web" || hasActiveSubscription) return;
    getOfferings()
      .then((result) => {
        console.log("[PAYWALL-DIAG] Offerings loaded:");
        console.log("[PAYWALL-DIAG] Current offering identifier:", result.current?.[0] ? "default" : "none");
        console.log("[PAYWALL-DIAG] Package count:", result.current?.length ?? 0);
        result.current?.forEach((pkg) => {
          console.log(`[PAYWALL-DIAG] Package: id=${pkg.identifier}, productId=${pkg.productId}, type=${pkg.packageType}, price=${pkg.priceString}`);
        });
        console.log("[PAYWALL-DIAG] Monthly package productId:", result.monthlyPackage?.productId ?? "NOT FOUND");
        if (result.error) {
          console.log("[PAYWALL-DIAG] Error:", result.error);
        }
        setLivePrices({
          monthly: result.monthlyPackage?.priceString ?? null,
          annual: result.annualPackage?.priceString ?? null,
        });
      })
      .catch((e) => {
        console.log("[PAYWALL-DIAG] getOfferings failed:", e);
      });
  }, [hasActiveSubscription]);

  // Live prices from RC offerings — fall back to the canonical price
  // constants so web, Expo Go, and any RC-init failure path still render a
  // real price instead of an em dash.
  const monthlyPriceLabel = livePrices.monthly ?? MONTHLY_PRICE;
  const annualPriceLabel = livePrices.annual ?? ANNUAL_PRICE;

  async function handleMobilePurchase(productId: string, type: string, slug?: string) {
    const userId = user!.id.toString();
    const orchestrator = getOrchestrator(() => token);

    setError(null);
    setBusy(true);
    console.log(`[PURCHASE] ${type} purchase via orchestrator: productId=${productId}`);

    const priceUSD = await getActualPriceUSD(productId);

    try {
      const result = await orchestrator.purchase(productId, userId);

      if (result.status === "confirmed") {
        trackEvent("purchase_success", { type, platform: Platform.OS, status: "confirmed" });
        logFbPurchaseEvent(type, { slug, priceUSD });
        if (type === "monthly_subscription") {
          trackEvent("trial_started", { plan: "monthly", platform: Platform.OS });
        } else if (type === "annual_subscription") {
          trackEvent("trial_started", { plan: "annual", platform: Platform.OS });
        }
        await refresh();
        console.log(`[PURCHASE] ${type} confirmed by backend, closing paywall`);
        if (onClose) onClose();
        else router.back();
      } else {
        console.log(`[PURCHASE] ${type}: backend status=${result.status}`);
        setError("Purchase is being processed. Please check back in a moment.");
      }
    } catch (e: any) {
      if (e instanceof RevenueCatPurchaseError && e.userCancelled) {
        if (__DEV__) {
          console.log(`[PURCHASE] DEV MODE: ${type} cancelled — simulating success`);
          trackEvent("purchase_success", { type, platform: Platform.OS, status: "dev_simulated" });
          logFbPurchaseEvent(type, { slug, priceUSD });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        console.log(`[PURCHASE] ${type}: user cancelled payment`);
        trackEvent("purchase_cancelled", { type, platform: Platform.OS });
        setError(null);
        return;
      }
      if (e instanceof EntitlementPollingTimeoutError) {
        console.log(`[PURCHASE] ${type}: backend confirmation timed out after ${e.elapsedMs}ms`);
        setError("Purchase received. Access will activate shortly. If not, tap Restore Purchases.");
        trackEvent("purchase_timeout", { type, platform: Platform.OS });
        return;
      }
      if (__DEV__) {
        console.log(`[PURCHASE] DEV MODE: ${type} error (${e?.message}) — simulating success`);
        trackEvent("purchase_success", { type, platform: Platform.OS, status: "dev_simulated" });
        logFbPurchaseEvent(type, { slug, priceUSD });
        await refresh();
        if (onClose) onClose();
        else router.back();
        return;
      }
      const msg = e?.message ?? "Unknown error";
      console.log(`[PURCHASE] ${type} error: ${msg}`);
      trackEvent("purchase_error", { type, error: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleMonthlySubscribe() {
    // Mid-funnel Meta signal: fired on ANY plan tap (including the
    // anonymous-user → auth redirect path) so App Promotion campaigns
    // see the full intent population, not just authenticated taps.
    // Mirrors web's `trackAddToCart` in web/src/lib/pixel.ts.
    logFbEvent("AddToCart", undefined, { plan: "monthly" });
    if (!user) {
      console.log("[PURCHASE] Monthly tapped but user not logged in — redirecting to auth");
      await storePendingPurchase("monthly", resolvedCountrySlug);
      router.push("/auth?mode=register&purchaseContext=trial");
      return;
    }
    trackEvent("product_selected", { productId: RC_MONTHLY_PRODUCT, price: livePrices.monthly ?? "unknown", type: "monthly_subscription" });
    trackEvent("purchase_tapped", { type: "monthly_subscription", platform: Platform.OS });
    trackEvent("trial_tapped", { plan: "monthly", platform: Platform.OS });
    if (Platform.OS === "web") {
      setBusy(true);
      setError(null);
      try {
        if (__DEV__) {
          console.log("[PURCHASE] DEV MODE: Simulating monthly subscription on web");
          trackEvent("purchase_success", { type: "monthly_subscription", platform: "web", status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        const url = await createCheckoutSession("monthly");
        if (url) {
          window.location.href = url;
        }
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setBusy(false);
      }
      return;
    }
    await handleMobilePurchase(RC_MONTHLY_PRODUCT, "monthly_subscription");
  }

  async function handleAnnualSubscribe() {
    // Mid-funnel Meta signal: fired on ANY plan tap (including the
    // anonymous-user → auth redirect path) so App Promotion campaigns
    // see the full intent population, not just authenticated taps.
    // Mirrors web's `trackAddToCart` in web/src/lib/pixel.ts.
    logFbEvent("AddToCart", undefined, { plan: "annual" });
    if (!user) {
      console.log("[PURCHASE] Annual tapped but user not logged in — redirecting to auth");
      await storePendingPurchase("annual", resolvedCountrySlug);
      router.push("/auth?mode=register&purchaseContext=trial");
      return;
    }
    trackEvent("product_selected", { productId: RC_ANNUAL_PRODUCT, price: livePrices.annual ?? "unknown", type: "annual_subscription" });
    trackEvent("purchase_tapped", { type: "annual_subscription", platform: Platform.OS });
    trackEvent("trial_tapped", { plan: "annual", platform: Platform.OS });
    if (Platform.OS === "web") {
      setBusy(true);
      setError(null);
      try {
        if (__DEV__) {
          console.log("[PURCHASE] DEV MODE: Simulating annual subscription on web");
          trackEvent("purchase_success", { type: "annual_subscription", platform: "web", status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        const url = await createCheckoutSession("annual");
        if (url) {
          window.location.href = url;
        }
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setBusy(false);
      }
      return;
    }
    await handleMobilePurchase(RC_ANNUAL_PRODUCT, "annual_subscription");
  }

  async function handleRestore() {
    if (!user) {
      setError("Please sign in first to restore purchases.");
      return;
    }
    setBusy(true);
    setError(null);
    trackEvent("restore_tapped", { platform: Platform.OS });
    try {
      clearRefreshCooldown(user.id.toString());
      const orchestrator = getOrchestrator(() => token);
      const result = await orchestrator.restore(user.id.toString());
      await refresh();
      if (result.status === "confirmed") {
        trackEvent("restore_success", { platform: Platform.OS });
      } else {
        trackEvent("restore_not_found", { platform: Platform.OS });
        setError("We couldn't find an active purchase linked to your account. If you purchased on a different platform, try restoring there.");
      }
    } catch (e: any) {
      if (e instanceof EntitlementPollingTimeoutError) {
        await refresh();
        setError("Restore is taking longer than expected. Your access will activate shortly.");
        trackEvent("restore_timeout", { platform: Platform.OS });
        return;
      }
      trackEvent("restore_error", { platform: Platform.OS, error: e?.message ?? "unknown" });
      setError("We had trouble checking your purchases. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleManage() {
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === "web") {
        const url = await createCustomerPortalSession();
        if (url) window.location.href = url;
      } else if (managementURL) {
        await Linking.openURL(managementURL);
      } else if (Platform.OS === "ios") {
        await Linking.openURL("https://apps.apple.com/account/subscriptions");
      } else {
        await Linking.openURL("https://play.google.com/store/account/subscriptions");
      }
    } catch {
      setError("Couldn't open account settings. You can manage your plan from your device settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePromoSubmit() {
    if (!promoCode.trim()) return;
    setBusy(true);
    setPromoError(null);
    const result = await redeemPromoCode(promoCode);
    if (result.success) {
      setPromoSuccess(true);
      setPromoError(null);
      await refresh();
      setTimeout(() => {
        if (onClose) onClose();
        else router.back();
      }, 1200);
    } else {
      setPromoError(result.error ?? "Invalid code");
    }
    setBusy(false);
  }

  async function handleClose() {
    trackEvent("paywall_dismissed", {
      countrySlug: resolvedCountrySlug ?? "none",
      pathwayKey: pathwayKey ?? "none",
      timeOnScreenMs: Date.now() - mountedAtRef.current,
      activeTab,
    });

    // Reverse-trial gate: grant 48h preview on first dismiss for non-paying users.
    // The toast is fired through the global bus so it survives the paywall
    // unmount that follows immediately after dismissal. Orchestration lives
    // in `src/lib/conversionLifts.ts` so jest tests exercise the same code
    // path (no duplicated logic in tests).
    await applyReverseTrialOnDismiss({
      state: { hasFullAccess, reverseTrialActive, reverseTrialUsed },
      startReverseTrial,
      showToast,
      onError: (e: any) =>
        console.log(`[REVERSE-TRIAL] start failed: ${e?.message ?? e}`),
    });

    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as any);
  }

  if (!isLaunch && resolvedCountrySlug) {
    return (
      <View style={s.loadingContainer}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.bg, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 8 }}>
          <Ionicons name="time-outline" size={28} color={tokens.color.textSoft} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: "700", fontFamily: tokens.font.display, color: tokens.color.text, textAlign: "center", marginBottom: 8 }}>
          Coming Soon
        </Text>
        <Text style={{ fontSize: 15, fontFamily: tokens.font.body, color: tokens.color.subtext, textAlign: "center", lineHeight: 22, paddingHorizontal: 24 }}>
          Full Decision Briefs for {countryName} are being built. Complete guides with detailed advice will be available here soon.
        </Text>
        {showClose ? (
          <Pressable
            onPress={handleClose}
            style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.primary }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", fontFamily: tokens.font.bodyBold, color: tokens.color.white }}>Browse available countries</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (entitlementLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
        <Text style={s.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show sticky CTA on the "What you get" and "FAQ" tabs to push conversion for
  // users who scroll without committing. On the Plans tab, the inline plan CTAs
  // already drive action so we hide the sticky bar to avoid duplication.
  const showBottomCta = !hasFullAccess && activeTab !== "plans";
  const stickyCtaLabel = `Start ${TRIAL_DURATION_DAYS}-day free trial`;
  const stickyCtaFinePrint = `Cancel anytime before day ${TRIAL_DURATION_DAYS} — you won't be charged.`;

  return (
    <View testID="pro-paywall" style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: Math.max(insets.top + 8, tokens.space.xl), paddingBottom: showBottomCta ? 100 : tokens.space.xxl + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable testID="pro-paywall-close" onPress={handleClose} hitSlop={12} style={s.closeButton}>
          <Ionicons name="close" size={24} color={tokens.color.text} />
        </Pressable>

        <View style={s.header}>
          <View style={s.proIconCircle}>
            <Ionicons name="shield-checkmark" size={28} color={tokens.color.primary} />
          </View>
          <Text style={s.h1}>{personalizedHeadline}</Text>
          <Text style={s.lead}>
            Compare countries, understand risks, and avoid costly mistakes
          </Text>
          <Text style={s.subLead}>
            Decision Briefs explain what work is actually allowed, when sponsorship is required, and which visas quietly close doors later.
          </Text>
        </View>

        {error ? (
          <View style={s.errorCard}>
            <Ionicons name="information-circle" size={18} color={tokens.color.gold} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {hasFullAccess ? (
          <>
            <View style={s.activeCard}>
              <Ionicons name="checkmark-circle" size={24} color={tokens.color.primary} />
              <Text style={s.activeText}>Your current plan</Text>
              <Text style={s.sourceText}>
                {accessType === "subscription"
                  ? "Active subscription — all countries"
                  : accessType === "sandbox"
                    ? "Sandbox mode (testing)"
                    : "Active"}
              </Text>
              {expirationDate ? (
                <Text style={s.expirationText}>
                  Renews {new Date(expirationDate).toLocaleDateString()}
                </Text>
              ) : null}
              {accessType === "subscription" ? (
                <Pressable
                  onPress={handleManage}
                  disabled={busy}
                  style={({ pressed }) => [s.secondaryCta, pressed && s.ctaPressed]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={tokens.color.text} />
                  ) : (
                    <Text style={s.secondaryCtaText}>Manage Subscription</Text>
                  )}
                </Pressable>
              ) : null}
            </View>

          </>
        ) : (
          <>
            <View style={s.tabRow}>
              {PAYWALL_TABS.map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    setActiveTab(tab.key);
                    trackEvent("paywall_tab_viewed", {
                      tab: tab.key,
                      countrySlug: resolvedCountrySlug ?? "none",
                    });
                  }}
                  style={[s.tabPill, activeTab === tab.key && s.tabPillActive]}
                >
                  <Text style={[s.tabPillText, activeTab === tab.key && s.tabPillTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activeTab === "features" ? (
              <>
                {offer.notFor.length > 0 ? (
                  <View style={s.ruledOutCard}>
                    <Text style={s.ruledOutTitle}>Not the right fit for</Text>
                    {offer.notFor.map((n) => (
                      <View key={n} style={s.bulletRow}>
                        <Ionicons name="close-circle" size={18} color="#dc2626" />
                        <Text style={s.ruledOutText}>{n}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={s.featureCard}>
                  <Text style={s.cardTitle}>What the Decision Brief covers</Text>
                  {offer.bullets.map((b) => (
                    <View key={b} style={s.bulletRow}>
                      <View style={s.bulletIcon}>
                        <Ionicons name="checkmark" size={14} color={tokens.color.primary} />
                      </View>
                      <Text style={s.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.mistakeCard}>
                  <Text style={s.mistakeTitle}>Costly mistakes you'll avoid</Text>
                  {offer.mistakesAvoided.map((m) => (
                    <View key={m} style={s.bulletRow}>
                      <View style={s.warningIcon}>
                        <Ionicons name="alert" size={14} color={tokens.color.gold} />
                      </View>
                      <Text style={s.bulletText}>{m}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {activeTab === "plans" ? (
              <>
                <View style={s.pricingSection}>
                  <View style={[s.monthlyCard, { borderColor: tokens.color.gold, borderWidth: 2 }]}>
                    <View style={s.bestValueBadge}>
                      <Text style={s.bestValueText}>{TRIAL_DURATION_DAYS}-DAY FREE TRIAL</Text>
                    </View>
                    <View style={s.monthlyHeader}>
                      <Ionicons name="star" size={18} color={tokens.color.gold} />
                      <Text style={s.monthlyTitle}>Annual Pathfinder</Text>
                    </View>
                    <Text style={s.monthlyMeta}>Free for {TRIAL_DURATION_DAYS} days, then {annualPriceLabel}/year · Save over 50% vs monthly</Text>
                    <Pressable
                      onPress={handleAnnualSubscribe}
                      disabled={busy}
                      style={({ pressed }) => [s.primaryCta, pressed && s.ctaPressed]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={tokens.color.white} />
                      ) : (
                        <Text style={s.primaryCtaText}>Start {TRIAL_DURATION_DAYS}-day free trial</Text>
                      )}
                    </Pressable>
                    <Text style={s.trialFinePrint}>
                      Cancel anytime before day {TRIAL_DURATION_DAYS} — you won't be charged.
                    </Text>
                  </View>

                  <View style={s.monthlyCard}>
                    <View style={s.monthlyHeader}>
                      <Ionicons name="calendar-outline" size={18} color={tokens.color.primary} />
                      <Text style={s.monthlyTitle}>Monthly Explorer</Text>
                    </View>
                    <Text style={s.monthlyMeta}>Free for {TRIAL_DURATION_DAYS} days, then {monthlyPriceLabel}/month · cancel anytime</Text>
                    <Pressable
                      onPress={handleMonthlySubscribe}
                      disabled={busy}
                      style={({ pressed }) => [s.secondaryCta, pressed && s.ctaPressed]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={tokens.color.text} />
                      ) : (
                        <Text style={s.secondaryCtaText}>Start {TRIAL_DURATION_DAYS}-day free trial</Text>
                      )}
                    </Pressable>
                    <Text style={s.trialFinePrint}>
                      Cancel anytime before day {TRIAL_DURATION_DAYS} — you won't be charged.
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleRestore}
                  disabled={busy}
                  style={({ pressed }) => [s.restoreButton, pressed && s.ctaPressed]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={tokens.color.primary} />
                  ) : (
                    <Text style={s.restoreText}>Restore Purchases</Text>
                  )}
                </Pressable>

                {showPromoCodeFeature ? (
                  !showPromoInput ? (
                    <Pressable onPress={() => setShowPromoInput(true)} style={s.restoreButton}>
                      <Text style={s.promoLinkText}>Have a code? (Dev only)</Text>
                    </Pressable>
                  ) : (
                    <View style={s.promoCard}>
                      <Text style={s.promoLabel}>Enter your access code (Dev only)</Text>
                      <View style={s.promoInputRow}>
                        <TextInput
                          style={s.promoInput}
                          placeholder="e.g. EXPATHUB-REVIEW-2026"
                          placeholderTextColor={tokens.color.subtext}
                          value={promoCode}
                          onChangeText={setPromoCode}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          editable={!promoSuccess}
                        />
                        <Pressable
                          onPress={handlePromoSubmit}
                          disabled={busy || !promoCode.trim() || promoSuccess}
                          style={({ pressed }) => [
                            s.promoSubmitBtn,
                            (!promoCode.trim() || promoSuccess) && s.promoSubmitDisabled,
                            pressed && s.ctaPressed,
                          ]}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={tokens.color.white} />
                          ) : promoSuccess ? (
                            <Ionicons name="checkmark" size={20} color={tokens.color.white} />
                          ) : (
                            <Ionicons name="arrow-forward" size={20} color={tokens.color.white} />
                          )}
                        </Pressable>
                      </View>
                      {promoError ? (
                        <Text style={s.promoErrorText}>{promoError}</Text>
                      ) : null}
                      {promoSuccess ? (
                        <Text style={s.promoSuccessText}>Access unlocked</Text>
                      ) : null}
                    </View>
                  )
                ) : null}

                <View style={s.coverageNote}>
                  <Ionicons name="information-circle-outline" size={16} color={tokens.color.subtext} />
                  <Text style={s.coverageNoteText}>
                    Full guides available: {COVERAGE_SUMMARY.ready}. Coming soon: {COVERAGE_SUMMARY.soon}.
                  </Text>
                </View>
              </>
            ) : null}

            {activeTab === "faq" ? (
              <View style={s.faqSection}>
                {FAQ_ITEMS.map((item) => (
                  <FAQItem key={item.question} item={item} />
                ))}
              </View>
            ) : null}
          </>
        )}

        {sandboxMode ? (
          <View style={s.sandboxCard}>
            <View style={s.sandboxRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sandboxTitle}>Sandbox Mode</Text>
                <Text style={s.sandboxSub}>Toggle {PAID_TIER_DISPLAY_NAME} access for testing</Text>
              </View>
              <Switch
                value={hasActiveSubscription}
                onValueChange={(val) => setSandboxOverride(val)}
                trackColor={{ false: tokens.color.border, true: tokens.color.primary }}
              />
            </View>
          </View>
        ) : null}

        <Text style={s.disclaimer}>
          {Platform.OS === "web"
            ? "Payment managed via Stripe. Cancel anytime from the customer portal."
            : Platform.OS === "ios"
              ? "Both plans include a 14-day free trial. Cancel before the trial ends in your App Store subscription settings and you won't be charged; otherwise your Apple ID will be charged $14.99/month (Monthly Explorer) or $89/year (Annual Pathfinder) on day 15. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period."
              : "Both plans include a 14-day free trial. Cancel before the trial ends in Google Play subscription settings and you won't be charged; otherwise your account will be charged $14.99/month (Monthly Explorer) or $89/year (Annual Pathfinder) on day 15. Subscriptions automatically renew until cancelled."}
        </Text>

        <View style={s.legalFooter}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
            <Text style={s.legalLink}>Terms of Use</Text>
          </Pressable>
          <Text style={s.legalSeparator}>|</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showBottomCta ? (
        <View style={[s.bottomCtaBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            onPress={() => {
              trackEvent("paywall_sticky_cta_tapped", { tab: activeTab, platform: Platform.OS });
              setActiveTab("plans");
              if (Platform.OS === "web") {
                handleMonthlySubscribe();
              } else {
                handleAnnualSubscribe();
              }
            }}
            disabled={busy}
            style={({ pressed }) => [s.bottomCtaButton, pressed && s.ctaPressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={tokens.color.white} />
            ) : (
              <Text style={s.bottomCtaText}>{stickyCtaLabel}</Text>
            )}
          </Pressable>
          <Text style={s.bottomCtaFinePrint}>{stickyCtaFinePrint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = {
  loadingContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  loadingText: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  scroll: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  scrollContent: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl + 20,
    gap: tokens.space.lg,
  },
  closeButton: {
    alignSelf: "flex-end" as const,
    padding: 4,
  },
  header: {
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  proIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  lead: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    lineHeight: 22,
    textAlign: "center" as const,
  },
  subLead: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
    lineHeight: 18,
    textAlign: "center" as const,
  },
  ruledOutCard: {
    backgroundColor: "#fef2f2",
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: tokens.space.lg,
    gap: 10,
  },
  ruledOutTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: "#991b1b",
    marginBottom: 2,
  },
  ruledOutText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: "#7f1d1d",
    lineHeight: 20,
  },
  featureCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: 10,
  },
  cardTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  bulletIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  warningIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.color.goldLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  mistakeCard: {
    backgroundColor: tokens.color.goldLight,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.gold,
    padding: tokens.space.lg,
    gap: 10,
  },
  mistakeTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.gold,
    marginBottom: 2,
  },
  errorCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.goldLight,
    borderWidth: 1,
    borderColor: tokens.color.gold,
  },
  errorText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.gold,
    lineHeight: 16,
  },
  pricingSection: {
    gap: tokens.space.md,
  },
  pricingCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.xl,
    gap: tokens.space.sm,
  },
  primaryCard: {
    borderColor: tokens.color.primary,
    borderWidth: 2,
  },
  recommendedBadge: {
    position: "absolute" as const,
    top: -11,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primary,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  pricingHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  pricingTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  pricingDesc: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: 4,
    marginVertical: 2,
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  priceUnit: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  pricingBullets: {
    gap: 6,
    marginTop: 4,
  },
  pricingBulletRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  pricingBulletText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 18,
  },
  primaryCta: {
    width: "100%" as const,
    backgroundColor: tokens.color.primary,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    alignItems: "center" as const,
    marginTop: tokens.space.sm,
  },
  primaryCtaText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    fontSize: tokens.text.body,
  },
  countryUnlockCta: {
    width: "100%" as const,
    backgroundColor: tokens.color.gold,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    alignItems: "center" as const,
    marginTop: tokens.space.sm,
  },
  countryUnlockCtaText: {
    color: tokens.color.text,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    fontSize: tokens.text.body,
  },
  secondaryCta: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: "center" as const,
    width: "100%" as const,
    marginTop: tokens.space.sm,
  },
  secondaryCtaText: {
    color: tokens.color.text,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    fontSize: tokens.text.body,
  },
  restoreButton: {
    alignItems: "center" as const,
    paddingVertical: 12,
  },
  restoreText: {
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    fontSize: tokens.text.body,
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  activeCard: {
    alignItems: "center" as const,
    gap: tokens.space.md,
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  },
  activeText: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
  },
  sourceText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
  },
  expirationText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  sandboxCard: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.gold,
    backgroundColor: tokens.color.goldLight,
  },
  sandboxRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  sandboxTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.gold,
  },
  sandboxSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.gold,
    marginTop: 2,
  },
  coverageNote: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    padding: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  coverageNoteText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  promoLinkText: {
    color: tokens.color.subtext,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    textDecorationLine: "underline" as const,
  },
  promoCard: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 10,
  },
  promoLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  promoInputRow: {
    flexDirection: "row" as const,
    gap: 8,
    alignItems: "center" as const,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: tokens.color.bg,
  },
  promoSubmitBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  promoSubmitDisabled: {
    opacity: 0.4,
  },
  promoErrorText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: "#dc2626",
  },
  promoSuccessText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },
  monthlyCard: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 16,
    gap: 8,
    backgroundColor: tokens.color.surface,
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  bestValueBadge: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    backgroundColor: tokens.color.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
  },
  bestValueText: {
    fontSize: 9,
    fontWeight: "800" as const,
    fontFamily: tokens.font.bodyBold,
    color: "#fff",
    letterSpacing: 0.8,
  },
  monthlyHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  monthlyTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  monthlyMeta: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  trialFinePrint: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    marginTop: 8,
  },
  disclaimer: {
    fontSize: 10,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 14,
    opacity: 0.7,
  },
  legalFooter: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
  },
  legalLink: {
    fontSize: tokens.text.small,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    textDecorationLine: "underline" as const,
  },
  legalSeparator: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  tabRow: {
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    paddingVertical: 4,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "transparent" as const,
  },
  tabPillActive: {
    backgroundColor: tokens.color.teal,
  },
  tabPillText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.semibold,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.subtext,
  },
  tabPillTextActive: {
    color: "#FFFFFF",
  },
  faqSection: {
    gap: tokens.space.sm,
  },
  faqCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: 10,
  },
  faqHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  bottomCtaBar: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.color.bg,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingHorizontal: tokens.space.xl,
    paddingTop: 12,
  },
  bottomCtaButton: {
    width: "100%" as const,
    backgroundColor: tokens.color.primary,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    alignItems: "center" as const,
  },
  bottomCtaText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    fontSize: tokens.text.body,
  },
  bottomCtaFinePrint: {
    fontSize: 11,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    marginTop: 6,
  },
};
