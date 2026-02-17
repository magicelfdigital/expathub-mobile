import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getCountry, getPathways, getCountryCoverage, isDecisionReady, isLaunchCountry } from "@/src/data";
import { COUNTRY_LIFETIME_PRICES } from "@/src/config/subscription";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

type NavItem = {
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
};

function NavCard({ title, subtitle, icon, onPress }: NavItem) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardLeft}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon as any} size={20} color={tokens.color.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>{subtitle}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={tokens.color.primary} />
    </Pressable>
  );
}

function CoverageBadge({ status }: { status: "decision-ready" | "coming-soon" }) {
  const isReady = status === "decision-ready";

  return isReady ? (
    <View style={styles.readyBadge}>
      <Ionicons name="checkmark-circle" size={10} color={tokens.color.primary} />
      <Text style={styles.readyBadgeText}>Full Guide</Text>
    </View>
  ) : (
    <View style={styles.soonBadge}>
      <Ionicons name="time-outline" size={10} color="#6b7280" />
      <Text style={styles.soonBadgeText}>In Progress</Text>
    </View>
  );
}

function CoverageRow({ label, status }: { label: string; status: "decision-ready" | "coming-soon" }) {
  const isReady = status === "decision-ready";

  return (
    <View style={styles.coverageRow}>
      <Ionicons
        name={isReady ? "checkmark-circle" : "time-outline"}
        size={16}
        color={isReady ? tokens.color.primary : "#6b7280"}
      />
      <Text style={isReady ? styles.coverageReadyText : styles.coverageSoonText}>{label}</Text>
      <Text style={isReady ? styles.coverageTag : styles.coverageSoonTag}>
        {isReady ? "Full Guide" : "In Progress"}
      </Text>
    </View>
  );
}

export default function CountryDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug, setSelectedCountrySlug } = useCountry();
  const { hasActiveSubscription, hasFullAccess, hasCountryAccess, accessType, decisionPassDaysLeft } = useSubscription();

  const urlSlug = typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : "";

  React.useEffect(() => {
    if (urlSlug && !selectedCountrySlug) {
      setSelectedCountrySlug(urlSlug);
    }
  }, []);

  const countrySlug = selectedCountrySlug || urlSlug || "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "Country";
    return getCountry(countrySlug)?.name ?? "Country";
  }, [countrySlug]);

  const pathways = useMemo(() => getPathways(countrySlug), [countrySlug]);

  const coverage = useMemo(() => getCountryCoverage(countrySlug), [countrySlug]);
  const hasCoverage = coverage.ready.length > 0 || coverage.soon.length > 0;
  const isLaunch = useMemo(() => isLaunchCountry(countrySlug), [countrySlug]);

  const hasAccess = hasFullAccess || hasCountryAccess(countrySlug);
  const countryPrice = COUNTRY_LIFETIME_PRICES[countrySlug] ?? "$19.99";

  const go = (leaf: string) => {
    if (!countrySlug) return;
    router.push({ pathname: `/(tabs)/country/[slug]/${leaf}` as any, params: { slug: countrySlug } });
  };

  const goPathway = (key: string) => {
    router.push({ pathname: "/(tabs)/country/[slug]/pathways/[key]" as any, params: { slug: countrySlug, key } });
  };

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{countryName}</Text>
          <Text style={styles.subtitle}>
            {isLaunch
              ? "Explore residency pathways, resources, and community."
              : "Full coverage for this country is coming soon."}
          </Text>
          {isLaunch ? (
            <View style={styles.passportNotice}>
              <Ionicons name="earth" size={12} color="#0D8A8A" />
              <Text style={styles.passportNoticeText}>
                Passport Notes on each pathway cover 7 nationalities including US, UK, EU, and more
              </Text>
            </View>
          ) : null}
        </View>

        {hasAccess && accessType === "decision_pass" && decisionPassDaysLeft != null ? (
          <View style={styles.accessBanner}>
            <Ionicons name="shield-checkmark" size={16} color={tokens.color.primary} />
            <Text style={styles.accessBannerText}>
              Decision Pass active â€” {decisionPassDaysLeft} days remaining
            </Text>
          </View>
        ) : hasAccess && accessType === "country_lifetime" ? (
          <View style={styles.accessBanner}>
            <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
            <Text style={styles.accessBannerText}>
              {countryName} unlocked \u2014 lifetime access
            </Text>
          </View>
        ) : !hasAccess && isLaunch ? (
          <Pressable
            style={({ pressed }) => [styles.unlockBanner, pressed && styles.cardPressed]}
            onPress={() => router.push({ pathname: "/subscribe" as any, params: { country: countrySlug } })}
          >
            <View style={styles.unlockBannerLeft}>
              <Ionicons name="lock-open" size={18} color={tokens.color.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.unlockBannerTitle}>Make a confident relocation decision</Text>
                <Text style={styles.unlockBannerSub}>
                  30-day access from {`$29`} or unlock {countryName} forever for {countryPrice}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
          </Pressable>
        ) : null}

        {!isLaunch ? (
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonIconRow}>
              <View style={styles.comingSoonIconCircle}>
                <Ionicons name="time-outline" size={24} color="#6b7280" />
              </View>
            </View>
            <Text style={styles.comingSoonTitle}>Coming Soon</Text>
            <Text style={styles.comingSoonBody}>
              We're building full guide coverage, verified vendor lists, and community links for {countryName}. Pathway overviews below are available now â€” complete guides are on the way.
            </Text>
          </View>
        ) : null}

        {hasCoverage ? (
          <View style={styles.coverageSection}>
            <Text style={styles.sectionTitle}>Guide Status</Text>
            {coverage.ready.length > 0 ? (
              <View style={styles.coverageGroup}>
                {coverage.ready.map((item) => (
                  <CoverageRow key={item.pathwayKey ?? "country"} label={item.label} status="decision-ready" />
                ))}
              </View>
            ) : null}
            {coverage.soon.length > 0 ? (
              <View style={styles.coverageGroup}>
                {coverage.soon.map((item) => (
                  <CoverageRow key={item.pathwayKey ?? "country"} label={item.label} status="coming-soon" />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.listGap}>
          <NavCard title="Resources" subtitle="Guides, official links, checklists" icon="document-text-outline" onPress={() => go("resources")} />
          <NavCard title="Vendors" subtitle="Licensed professionals and services" icon="briefcase-outline" onPress={() => go("vendors")} />
          <NavCard title="Community" subtitle="Groups, forums, meetups" icon="people-outline" onPress={() => go("community")} />
        </View>

        {pathways.length > 0 ? (
          <View style={styles.pathwaySection}>
            <Text style={styles.sectionTitle}>Residency Pathways</Text>
            <View style={styles.listGap}>
              {pathways.map((p) => {
                const ready = isDecisionReady(countrySlug, p.key);
                const showCoverageBadge = p.premium;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => goPathway(p.key)}
                    style={({ pressed }) => [styles.pathwayCard, pressed && styles.cardPressed]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.pathwayTitleRow}>
                        <Text style={styles.pathwayTitle}>{p.title}</Text>
                        {showCoverageBadge ? (
                          <CoverageBadge status={ready ? "decision-ready" : "coming-soon"} />
                        ) : null}
                      </View>
                      <Text style={styles.pathwaySub} numberOfLines={2}>{p.summary}</Text>
                    </View>
                    <View style={styles.pathwayRight}>
                      {p.premium && !hasAccess ? (
                        <View style={styles.lockedBadge}>
                          <Ionicons name="lock-closed" size={10} color="#92400e" />
                          <Text style={styles.lockedText}>PRO</Text>
                        </View>
                      ) : p.premium && hasAccess ? (
                        <View style={styles.premiumBadge}>
                          <Ionicons name="checkmark" size={10} color={tokens.color.primary} />
                          <Text style={styles.premiumText}>PRO</Text>
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
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
    color: tokens.color.text,
  },

  subtitle: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  passportNotice: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    marginTop: 6,
  },
  passportNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#0D8A8A",
    lineHeight: 15,
  },

  accessBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },

  accessBannerText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  },

  unlockBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: "#FBF7EF",
    borderWidth: 1,
    borderColor: "#E8DCC8",
  },

  unlockBannerLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
  },

  unlockBannerTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: "#1A5C5C",
  },

  unlockBannerSub: {
    fontSize: tokens.text.small,
    color: "#0D8A8A",
    marginTop: 1,
  },

  coverageSection: {
    gap: tokens.space.sm,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },

  coverageGroup: {
    gap: 8,
  },

  coverageRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },

  coverageReadyText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.text,
    fontWeight: tokens.weight.bold,
  },

  coverageTag: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    overflow: "hidden" as const,
  },

  coverageSoonText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  },

  coverageSoonTag: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    color: "#6b7280",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: "#f3f4f6",
    overflow: "hidden" as const,
  },

  listGap: {
    gap: tokens.space.sm,
  },

  card: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },

  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  cardLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  cardTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  cardSub: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
    marginTop: 2,
  },

  pathwaySection: {
    gap: tokens.space.sm,
  },

  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  pathwayCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: tokens.space.sm,
  },

  pathwayTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flexWrap: "wrap" as const,
  },

  pathwayTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  pathwaySub: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
    marginTop: 2,
  },

  pathwayRight: {
    alignItems: "center" as const,
    gap: 6,
  },

  readyBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
  },

  readyBadgeText: {
    fontSize: 9,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  soonBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: "#f3f4f6",
  },

  soonBadgeText: {
    fontSize: 9,
    fontWeight: tokens.weight.black,
    color: "#6b7280",
  },

  premiumBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },

  premiumText: {
    fontSize: 9,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  lockedBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },

  lockedText: {
    fontSize: 9,
    fontWeight: tokens.weight.black,
    color: "#92400e",
  },

  comingSoonCard: {
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },

  comingSoonIconRow: {
    marginBottom: tokens.space.xs,
  },

  comingSoonIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  comingSoonTitle: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: "#6b7280",
  },

  comingSoonBody: {
    fontSize: tokens.text.body,
    color: "#4b5563",
    lineHeight: 20,
    textAlign: "center" as const,
  },

} as const;
