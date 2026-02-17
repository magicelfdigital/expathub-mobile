import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { getCountries, REGION_ORDER, sortCountriesAlpha } from "@/src/data";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function CountryIndexScreen() {
  const router = useRouter();
  const { selectedCountrySlug, setSelectedCountrySlug, isLoaded } = useCountry();
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = getCountries();
    const filtered = q
      ? all.filter((c) => c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q))
      : all;

    const byRegion: Record<string, typeof filtered> = {};
    for (const c of filtered) {
      if (!byRegion[c.region]) byRegion[c.region] = [];
      byRegion[c.region].push(c);
    }

    return REGION_ORDER
      .filter((r) => byRegion[r]?.length)
      .map((region) => ({
        region,
        countries: byRegion[region].sort(sortCountriesAlpha),
      }));
  }, [search]);

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.h1}>Countries</Text>
          <Text style={styles.lead}>Choose a destination to open its hub.</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={tokens.color.subtext} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={tokens.color.subtext}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} style={{ marginRight: 12 }}>
              <Ionicons name="close-circle" size={18} color={tokens.color.subtext} />
            </Pressable>
          )}
        </View>

        {!isLoaded ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtitle}>Loading...</Text>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtitle}>No countries match "{search}"</Text>
          </View>
        ) : (
          grouped.map(({ region, countries }) => (
            <View key={region} style={styles.regionSection}>
              <Text style={styles.regionTitle}>{region}</Text>
              <View style={styles.listGap}>
                {countries.map((c) => {
                  const isSelected = selectedCountrySlug === c.slug;
                  return (
                    <Pressable
                      key={c.slug}
                      onPress={() => {
                        console.log("NAV_COUNTRY", c.slug);
                        setSelectedCountrySlug(c.slug);
                        router.push({ pathname: "/(tabs)/country/[slug]", params: { slug: c.slug } } as any);
                      }}
                      style={[styles.rowCard, isSelected ? styles.rowCardSelected : null]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{c.name}</Text>
                      </View>

                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color={tokens.color.primary} />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.lg },

  header: { gap: tokens.space.xs },
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  lead: { fontSize: tokens.text.body, color: tokens.color.subtext, lineHeight: 18 },

  searchWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 6,
  },

  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: tokens.text.body,
    color: tokens.color.text,
  },

  regionSection: { gap: tokens.space.sm },

  regionTitle: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  cardSubtitle: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },

  listGap: { gap: 6 },

  rowCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.lg,
  },
  rowCardSelected: {
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  },

  rowTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
} as const;
