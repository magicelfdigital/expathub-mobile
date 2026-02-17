import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { AvailabilityGate } from "@/src/components/AvailabilityGate";
import { useCountry } from "@/contexts/CountryContext";
import { getCountry, getVendors } from "@/src/data";
import { openExternal } from "@/lib/openExternal";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function CountryVendorsScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug } = useCountry();
  const urlSlug = typeof slug === "string" ? slug : "";
  const countrySlug = urlSlug || selectedCountrySlug || "";

  return (
    <Screen>
      <AvailabilityGate countrySlug={countrySlug} section="vendors">
        <VendorsContent countrySlug={countrySlug} />
      </AvailabilityGate>
    </Screen>
  );
}

function VendorsContent({ countrySlug }: { countrySlug: string }) {
  const countryName = useMemo(() => {
    if (!countrySlug) return "this country";
    return getCountry(countrySlug)?.name ?? "this country";
  }, [countrySlug]);

  const vendors = useMemo(() => {
    const countryVendors = getVendors(countrySlug);
    if (countryVendors.length > 0) return countryVendors;
    return [
      {
        name: "Find licensed providers (search)",
        category: "Directory",
        url: `https://www.google.com/search?q=${encodeURIComponent(countryName + " immigration lawyer directory")}`,
      },
    ];
  }, [countrySlug, countryName]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.evidenceLabel}>
          <Ionicons name="briefcase" size={12} color={tokens.color.subtext} />
          <Text style={styles.evidenceLabelText}>Supporting vendors</Text>
        </View>
        <Text style={styles.h1}>Vendors</Text>
        <Text style={styles.lead}>Licensed professionals who can help with the process above.</Text>
        <View style={styles.countryTag}>
          <Ionicons name="location" size={12} color={tokens.color.primary} />
          <Text style={styles.context}>{countryName}</Text>
        </View>
      </View>

      <View style={styles.listGap}>
        {vendors.map((v) => (
          <Pressable
            key={v.url}
            onPress={() => openExternal(v.url)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{v.name}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{v.category}</Text>
              </View>
            </View>

            {v.note ? <Text style={styles.cardSubtitle}>{v.note}</Text> : null}

            <View style={styles.ctaRow}>
              <Text style={styles.cardCta}>Open</Text>
              <Text style={styles.cardCtaChevron}>&#8599;</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        Use licensed professionals and verify credentials. ExpatHub does not endorse providers yet.
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

  listGap: { gap: tokens.space.sm },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: 8,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardTop: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: tokens.space.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  cardSubtitle: { color: tokens.color.subtext, lineHeight: 18 },
  ctaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 2,
  },
  cardCta: { fontWeight: tokens.weight.black, color: tokens.color.primary },
  cardCtaChevron: { fontSize: 14, color: tokens.color.primary },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  badgeText: { fontSize: tokens.text.small, fontWeight: tokens.weight.black, color: tokens.color.primary },

  disclaimer: { marginTop: 8, fontSize: tokens.text.small, color: tokens.color.subtext, lineHeight: 16 },
} as const;
