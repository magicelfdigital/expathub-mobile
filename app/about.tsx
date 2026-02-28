import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PRIVACY_URL, TERMS_URL } from "@/src/config/subscription";
import { tokens } from "@/theme/tokens";

const appVersion = Constants.expoConfig?.version ?? "1.0.0";
const buildNumber =
  Platform.OS === "ios"
    ? Constants.expoConfig?.ios?.buildNumber
    : Platform.OS === "android"
      ? Constants.expoConfig?.android?.versionCode?.toString()
      : null;

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;
  const WEB_TOP = Platform.OS === "web" ? 67 : 0;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <ScrollView
      style={[s.container, { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 }]}
      contentContainerStyle={[s.scrollContent, isLargeScreen && s.scrollContentLarge]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="close" size={28} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle}>About</Text>
        <View style={{ width: 28 }} />
      </View>

      <Text style={s.title}>About ExpatHub</Text>
      <Text style={s.description}>
        ExpatHub provides structured guidance to help you evaluate and plan international relocation decisions with clarity.
      </Text>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowLabel}>Version</Text>
          <View style={s.rowRight}>
            <Text style={s.rowValue}>{appVersion}</Text>
            {buildNumber ? (
              <Text style={s.buildText}>Build {buildNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.row}>
          <Text style={s.rowLabel}>Company</Text>
          <Text style={s.rowValue}>MagicElfDigital LLC</Text>
        </View>

        <View style={s.divider} />

        <Pressable
          onPress={() => Linking.openURL("mailto:support@expathub.website")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.rowLabel}>Support</Text>
          <View style={s.linkRow}>
            <Text style={s.linkText}>support@expathub.website</Text>
            <Ionicons name="mail-outline" size={14} color={tokens.color.primary} />
          </View>
        </Pressable>
      </View>

      <Text style={s.sectionHeader}>Legal</Text>
      <View style={s.card}>
        <Pressable
          onPress={() => Linking.openURL(PRIVACY_URL)}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Privacy Policy</Text>
          <Ionicons name="open-outline" size={14} color={tokens.color.subtext} style={s.chevron} />
        </Pressable>

        <View style={s.divider} />

        <Pressable
          onPress={() => Linking.openURL(TERMS_URL)}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="document-text-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Terms of Service</Text>
          <Ionicons name="open-outline" size={14} color={tokens.color.subtext} style={s.chevron} />
        </Pressable>

        <View style={s.divider} />

        <Pressable
          onPress={() => router.push("/account" as any)}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="person-remove-outline" size={18} color="#b91c1c" />
          <Text style={[s.actionRowText, { color: "#b91c1c" }]}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={s.chevron} />
        </Pressable>
      </View>

      <Text style={s.copyright}>{"\u00A9"} 2026 MagicElfDigital LLC</Text>
    </ScrollView>
  );
}

const s = {
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  } as const,

  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "web" ? 94 : 60,
  } as const,

  scrollContentLarge: {
    maxWidth: 900,
    alignSelf: "center" as const,
    width: "100%" as const,
  } as const,

  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 32,
  } as const,

  headerTitle: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  } as const,

  title: {
    fontSize: 24,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    marginBottom: 12,
  } as const,

  description: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 22,
    marginBottom: 32,
  } as const,

  sectionHeader: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  } as const,

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: 24,
    overflow: "hidden" as const,
  } as const,

  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
  } as const,

  rowRight: {
    alignItems: "flex-end" as const,
  } as const,

  rowLabel: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  } as const,

  rowValue: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,

  buildText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    marginTop: 2,
  } as const,

  linkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  } as const,

  linkText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  } as const,

  divider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginHorizontal: 16,
  } as const,

  actionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  } as const,

  actionRowText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,

  chevron: {
    marginLeft: "auto" as any,
  } as const,

  copyright: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    opacity: 0.5,
    textAlign: "center" as const,
    marginTop: 16,
    marginBottom: 24,
  } as const,
} as const;
