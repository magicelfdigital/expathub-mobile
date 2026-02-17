import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getCountry, getCommunityLinks, getDefaultCommunityLinks } from "@/src/data";
import { openExternal } from "@/lib/openExternal";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const PREVIEW_FEATURES = [
  {
    icon: "people-outline" as const,
    title: "Country-specific groups",
    description: "Curated expat communities, meetups, and forums for your destination.",
  },
  {
    icon: "chatbubbles-outline" as const,
    title: "Vetted forums and channels",
    description: "Discord servers, WhatsApp groups, and Facebook communities filtered for quality.",
  },
  {
    icon: "calendar-outline" as const,
    title: "Local meetups and events",
    description: "In-person gatherings organized by expats already living in your target country.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Safety-checked links",
    description: "Every link reviewed so you avoid scams, spam groups, and outdated resources.",
  },
];

const typeIcons: Record<string, string> = {
  Meetups: "calendar-outline",
  Forums: "chatbubbles-outline",
  Facebook: "logo-facebook",
  "Expat groups": "people-outline",
  General: "link-outline",
  Discord: "logo-discord",
  WhatsApp: "logo-whatsapp",
};

export default function CommunityScreen() {
  const router = useRouter();
  const { hasActiveSubscription } = useSubscription();
  const { selectedCountrySlug } = useCountry();

  if (hasActiveSubscription) {
    return (
      <Screen>
        <UnlockedCommunity countrySlug={selectedCountrySlug} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="people" size={28} color={tokens.color.primary} />
          </View>
          <Text style={styles.h1}>Community</Text>
          <Text style={styles.lead}>
            Connect with fellow expats, find trusted local groups, and get advice from people who have done it.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Decision Access includes</Text>
          <View style={styles.listGap}>
            {PREVIEW_FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <View style={styles.featureIconCircle}>
                  <Ionicons name={f.icon} size={20} color={tokens.color.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.ctaCard}>
          <Ionicons name="lock-closed" size={20} color="#92400e" />
          <Text style={styles.ctaTitle}>Community links are included with Decision Access</Text>
          <Text style={styles.ctaSubtitle}>
            Access vetted communities alongside Decision Briefs that explain what work is allowed, when sponsorship is required, and which visas close doors later.
          </Text>
          <Pressable
            onPress={() => router.push("/subscribe" as any)}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          >
            <Text style={styles.ctaButtonText}>Start your 30-day decision window</Text>
            <Ionicons name="arrow-forward" size={14} color={tokens.color.white} />
          </Pressable>
        </View>

        <Text style={styles.disclaimer}>
          Community links are available per-country inside each country hub with Decision Access.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function UnlockedCommunity({ countrySlug }: { countrySlug: string | null }) {
  const countryName = useMemo(() => {
    if (!countrySlug) return null;
    return getCountry(countrySlug)?.name ?? null;
  }, [countrySlug]);

  const links = useMemo(() => {
    if (countrySlug) {
      const countryLinks = getCommunityLinks(countrySlug);
      if (countryLinks.length > 0) return countryLinks;
    }
    return getDefaultCommunityLinks();
  }, [countrySlug]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="people" size={28} color={tokens.color.primary} />
        </View>
        <Text style={styles.h1}>Community</Text>
        <Text style={styles.lead}>
          {countryName
            ? `Vetted groups, forums, and meetups for expats in ${countryName}.`
            : "Select a country to see community links tailored to your destination."}
        </Text>
        {countryName ? (
          <View style={styles.countryTag}>
            <Ionicons name="location" size={12} color={tokens.color.primary} />
            <Text style={styles.countryTagText}>{countryName}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.listGap}>
        {links.map((c) => (
          <Pressable
            key={c.url}
            onPress={() => openExternal(c.url)}
            style={({ pressed }) => [styles.linkCard, pressed && styles.linkCardPressed]}
          >
            <View style={styles.linkCardTop}>
              <Ionicons
                name={(typeIcons[c.type] || "link-outline") as any}
                size={20}
                color={tokens.color.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{c.name}</Text>
                {c.note ? <Text style={styles.linkSubtitle}>{c.note}</Text> : null}
              </View>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{c.type}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        Safety note: verify group credibility and avoid sharing sensitive personal or financial details.
      </Text>
    </ScrollView>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.lg },

  header: {
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
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  lead: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    textAlign: "center" as const,
  },

  countryTag: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 2,
  },
  countryTagText: {
    fontSize: tokens.text.small,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },

  section: { gap: tokens.space.sm },
  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  listGap: { gap: tokens.space.sm },

  featureCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
  },
  featureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 2,
  },
  featureTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  featureDesc: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
    marginTop: 2,
  },

  ctaCard: {
    backgroundColor: "#fef3c7",
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: tokens.space.xl,
    gap: tokens.space.sm,
    alignItems: "center" as const,
  },
  ctaTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: "#92400e",
    textAlign: "center" as const,
  },
  ctaSubtitle: {
    fontSize: tokens.text.body,
    color: "#78350f",
    textAlign: "center" as const,
    lineHeight: 20,
  },
  ctaButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: tokens.space.sm,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
  },
  ctaButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  ctaButtonText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
    fontSize: tokens.text.body,
  },

  linkCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
  },
  linkCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  linkCardTop: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  linkTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  linkSubtitle: {
    marginTop: 2,
    color: tokens.color.subtext,
    lineHeight: 18,
    fontSize: tokens.text.small,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  disclaimer: {
    marginTop: 8,
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 16,
  },
} as const;
