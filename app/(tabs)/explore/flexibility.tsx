import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { isLaunchCountry } from "@/src/data";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const COUNTRIES = [
  { slug: "canada", name: "Canada", label: "Express Entry — permanent residency from day one", pathwayKey: "express-entry" },
  { slug: "costa-rica", name: "Costa Rica", label: "Rentista — permanent residency eligible after 3 years", pathwayKey: "rentista" },
  { slug: "ecuador", name: "Ecuador", label: "Rentista — permanent residency eligible after ~2 years", pathwayKey: "rentista" },
  { slug: "panama", name: "Panama", label: "Friendly Nations — multiple pathways available", pathwayKey: "friendly-nations" },
  { slug: "portugal", name: "Portugal", label: "D7 or D8 — both lead to permanent residency and citizenship", pathwayKey: "d7" },
  { slug: "spain", name: "Spain", label: "NLV — permanent residency after 5 years (no work allowed)", pathwayKey: "nlv" },
];

export default function FlexibilityScreen() {
  const router = useRouter();
  const { setSelectedCountrySlug } = useCountry();

  const goPathway = (slug: string, pathwayKey: string) => {
    setSelectedCountrySlug(slug);
    router.push({ pathname: "/(tabs)/country/[slug]/pathways/[key]" as any, params: { slug, key: pathwayKey } });
  };

  return (
    <Screen>
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.h1}>Maximum flexibility</Text>
          <Text style={s.explainer}>
            If you're still figuring out your plan, these pathways keep your options open. They don't require employer sponsorship, let you transition later, and don't lock you into one arrangement. Tap to see the full pathway guide.
          </Text>
        </View>

        <View style={s.countryList}>
          {COUNTRIES.map((c) => {
            const launch = isLaunchCountry(c.slug);
            return (
              <Pressable
                key={c.slug}
                onPress={() => goPathway(c.slug, c.pathwayKey)}
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
              >
                <View style={s.info}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{c.name}</Text>
                    {launch ? (
                      <View style={s.readyBadge}>
                        <Ionicons name="checkmark-circle" size={10} color={tokens.color.primary} />
                        <Text style={s.readyText}>Ready</Text>
                      </View>
                    ) : (
                      <View style={s.soonBadge}>
                        <Ionicons name="time-outline" size={10} color="#6b7280" />
                        <Text style={s.soonText}>Coming soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.label} numberOfLines={2}>{c.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.xl },
  header: { gap: tokens.space.sm },
  h1: { fontSize: tokens.text.h1, fontWeight: tokens.weight.black as any, color: tokens.color.text },
  explainer: { fontSize: tokens.text.body, color: tokens.color.subtext, lineHeight: 22 },
  countryList: { gap: tokens.space.sm },
  row: {
    flexDirection: "row", alignItems: "center", padding: tokens.space.lg,
    borderRadius: tokens.radius.lg, borderWidth: 1, borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface, gap: tokens.space.sm,
  },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: tokens.text.body, fontWeight: tokens.weight.black as any, color: tokens.color.text },
  label: { fontSize: tokens.text.small, color: tokens.color.subtext, lineHeight: 18 },
  readyBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100,
    backgroundColor: tokens.color.primarySoft,
  },
  readyText: { fontSize: 9, fontWeight: "800" as any, color: tokens.color.primary },
  soonBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100, backgroundColor: "#f3f4f6",
  },
  soonText: { fontSize: 9, fontWeight: "800" as any, color: "#6b7280" },
});
