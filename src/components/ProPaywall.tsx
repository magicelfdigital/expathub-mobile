import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getProOffer } from "@/src/data";
import type { ProOffer } from "@/src/data";
import {
  purchasePackage,
  restorePurchases,
  getOfferings,
  getManagementURL,
} from "@/src/subscriptions/revenuecat";
import type { OfferingPackage } from "@/src/subscriptions/revenuecat";
import { createCheckoutSession, createCustomerPortalSession } from "@/src/subscriptions/stripeWeb";
import {
  DECISION_PASS_PRICE,
  MONTHLY_PRICE,
  COUNTRY_LIFETIME_PRICES,
  RC_DECISION_PASS_PRODUCT,
  RC_MONTHLY_PRODUCT,
  getCountryLifetimeProductId,
  SANDBOX_ENABLED,
} from "@/src/config/subscription";
import { COVERAGE_SUMMARY } from "@/src/data";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";
import { COUNTRIES } from "@/data/countries";

type PaywallEntryPoint = "compare" | "brief" | "pathway" | "general" | "country";

type ProPaywallProps = {
  countrySlug?: string;
  pathwayKey?: string;
  entryPoint?: PaywallEntryPoint;
  showClose?: boolean;
  onClose?: () => void;
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
}: ProPaywallProps) {
  const router = useRouter();
  const { user } = useAuth();
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
    decisionPassExpiresAt,
    decisionPassDaysLeft,
    unlockedCountries,
    hasCountryAccess,
    setSandboxOverride,
    refresh,
    recordDecisionPassPurchase,
    recordCountryUnlock,
  } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const resolvedCountrySlug = countrySlug ?? selectedCountrySlug ?? undefined;
  const pendingPurchaseHandled = useRef(false);

  const offer: ProOffer = getProOffer(resolvedCountrySlug, pathwayKey);

  const resolvedEntryPoint: PaywallEntryPoint =
    entryPoint ?? (pathwayKey ? "pathway" : resolvedCountrySlug ? "country" : "general");

  const countryName = resolvedCountrySlug ? getCountryName(resolvedCountrySlug) : null;
  const countryPrice = resolvedCountrySlug ? (COUNTRY_LIFETIME_PRICES[resolvedCountrySlug] ?? "$69") : "$69";

  const alreadyHasCountry = resolvedCountrySlug ? hasCountryAccess(resolvedCountrySlug) : false;

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

    (async () => {
      try {
        const raw = await AsyncStorage.getItem("pending_purchase");
        if (!raw || cancelled) return;
        const pending = JSON.parse(raw) as { type: string; countrySlug: string | null };
        console.log(`[PURCHASE] User returned from auth, resuming pending purchase: ${JSON.stringify(pending)}`);
        pendingPurchaseHandled.current = true;
        await clearPendingPurchase();

        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;

        if (pending.type === "decision_pass") {
          await handleDecisionPassPurchase();
        } else if (pending.type === "country_lifetime" && pending.countrySlug) {
          console.log(`[PURCHASE] Resuming country_lifetime with stored slug=${pending.countrySlug}`);
          await handleCountryUnlock(pending.countrySlug);
        } else if (pending.type === "monthly") {
          await handleMonthlySubscribe();
        }
      } catch (e) {
        console.log(`[PURCHASE] Error resuming pending purchase: ${e}`);
        setError("We couldn't start your purchase automatically. Please tap the purchase button to try again.");
      }
    })();

    return () => { cancelled = true; };
  }, [user, entitlementLoading]);

  useEffect(() => {
    trackEvent("paywall_shown", {
      platform: Platform.OS,
      country: resolvedCountrySlug ?? "none",
      pathway: pathwayKey ?? "none",
      entryPoint: resolvedEntryPoint,
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || hasActiveSubscription) return;
    getOfferings().catch(() => {});
  }, [hasActiveSubscription]);

  async function handleDecisionPassPurchase() {
    if (!user) {
      console.log("[PURCHASE] Decision Pass tapped but user not logged in — redirecting to auth");
      await storePendingPurchase("decision_pass", resolvedCountrySlug);
      router.push("/auth?mode=register");
      return;
    }
    setBusy(true);
    setError(null);
    trackEvent("purchase_tapped", { type: "decision_pass", platform: Platform.OS });
    console.log(`[PURCHASE] Decision Pass tapped, productId=${RC_DECISION_PASS_PRODUCT}`);
    try {
      if (Platform.OS === "web") {
        if (__DEV__) {
          console.log("[PURCHASE] DEV MODE: Simulating Decision Pass purchase on web");
          await recordDecisionPassPurchase();
          trackEvent("purchase_success", { type: "decision_pass", platform: "web", status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        setError("The 30-Day Decision Pass is available on the mobile app. Open ExpatHub on your phone to purchase.");
        return;
      }
      const result = await purchasePackage(RC_DECISION_PASS_PRODUCT);
      console.log(`[PURCHASE] Decision Pass result: status=${result.status}, hasProAccess=${result.hasProAccess}`);
      if (result.status === "cancelled") {
        if (__DEV__) {
          console.log("[PURCHASE] DEV MODE: Purchase cancelled/unavailable — simulating success");
          await recordDecisionPassPurchase();
          trackEvent("purchase_success", { type: "decision_pass", platform: Platform.OS, status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        console.log("[PURCHASE] Decision Pass: user cancelled payment");
        trackEvent("purchase_cancelled", { type: "decision_pass", platform: Platform.OS });
        setError(null);
        return;
      }
      if ((result.status === "purchased" || result.status === "already_owned") && result.hasProAccess) {
        await recordDecisionPassPurchase();
        trackEvent("purchase_success", { type: "decision_pass", platform: Platform.OS, status: result.status });
        await refresh();
        console.log(`[PURCHASE] Decision Pass ${result.status}, closing paywall`);
        if (onClose) onClose();
        else router.back();
      } else {
        console.log(`[PURCHASE] Decision Pass: status=${result.status} but no entitlement active`);
        setError("Purchase could not be confirmed. Please try again or restore purchases.");
      }
    } catch (e: any) {
      if (__DEV__) {
        console.log(`[PURCHASE] DEV MODE: Purchase error (${e?.message}) — simulating success`);
        await recordDecisionPassPurchase();
        trackEvent("purchase_success", { type: "decision_pass", platform: Platform.OS, status: "dev_simulated" });
        await refresh();
        if (onClose) onClose();
        else router.back();
        return;
      }
      const msg = e?.message ?? "Unknown error";
      console.log(`[PURCHASE] Decision Pass error: ${msg}`);
      trackEvent("purchase_error", { type: "decision_pass", error: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCountryUnlock(slugOverride?: string) {
    const slug = slugOverride ?? resolvedCountrySlug;
    if (!slug) return;
    if (!user) {
      console.log(`[PURCHASE] Country unlock tapped but user not logged in — storing slug=${slug}, redirecting to auth`);
      await storePendingPurchase("country_lifetime", slug);
      router.push("/auth?mode=register");
      return;
    }
    setBusy(true);
    setError(null);
    const productId = getCountryLifetimeProductId(slug);
    trackEvent("purchase_tapped", { type: "country_lifetime", country: slug, platform: Platform.OS });
    console.log(`[PURCHASE] Country unlock initiated, slug=${slug}, productId=${productId}${slugOverride ? " (from pending purchase)" : ""}`);
    try {
      if (Platform.OS === "web") {
        if (__DEV__) {
          console.log(`[PURCHASE] DEV MODE: Simulating country unlock for ${slug} on web`);
          await recordCountryUnlock(slug);
          trackEvent("purchase_success", { type: "country_lifetime", country: slug, platform: "web", status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        setError("Country unlocks are available on the mobile app. Open ExpatHub on your phone to purchase.");
        return;
      }
      const result = await purchasePackage(productId);
      console.log(`[PURCHASE] Country unlock result: status=${result.status}, hasProAccess=${result.hasProAccess}, slug=${slug}`);
      if (result.status === "cancelled") {
        if (__DEV__) {
          console.log(`[PURCHASE] DEV MODE: Country unlock cancelled/unavailable for ${slug} — simulating success`);
          await recordCountryUnlock(slug);
          trackEvent("purchase_success", { type: "country_lifetime", country: slug, platform: Platform.OS, status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        console.log(`[PURCHASE] Country unlock: user cancelled payment for ${slug}`);
        trackEvent("purchase_cancelled", { type: "country_lifetime", country: slug, platform: Platform.OS });
        setError(null);
        return;
      }
      if ((result.status === "purchased" || result.status === "already_owned") && result.hasProAccess) {
        await recordCountryUnlock(slug);
        trackEvent("purchase_success", { type: "country_lifetime", country: slug, platform: Platform.OS, status: result.status });
        await refresh();
        console.log(`[PURCHASE] Country unlock ${result.status} for ${slug}, closing paywall`);
        if (onClose) onClose();
        else router.back();
      } else {
        console.log(`[PURCHASE] Country unlock: status=${result.status} but no entitlement active for ${slug}`);
        setError("Purchase could not be confirmed. Please try again or restore purchases.");
      }
    } catch (e: any) {
      if (__DEV__) {
        console.log(`[PURCHASE] DEV MODE: Country unlock error for ${slug} (${e?.message}) — simulating success`);
        await recordCountryUnlock(slug);
        trackEvent("purchase_success", { type: "country_lifetime", country: slug, platform: Platform.OS, status: "dev_simulated" });
        await refresh();
        if (onClose) onClose();
        else router.back();
        return;
      }
      const msg = e?.message ?? "Unknown error";
      console.log(`[PURCHASE] Country unlock error for ${slug}: ${msg}`);
      trackEvent("purchase_error", { type: "country_lifetime", country: slug, error: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleMonthlySubscribe() {
    if (!user) {
      console.log("[PURCHASE] Monthly tapped but user not logged in — redirecting to auth");
      await storePendingPurchase("monthly", resolvedCountrySlug);
      router.push("/auth?mode=register");
      return;
    }
    setBusy(true);
    setError(null);
    trackEvent("purchase_tapped", { type: "monthly_subscription", platform: Platform.OS });
    console.log(`[PURCHASE] Monthly subscription tapped, productId=${RC_MONTHLY_PRODUCT}`);
    try {
      if (Platform.OS === "web") {
        if (__DEV__) {
          console.log("[PURCHASE] DEV MODE: Simulating monthly subscription on web");
          await recordDecisionPassPurchase();
          trackEvent("purchase_success", { type: "monthly_subscription", platform: "web", status: "dev_simulated" });
          await refresh();
          if (onClose) onClose();
          else router.back();
          return;
        }
        const priceId = process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID;
        if (!priceId) {
          setError("Payment is not configured yet. Please try again later.");
          return;
        }
        const url = await createCheckoutSession(priceId);
        if (url) {
          window.location.href = url;
        }
      } else {
        const result = await purchasePackage(RC_MONTHLY_PRODUCT);
        console.log(`[PURCHASE] Monthly result: status=${result.status}, hasProAccess=${result.hasProAccess}`);
        if (result.status === "cancelled") {
          if (__DEV__) {
            console.log("[PURCHASE] DEV MODE: Monthly cancelled/unavailable — simulating success");
            await recordDecisionPassPurchase();
            trackEvent("purchase_success", { type: "monthly_subscription", platform: Platform.OS, status: "dev_simulated" });
            await refresh();
            if (onClose) onClose();
            else router.back();
            return;
          }
          console.log("[PURCHASE] Monthly: user cancelled payment");
          trackEvent("purchase_cancelled", { type: "monthly_subscription", platform: Platform.OS });
          setError(null);
          return;
        }
        if ((result.status === "purchased" || result.status === "already_owned") && result.hasProAccess) {
          trackEvent("purchase_success", { type: "monthly_subscription", platform: Platform.OS, status: result.status });
          await refresh();
          console.log(`[PURCHASE] Monthly subscription ${result.status}, closing paywall`);
          if (onClose) onClose();
          else router.back();
        } else {
          console.log(`[PURCHASE] Monthly: status=${result.status} but no entitlement active`);
          setError("Subscription could not be confirmed. Please try again or restore purchases.");
        }
      }
    } catch (e: any) {
      if (__DEV__) {
        console.log(`[PURCHASE] DEV MODE: Monthly error (${e?.message}) — simulating success`);
        await recordDecisionPassPurchase();
        trackEvent("purchase_success", { type: "monthly_subscription", platform: Platform.OS, status: "dev_simulated" });
        await refresh();
        if (onClose) onClose();
        else router.back();
        return;
      }
      const msg = e?.message ?? "Unknown error";
      console.log(`[PURCHASE] Monthly subscription error: ${msg}`);
      trackEvent("purchase_error", { type: "monthly_subscription", error: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    trackEvent("restore_tapped", { platform: Platform.OS });
    try {
      const result = await restorePurchases();
      await refresh();
      if (result.hasProAccess) {
        trackEvent("restore_success", { platform: Platform.OS });
      } else {
        trackEvent("restore_not_found", { platform: Platform.OS });
        setError("We couldn't find an active purchase linked to your account. If you purchased on a different platform, try restoring there.");
      }
    } catch (e: any) {
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

  function handleClose() {
    trackEvent("paywall_dismissed", {
      countrySlug: resolvedCountrySlug ?? "none",
      pathwayKey: pathwayKey ?? "none",
    });
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as any);
  }

  if (entitlementLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
        <Text style={s.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={[s.scrollContent, { paddingTop: Math.max(insets.top + 8, tokens.space.xl) }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={handleClose} hitSlop={12} style={s.closeButton}>
        <Ionicons name="close" size={24} color={tokens.color.text} />
      </Pressable>

      <View style={s.header}>
        <View style={s.proIconCircle}>
          <Ionicons name="shield-checkmark" size={28} color={tokens.color.primary} />
        </View>
        <Text style={s.h1}>
          {resolvedCountrySlug ? `Unlock ${countryName}` : "Make a confident relocation decision"}
        </Text>
        <Text style={s.lead}>
          Compare countries, understand risks, and avoid costly mistakes
        </Text>
        <Text style={s.subLead}>
          Decision Briefs explain what work is actually allowed, when sponsorship is required, and which visas quietly close doors later.
        </Text>
      </View>

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
              <Ionicons name="alert" size={14} color="#b45309" />
            </View>
            <Text style={s.bulletText}>{m}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={s.errorCard}>
          <Ionicons name="information-circle" size={18} color="#b45309" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {hasFullAccess ? (
        <View style={s.activeCard}>
          <Ionicons name="checkmark-circle" size={24} color={tokens.color.primary} />
          <Text style={s.activeText}>You have full access</Text>
          <Text style={s.sourceText}>
            {accessType === "decision_pass"
              ? `Decision Pass — ${decisionPassDaysLeft ?? 0} days left`
              : accessType === "subscription"
                ? "Monthly subscription"
                : accessType === "sandbox"
                  ? "Sandbox mode (testing)"
                  : ""}
          </Text>
          {decisionPassExpiresAt ? (
            <Text style={s.expirationText}>
              Expires {new Date(decisionPassExpiresAt).toLocaleDateString()}
            </Text>
          ) : expirationDate ? (
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
      ) : alreadyHasCountry && resolvedCountrySlug ? (
        <View style={s.activeCard}>
          <Ionicons name="checkmark-circle" size={24} color={tokens.color.primary} />
          <Text style={s.activeText}>{countryName} unlocked</Text>
          <Text style={s.sourceText}>Lifetime access to this country's Decision Briefs</Text>
        </View>
      ) : (
        <>
          <View style={s.pricingSection}>
              <View style={[s.pricingCard, s.primaryCard]}>
                <View style={s.pricingHeader}>
                  <Ionicons name="compass" size={22} color={tokens.color.primary} />
                  <Text style={s.pricingTitle}>30-Day Decision Access</Text>
                </View>
                <View style={s.priceRow}>
                  <Text style={s.priceAmount}>{DECISION_PASS_PRICE}</Text>
                  <Text style={s.priceUnit}>one-time</Text>
                </View>
                <Text style={s.pricingDesc}>
                  Full access to all 8 countries for 30 days. Ideal if you're actively comparing destinations.
                </Text>
                <View style={s.pricingBullets}>
                  <View style={s.pricingBulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                    <Text style={s.pricingBulletText}>All 8 Decision Briefs</Text>
                  </View>
                  <View style={s.pricingBulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                    <Text style={s.pricingBulletText}>Side-by-side comparisons</Text>
                  </View>
                  <View style={s.pricingBulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                    <Text style={s.pricingBulletText}>No auto-renewal</Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleDecisionPassPurchase}
                  disabled={busy}
                  style={({ pressed }) => [s.primaryCta, pressed && s.ctaPressed]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={tokens.color.white} />
                  ) : (
                    <Text style={s.primaryCtaText}>Start 30-Day Decision Access - {DECISION_PASS_PRICE}</Text>
                  )}
                </Pressable>
              </View>

              {resolvedCountrySlug ? (
                <Pressable
                  onPress={() => handleCountryUnlock()}
                  disabled={busy}
                  style={({ pressed }) => [s.secondaryCta, pressed && s.ctaPressed]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={tokens.color.text} />
                  ) : (
                    <Text style={s.secondaryCtaText}>Unlock {countryName} Forever - {countryPrice}</Text>
                  )}
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleMonthlySubscribe}
                disabled={busy}
                style={({ pressed }) => [s.secondaryCta, pressed && s.ctaPressed]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={tokens.color.text} />
                ) : (
                  <Text style={s.secondaryCtaText}>Continue with Monthly Access - {MONTHLY_PRICE}</Text>
                )}
              </Pressable>
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

          <View style={s.coverageNote}>
            <Ionicons name="information-circle-outline" size={16} color={tokens.color.subtext} />
            <Text style={s.coverageNoteText}>
              Full guides available: {COVERAGE_SUMMARY.ready}. Coming soon: {COVERAGE_SUMMARY.soon}.
            </Text>
          </View>
        </>
      )}

      {sandboxMode ? (
        <View style={s.sandboxCard}>
          <View style={s.sandboxRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.sandboxTitle}>Sandbox Mode</Text>
              <Text style={s.sandboxSub}>Toggle Pro access for testing</Text>
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
            ? "Payment will be charged to your Apple ID account. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. The Decision Pass and country unlocks are one-time purchases."
            : "Subscriptions renew automatically. Cancel anytime in Google Play Store settings. The Decision Pass and country unlocks are one-time purchases."}
      </Text>
    </ScrollView>
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
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  lead: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
    fontWeight: tokens.weight.bold,
    lineHeight: 22,
    textAlign: "center" as const,
  },
  subLead: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
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
    color: "#991b1b",
    marginBottom: 2,
  },
  ruledOutText: {
    flex: 1,
    fontSize: tokens.text.body,
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
    backgroundColor: "#fef3c7",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  mistakeCard: {
    backgroundColor: "#fffbeb",
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: tokens.space.lg,
    gap: 10,
  },
  mistakeTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: "#92400e",
    marginBottom: 2,
  },
  errorCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  errorText: {
    flex: 1,
    fontSize: tokens.text.small,
    color: "#92400e",
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
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
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
    color: tokens.color.text,
  },
  pricingDesc: {
    fontSize: tokens.text.small,
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
    color: tokens.color.text,
  },
  priceUnit: {
    fontSize: tokens.text.body,
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
    fontSize: tokens.text.body,
  },
  countryUnlockCta: {
    width: "100%" as const,
    backgroundColor: "#009C9C",
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    alignItems: "center" as const,
    marginTop: tokens.space.sm,
  },
  countryUnlockCtaText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
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
    fontSize: tokens.text.body,
  },
  restoreButton: {
    alignItems: "center" as const,
    paddingVertical: 12,
  },
  restoreText: {
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
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
    color: tokens.color.primary,
  },
  sourceText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    textAlign: "center" as const,
  },
  expirationText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },
  sandboxCard: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fef3c7",
  },
  sandboxRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  sandboxTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: "#92400e",
  },
  sandboxSub: {
    fontSize: tokens.text.small,
    color: "#b45309",
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
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 10,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 14,
    opacity: 0.7,
  },
};
