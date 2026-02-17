import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { AvailabilityGate } from "@/src/components/AvailabilityGate";
import { getCountry, getCommunityLinks, getDefaultCommunityLinks } from "@/src/data";
import { openExternal } from "@/lib/openExternal";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const typeIcons: Record<string, string> = {
  Meetups: "calendar-outline",
  Forums: "chatbubbles-outline",
  Facebook: "logo-facebook",
  "Expat groups": "people-outline",
  General: "link-outline",
  Discord: "logo-discord",
  WhatsApp: "logo-whatsapp",
};

export default function CountryCommunityScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const countrySlug = typeof slug === "string" ? slug : "";

  return (
    <Screen>
      <AvailabilityGate countrySlug={countrySlug} section="community">
        <CommunityContent countrySlug={countrySlug} />
      </AvailabilityGate>
    </Screen>
  );
}

function CommunityContent({ countrySlug }: { countrySlug: string }) {
  const countryName = useMemo(() => {
    if (!countrySlug) return "this country";
    return getCountry(countrySlug)?.name ?? "this country";
  }, [countrySlug]);

  const links = useMemo(() => {
    const countryLinksList = getCommunityLinks(countrySlug);
    return countryLinksList.length > 0 ? countryLinksList : getDefaultCommunityLinks();
  }, [countrySlug]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.evidenceLabel}>
          <Ionicons name="people" size={12} color={tokens.color.subtext} />
          <Text style={styles.evidenceLabelText}>Supporting communities</Text>
        </View>
        <Text style={styles.h1}>Community</Text>
        <Text style={styles.lead}>Connect with people who have been through the process above.</Text>
        <View style={styles.countryTag}>
          <Ionicons name="location" size={12} color={tokens.color.primary} />
          <Text style={styles.context}>{countryName}</Text>
        </View>
      </View>

      <View style={styles.listGap}>
        {links.map((c) => (
          <Pressable
            key={c.url}
            onPress={() => openExternal(c.url)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardTop}>
              <Ionicons
                name={(typeIcons[c.type] || "link-outline") as any}
                size={20}
                color={tokens.color.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                {c.note ? <Text style={styles.cardSubtitle}>{c.note}</Text> : null}
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.type}</Text>
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

  header: { gap: tokens.space.xs },
  h1: { fontSize: tokens.text.h1, fontWeight: tokens.weight.black, color: tokens.color.text },
  lead: { fontSize: tokens.text.body, color: tokens.color.subtext, lineHeight: 18 },
  countryTag: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 2,
  },
  context: { fontSize: tokens.text.small, color: tokens.color.primary, fontWeight: tokens.weight.bold },

  listGap: { gap: 8 },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardTop: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  cardTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  cardSubtitle: { marginTop: 2, color: tokens.color.subtext, lineHeight: 18, fontSize: tokens.text.small },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  badgeText: { fontSize: 10, fontWeight: tokens.weight.black, color: tokens.color.primary },

  disclaimer: { marginTop: 8, fontSize: tokens.text.small, color: tokens.color.subtext, lineHeight: 16 },
} as const;
