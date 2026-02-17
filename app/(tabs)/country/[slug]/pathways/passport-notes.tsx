import { Ionicons } from "@expo/vector-icons";
import { useGlobalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { getCountry, getPathways } from "@/src/data";
import { getPassportNotes, PASSPORT_LABELS } from "@/data/passportNotes";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function PassportNotesScreen() {
  const router = useRouter();
  const { slug, key } = useGlobalSearchParams<{ slug?: string; key?: string }>();

  const countrySlug = typeof slug === "string" ? slug : "";
  const pathwayKey = typeof key === "string" ? key : "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "Country";
    return getCountry(countrySlug)?.name ?? "Country";
  }, [countrySlug]);

  const pathway = useMemo(() => {
    return getPathways(countrySlug).find((p) => p.key === pathwayKey) || null;
  }, [countrySlug, pathwayKey]);

  const passportNotes = useMemo(
    () => getPassportNotes(countrySlug, pathwayKey),
    [countrySlug, pathwayKey]
  );

  if (!pathway || passportNotes.length === 0) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: tokens.space.xl, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: tokens.text.h3, fontWeight: tokens.weight.black, color: tokens.color.text }}>
            No passport notes available
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.color.primary, fontWeight: tokens.weight.black }}>Go back</Text>
          </Pressable>
        </View>
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
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <Ionicons name="earth" size={22} color="#0D8A8A" />
            <Text style={styles.h1}>Passport Notes</Text>
          </View>
          <Text style={styles.subtitle}>
            {pathway.title} — {countryName}
          </Text>
          <Text style={styles.lead}>
            Key details by passport nationality for this pathway.
          </Text>
        </View>

        <View style={styles.notesList}>
          {passportNotes.map((pn) => (
            <View key={pn.passport} style={styles.noteCard}>
              <View style={styles.noteLabelRow}>
                <View style={styles.noteFlag}>
                  <Text style={styles.noteFlagText}>
                    {pn.passport.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.noteLabelText}>{PASSPORT_LABELS[pn.passport]} passport</Text>
              </View>
              <Text style={styles.noteText}>{pn.note}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.disclaimer}>
          Passport-specific details are general guidance. Always verify requirements with the relevant consulate or embassy for your nationality.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.lg },

  headerSection: { gap: tokens.space.xs },
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  h1: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: "#1A5C5C",
  },
  subtitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    marginTop: 2,
  },
  lead: {
    fontSize: tokens.text.small,
    color: "#0D8A8A",
    lineHeight: 18,
    marginTop: 2,
  },

  notesList: { gap: 12 },
  noteCard: {
    padding: 14,
    borderRadius: tokens.radius.lg,
    backgroundColor: "#FBF7EF",
    borderWidth: 1,
    borderColor: "#E8DCC8",
    gap: 8,
  },
  noteLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  noteFlag: {
    width: 32,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#009C9C",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  noteFlagText: {
    fontSize: 11,
    fontWeight: tokens.weight.black,
    color: tokens.color.white,
    letterSpacing: 0.5,
  },
  noteLabelText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  noteText: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
    lineHeight: 22,
  },

  disclaimer: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
    marginTop: 4,
  },
} as const;
