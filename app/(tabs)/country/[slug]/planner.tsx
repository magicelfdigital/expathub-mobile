import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { usePlan } from "@/src/contexts/PlanContext";
import { PlanModule } from "@/src/components/PlanModule";
import LifetimeOfferBanner from "@/src/components/LifetimeOfferBanner";
import PlanCompletionCard from "@/src/components/PlanCompletionCard";
import { getCountry, getPathways, isLaunchCountry } from "@/src/data";
import { tokens } from "@/theme/tokens";
import { PAID_TIER_DISPLAY_NAME } from "@/constants/tiers";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function PlannerScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug } = useCountry();
  const { hasActiveSubscription, hasFullAccess, hasCountryAccess } = useSubscription();
  const { activeCountrySlug: planCountrySlug, startPlan } = usePlan();

  const urlSlug = typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : "";
  const countrySlug = urlSlug || "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "Country";
    return getCountry(countrySlug)?.name ?? "Country";
  }, [countrySlug]);

  const pathways = useMemo(() => getPathways(countrySlug), [countrySlug]);
  const isLaunch = useMemo(() => isLaunchCountry(countrySlug), [countrySlug]);
  const hasAccess = hasFullAccess || hasCountryAccess(countrySlug);
  const hasPlanForThisCountry = planCountrySlug === countrySlug;
  const isPaidUser = hasActiveSubscription;

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Your Plan</Text>
          <Text style={styles.subtitle}>
            {hasPlanForThisCountry
              ? `Step-by-step relocation planner for ${countryName}.`
              : `Start a structured plan for ${countryName}.`}
          </Text>
        </View>

        {hasPlanForThisCountry ? (
          <View style={styles.planSection}>
            <PlanCompletionCard />
            <PlanModule />
            <LifetimeOfferBanner />
          </View>
        ) : isPaidUser && isLaunch && pathways.length > 0 ? (
          <View style={styles.focusSection}>
            <View style={styles.focusIconRow}>
              <View style={styles.focusIconCircle}>
                <Ionicons name="flag-outline" size={20} color={tokens.color.primary} />
              </View>
            </View>
            <Text style={styles.focusTitle}>Turn this into a structured plan</Text>
            <Text style={styles.focusBody}>
              If this country feels like a strong option, you can focus here and walk through the process step by step.
            </Text>
            <Pressable
              style={styles.focusButton}
              onPress={() => {
                const firstPathway = pathways[0];
                if (!firstPathway) return;
                startPlan(countrySlug, firstPathway.key, countryName);
              }}
            >
              <Ionicons name="flag" size={16} color={tokens.color.white} />
              <Text style={styles.focusButtonText}>Focus on {countryName}</Text>
            </Pressable>
            <Text style={styles.focusMicrocopy}>You can switch your focus at any time.</Text>
          </View>
        ) : !isPaidUser && isLaunch ? (
          <View style={styles.lockedSection}>
            <Ionicons name="lock-closed-outline" size={28} color={tokens.color.subtext} />
            <Text style={styles.lockedTitle}>Available with {PAID_TIER_DISPLAY_NAME} access</Text>
            <Text style={styles.lockedBody}>
              The relocation planner helps you walk through each stage of moving to {countryName}. Unlock access to get started.
            </Text>
            <Pressable
              style={styles.focusButton}
              onPress={() => router.push({ pathname: "/subscribe" as any, params: { country: countrySlug } })}
            >
              <Text style={styles.focusButtonText}>View plans</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.lockedSection}>
            <Ionicons name="time-outline" size={28} color={tokens.color.subtext} />
            <Text style={styles.lockedTitle}>Planner coming soon</Text>
            <Text style={styles.lockedBody}>
              The structured planner for {countryName} is not yet available. Check back soon.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.lg,
  },
  header: {
    gap: tokens.space.xs,
    marginBottom: tokens.space.sm,
  },
  title: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  subtitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  planSection: {
    gap: tokens.space.lg,
  },
  focusSection: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.xl,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  focusIconRow: {
    marginBottom: tokens.space.xs,
  },
  focusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  focusTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  focusBody: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    textAlign: "center" as const,
  },
  focusButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    paddingHorizontal: tokens.space.xl,
    marginTop: tokens.space.xs,
  },
  focusButtonText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  },
  focusMicrocopy: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
  },
  lockedSection: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.xl,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  lockedTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  lockedBody: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    textAlign: "center" as const,
  },
} as const;
