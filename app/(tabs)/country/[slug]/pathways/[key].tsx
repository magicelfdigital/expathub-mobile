import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { Screen } from "@/components/Screen";
import { DecisionBriefCard } from "@/src/components/DecisionBriefCard";
import { LastReviewedPill } from "@/src/components/LastReviewedPill";
import { ProPaywall } from "@/src/components/ProPaywall";
import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getCountry, getPathways, getDecisionBrief } from "@/src/data";
import { getPassportNotes } from "@/data/passportNotes";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function PathwayScreen() {
  const router = useRouter();
  const { slug, key } = useLocalSearchParams<{ slug?: string; key?: string }>();
  const { user } = useAuth();
  const { selectedCountrySlug } = useCountry();
  const { hasFullAccess, hasCountryAccess, loading } = useSubscription();

  const urlSlug = typeof slug === "string" ? slug : "";
  const countrySlug = urlSlug || selectedCountrySlug || "";
  const pathwayKey = typeof key === "string" ? key : "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "Country";
    return getCountry(countrySlug)?.name ?? "Country";
  }, [countrySlug]);

  const pathway = useMemo(() => {
    return getPathways(countrySlug).find((p) => p.key === pathwayKey) || null;
  }, [countrySlug, pathwayKey]);

  const brief = useMemo(() => {
    return getDecisionBrief(countrySlug, pathwayKey);
  }, [countrySlug, pathwayKey]);

  const resolvedSlug = countrySlug || selectedCountrySlug || undefined;

  const hasAccess = !pathway?.premium || hasFullAccess || (resolvedSlug ? hasCountryAccess(resolvedSlug) : false);

  const briefOpenedRef = useRef(false);
  useEffect(() => {
    if (countrySlug && !briefOpenedRef.current) {
      trackEvent("decision_brief_opened", {
        countrySlug,
        pathwayKey: pathwayKey || "none",
      });
      briefOpenedRef.current = true;
    }
  }, [countrySlug, pathwayKey]);

  useEffect(() => {
    if (loading || !pathway) return;
    if (!pathway.premium) {
      console.log(`[GATE] Brief shown: pathway "${pathwayKey}" is not premium (free content)`);
    } else if (hasFullAccess) {
      console.log(`[GATE] Brief shown: hasFullAccess=true for premium pathway "${pathwayKey}"`);
    } else if (resolvedSlug && hasCountryAccess(resolvedSlug)) {
      console.log(`[GATE] Brief shown: hasCountryAccess("${resolvedSlug}")=true for premium pathway "${pathwayKey}"`);
    } else {
      console.log(`[GATE] Paywall shown: no entitlement for premium pathway "${pathwayKey}" in "${countrySlug}"`);
    }
  }, [loading, pathway, hasFullAccess, resolvedSlug, hasCountryAccess, pathwayKey, countrySlug]);

  async function openInApp(url: string) {
    await WebBrowser.openBrowserAsync(url, {
      enableBarCollapsing: true,
      showTitle: true,
    });
  }

  if (!pathway) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: tokens.space.xl, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: tokens.text.h3, fontWeight: tokens.weight.black, color: tokens.color.text }}>
            Pathway not found
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.color.primary, fontWeight: tokens.weight.black }}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
        </View>
      </Screen>
    );
  }

  if (pathway.premium && !hasAccess) {
    return (
      <Screen>
        <ProPaywall
          countrySlug={resolvedSlug}
          pathwayKey={pathwayKey}
          entryPoint="pathway"
          showClose
          onClose={() => router.back()}
        />
      </Screen>
    );
  }

  if (pathway.premium && hasAccess && !user) {
    return (
      <Screen>
        <View style={authGateStyles.container}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={authGateStyles.backButton}>
            <Ionicons name="arrow-back" size={24} color={tokens.color.text} />
          </Pressable>
          <View style={authGateStyles.card}>
            <View style={authGateStyles.iconCircle}>
              <Ionicons name="person" size={28} color={tokens.color.primary} />
            </View>
            <Text style={authGateStyles.title}>Sign in to access this content</Text>
            <Text style={authGateStyles.sub}>
              You have access to this Decision Brief. Sign in to view it and keep your access synced.
            </Text>
            <Pressable
              onPress={() => router.push("/auth")}
              style={({ pressed }) => [authGateStyles.cta, pressed && { opacity: 0.85 }]}
            >
              <Text style={authGateStyles.ctaText}>Sign In or Create Account</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PathwayContent pathway={pathway} countryName={countryName} openInApp={openInApp} brief={brief} countrySlug={countrySlug} pathwayKey={pathwayKey} />
    </Screen>
  );
}

type PathwayContentProps = {
  pathway: NonNullable<ReturnType<typeof getPathways>[number]>;
  countryName: string;
  openInApp: (url: string) => void;
  brief: ReturnType<typeof getDecisionBrief>;
  countrySlug?: string;
  pathwayKey?: string;
};

function PathwayContent({ pathway, countryName, openInApp, brief, countrySlug, pathwayKey }: PathwayContentProps) {
  const router = useRouter();
  const passportNotes = useMemo(
    () => getPassportNotes(countrySlug ?? "", pathwayKey ?? ""),
    [countrySlug, pathwayKey]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
      showsVerticalScrollIndicator={false}
    >
      {brief ? (
        <>
          <DecisionBriefCard brief={brief} countrySlug={countrySlug} pathwayKey={pathwayKey} />
          <View style={{ marginTop: tokens.space.sm }}>
            <LastReviewedPill
              lastReviewedAt={brief.lastReviewedAt}
              confidenceLevel={
                brief.meta?.confidenceLevel ??
                (brief.confidenceLevel === "High"
                  ? "high"
                  : brief.confidenceLevel === "Medium"
                    ? "medium"
                    : "low")
              }
            />
          </View>
        </>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.headerSection}>
        <View style={styles.evidenceLabel}>
          <Ionicons name="document-text" size={12} color={tokens.color.subtext} />
          <Text style={styles.evidenceLabelText}>Pathway details</Text>
        </View>
        <Text style={styles.h1}>{pathway.title}</Text>
        <View style={styles.countryTag}>
          <Ionicons name="location" size={12} color={tokens.color.primary} />
          <Text style={styles.contextText}>{countryName}</Text>
        </View>
        <Text style={styles.lead}>{pathway.summary}</Text>
      </View>

      {pathway.timeline || pathway.costRange ? (
        <View style={styles.infoRow}>
          {pathway.timeline ? (
            <View style={styles.infoCard}>
              <Ionicons name="time-outline" size={18} color={tokens.color.primary} />
              <Text style={styles.infoLabel}>Timeline</Text>
              <Text style={styles.infoValue}>{pathway.timeline}</Text>
            </View>
          ) : null}
          {pathway.costRange ? (
            <View style={styles.infoCard}>
              <Ionicons name="card-outline" size={18} color={tokens.color.primary} />
              <Text style={styles.infoLabel}>Estimated Cost</Text>
              <Text style={styles.infoValue}>{pathway.costRange}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typically suitable for</Text>
        <View style={styles.bullets}>
          {pathway.whoFor.map((w) => (
            <View key={w} style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
              <Text style={styles.bulletText}>{w}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typically not suitable for</Text>
        <View style={styles.bullets}>
          {pathway.notFor.map((n) => (
            <View key={n} style={styles.bulletRow}>
              <Ionicons name="close-circle" size={16} color="rgba(200,60,60,0.7)" />
              <Text style={styles.bulletText}>{n}</Text>
            </View>
          ))}
        </View>
      </View>

      {pathway.steps && pathway.steps.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Steps</Text>
          <View style={styles.stepsContainer}>
            {pathway.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {pathway.officialLinks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Official resources</Text>

          <View style={styles.listGap}>
            {pathway.officialLinks.map((l) => (
              <Pressable
                key={l.url}
                onPress={() => openInApp(l.url)}
                style={({ pressed }) => [styles.linkCard, pressed && styles.linkCardPressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkTitle}>{l.label}</Text>
                  <Text style={styles.linkSubtitle}>Open in-app</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={tokens.color.primary} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.note}>
            Open official sources, then confirm requirements with the consulate or a licensed
            professional for your specific situation.
          </Text>
        </View>
      ) : null}

      {passportNotes.length > 0 ? (
        <Pressable
          onPress={() => router.push({ pathname: "/(tabs)/country/[slug]/pathways/passport-notes" as any, params: { slug: countrySlug, key: pathwayKey } })}
          style={({ pressed }) => [styles.passportCard, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
        >
          <View style={styles.passportCardLeft}>
            <Ionicons name="earth" size={20} color="#0D8A8A" />
            <View style={{ flex: 1 }}>
              <Text style={styles.passportCardTitle}>Passport Notes</Text>
              <Text style={styles.passportCardSub}>{passportNotes.length} nationalities covered</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#0D8A8A" />
        </Pressable>
      ) : null}

      <Text style={styles.disclaimer}>
        ExpatHub provides high-level guidance only and does not offer legal or tax advice. Always
        verify eligibility and requirements with official government sources or licensed professionals.
      </Text>
    </ScrollView>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.lg },

  divider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginVertical: tokens.space.xs,
  },

  evidenceLabel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginBottom: 4,
  },
  evidenceLabelText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },

  headerSection: { gap: tokens.space.xs },
  h1: { fontSize: tokens.text.h1, fontWeight: tokens.weight.black, color: tokens.color.text },

  countryTag: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  contextText: { fontSize: tokens.text.small, color: tokens.color.primary, fontWeight: tokens.weight.bold },

  lead: { fontSize: tokens.text.body, color: tokens.color.subtext, lineHeight: 20 },

  infoRow: {
    flexDirection: "row" as const,
    gap: tokens.space.sm,
  },

  infoCard: {
    flex: 1,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 4,
    alignItems: "center" as const,
  },

  infoLabel: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontWeight: tokens.weight.bold,
    textAlign: "center" as const,
  },

  infoValue: {
    fontSize: tokens.text.small,
    color: tokens.color.text,
    textAlign: "center" as const,
    lineHeight: 16,
  },

  section: { gap: tokens.space.sm },
  sectionTitle: { fontSize: tokens.text.h3, fontWeight: tokens.weight.black, color: tokens.color.text },

  bullets: { gap: 8 },
  bulletRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  },
  bulletText: { flex: 1, color: tokens.color.text, lineHeight: 20 },

  stepsContainer: { gap: 12 },
  stepRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stepNumberText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
    fontSize: tokens.text.small,
  },
  stepText: {
    flex: 1,
    color: tokens.color.text,
    lineHeight: 20,
    paddingTop: 4,
  },

  listGap: { gap: tokens.space.sm },

  linkCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  linkCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  linkTitle: { fontSize: tokens.text.body, fontWeight: tokens.weight.black, color: tokens.color.text },
  linkSubtitle: { color: tokens.color.subtext, marginTop: 2, fontSize: tokens.text.small },

  note: { marginTop: 2, color: tokens.color.subtext, lineHeight: 18 },

  disclaimer: { marginTop: 4, fontSize: tokens.text.small, color: tokens.color.subtext, lineHeight: 16 },

  passportCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#E8DCC8",
    backgroundColor: "#FBF7EF",
  },
  passportCardLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  passportCardTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: "#1A5C5C",
  },
  passportCardSub: {
    fontSize: tokens.text.small,
    color: "#0D8A8A",
    marginTop: 2,
  },
} as const;

const authGateStyles = {
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    padding: tokens.space.xl,
    justifyContent: "center" as const,
  },
  backButton: {
    position: "absolute" as const,
    top: tokens.space.xl,
    left: tokens.space.xl,
    zIndex: 1,
    padding: 4,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    borderColor: tokens.color.primary,
    padding: tokens.space.xl,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  sub: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 20,
  },
  cta: {
    marginTop: tokens.space.sm,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.xl,
    alignItems: "center" as const,
    width: "100%" as const,
  },
  ctaText: {
    color: tokens.color.white,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
  },
} as const;
