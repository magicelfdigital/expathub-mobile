import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

type TopicCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  accentBg: string;
};

const TOPICS: TopicCard[] = [
  {
    key: "remote-work",
    title: "I need to keep working",
    subtitle:
      "Remote work rules vary. Start with options that explicitly allow it.",
    icon: "laptop-outline",
    accentColor: "#2D7A5F",
    accentBg: "#EDF5F0",
  },
  {
    key: "sponsorship",
    title: "I want a local job (sponsorship)",
    subtitle:
      "Employer sponsorship is often the real gate. Learn what's realistic.",
    icon: "briefcase-outline",
    accentColor: "#1A6B6B",
    accentBg: "#E8F4F2",
  },
  {
    key: "flexibility",
    title: "I'm not sure yet (flexibility)",
    subtitle:
      "Choose paths that preserve options and buy time legally.",
    icon: "options-outline",
    accentColor: "#0D8A8A",
    accentBg: "#FBF7EF",
  },
  {
    key: "pr",
    title: "Long-term residency (permanent residency)",
    subtitle:
      "Some visas are dead ends. Start with options aligned to permanent residency pathways.",
    icon: "shield-checkmark-outline",
    accentColor: "#b45309",
    accentBg: "#fef3c7",
  },
];

export default function ExploreScreen() {
  const router = useRouter();
  const { setSelectedCountrySlug } = useCountry();
  const exploredRef = useRef(false);

  useEffect(() => {
    if (!exploredRef.current) {
      trackEvent("explore_opened");
      exploredRef.current = true;
    }
  }, []);

  const goTopic = (key: string) => {
    router.push(`/(tabs)/explore/${key}` as any);
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
          <Text style={s.h1}>Explore</Text>
          <Text style={s.lead}>
            Pick the scenario that fits your situation, or compare countries head to head.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/(tabs)/explore/compare" as any)}
          style={({ pressed }) => [s.compareCard, pressed && s.compareCardPressed]}
          testID="compare-countries-link"
        >
          <View style={s.compareIconCircle}>
            <Ionicons name="git-compare-outline" size={22} color={tokens.color.primary} />
          </View>
          <View style={s.compareBody}>
            <Text style={s.compareTitle}>Compare countries</Text>
            <Text style={s.compareSub}>
              Side-by-side on key decision factors — free and Pro rows
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
        </Pressable>

        <View style={s.divider} />

        <View style={s.topicSection}>
          <Text style={s.sectionHeading}>Explore by situation</Text>
          <View style={s.cardList}>
            {TOPICS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => goTopic(t.key)}
                style={({ pressed }) => [s.card, pressed && s.cardPressed]}
              >
                <View style={[s.iconCircle, { backgroundColor: t.accentBg }]}>
                  <Ionicons name={t.icon} size={20} color={t.accentColor} />
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardTitle}>{t.title}</Text>
                  <Text style={s.cardSub}>{t.subtitle}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={tokens.color.primary}
                  style={s.chevron}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.divider} />

        <Pressable
          onPress={() => router.push("/(tabs)/explore/glossary" as any)}
          style={({ pressed }) => [s.glossaryCard, pressed && s.glossaryCardPressed]}
          testID="glossary-link"
        >
          <View style={s.glossaryIconCircle}>
            <Ionicons name="book-outline" size={20} color="#0D8A8A" />
          </View>
          <View style={s.compareBody}>
            <Text style={s.glossaryTitle}>Visa Glossary</Text>
            <Text style={s.compareSub}>
              Look up abbreviations like D7, NLV, ILR, and more
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#0D8A8A" />
        </Pressable>

        <Pressable
          onPress={() => router.push("/(tabs)/country" as any)}
          style={({ pressed }) => [s.browseLink, pressed && s.browseLinkPressed]}
        >
          <Ionicons name="globe-outline" size={18} color={tokens.color.primary} />
          <Text style={s.browseLinkText}>Browse all countries</Text>
          <Ionicons name="chevron-forward" size={14} color={tokens.color.primary} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.lg,
  },

  header: { gap: tokens.space.xs },
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.text,
  },
  lead: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },

  compareCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
    gap: 12,
  },
  compareCardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  compareIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  compareBody: { flex: 1, gap: 2 },
  compareTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.primary,
  },
  compareSub: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 17,
  },

  divider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginVertical: tokens.space.xs,
  },

  topicSection: { gap: tokens.space.sm },
  sectionHeading: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.text,
  },
  cardList: { gap: tokens.space.sm },

  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 12,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  cardBody: { flex: 1, gap: 3 },
  cardTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.text,
  },
  cardSub: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 17,
  },

  chevron: { marginTop: 12 },

  browseLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  },
  glossaryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#E8DCC8",
    backgroundColor: "#FBF7EF",
    gap: 12,
  },
  glossaryCardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  glossaryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: "#E8DCC8",
    alignItems: "center",
    justifyContent: "center",
  },
  glossaryTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black as any,
    color: "#0D8A8A",
  },

  browseLinkPressed: { opacity: 0.8 },
  browseLinkText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold as any,
    color: tokens.color.primary,
  },
});
