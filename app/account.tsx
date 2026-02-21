import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { COUNTRIES } from "@/data/countries";
import { tokens } from "@/theme/tokens";
import { testCrash, isNativeBuild } from "@/utils/crashlytics";

function getCountryName(slug: string): string {
  return COUNTRIES.find((c) => c.slug === slug)?.name ?? slug;
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    hasActiveSubscription,
    hasFullAccess,
    accessType,
    source,
    decisionPassDaysLeft,
    decisionPassExpiresAt,
    unlockedCountries,
  } = useSubscription();

  const WEB_TOP = Platform.OS === "web" ? 67 : 0;
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      router.push("/account-info" as any);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const accessLabel = (() => {
    switch (accessType) {
      case "decision_pass":
        return "Decision Pass";
      case "country_lifetime":
        return "Country Unlock";
      case "subscription":
        return "Monthly";
      case "sandbox":
        return "Sandbox";
      default:
        return "Free";
    }
  })();

  const hasPaidAccess = hasActiveSubscription && accessType !== "sandbox" && accessType !== "none";

  return (
    <ScrollView
      style={[s.container, { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 }]}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle}>Account</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={s.section}>
        <View style={s.avatarCircle}>
          <Ionicons name="person" size={36} color={tokens.color.primary} />
        </View>
        <Text style={s.email}>{user?.email ?? "Not signed in"}</Text>
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowLabel}>Access</Text>
          <View
            style={[
              s.badge,
              hasPaidAccess || accessType === "sandbox" ? s.badgePro : s.badgeFree,
            ]}
          >
            <Text
              style={[
                s.badgeText,
                hasPaidAccess || accessType === "sandbox" ? s.badgeTextPro : s.badgeTextFree,
              ]}
            >
              {accessLabel}
            </Text>
          </View>
        </View>

        {accessType === "decision_pass" && decisionPassDaysLeft != null ? (
          <View style={s.row}>
            <Text style={s.rowLabel}>Expires</Text>
            <Text style={s.rowValue}>
              {decisionPassDaysLeft} days left
              {decisionPassExpiresAt
                ? ` (${new Date(decisionPassExpiresAt).toLocaleDateString()})`
                : ""}
            </Text>
          </View>
        ) : null}

        {hasPaidAccess ? (
          <View style={s.row}>
            <Text style={s.rowLabel}>Source</Text>
            <Text style={s.rowValue}>
              {source === "revenuecat" ? "App Store" : source === "stripe" ? "Web" : source}
            </Text>
          </View>
        ) : null}

        {unlockedCountries.length > 0 ? (
          <View style={s.countrySection}>
            <Text style={s.countryLabel}>Unlocked Countries</Text>
            <View style={s.countryChips}>
              {unlockedCountries.map((slug) => (
                <View key={slug} style={s.countryChip}>
                  <Ionicons name="checkmark-circle" size={12} color={tokens.color.primary} />
                  <Text style={s.countryChipText}>{getCountryName(slug)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!hasActiveSubscription ? (
          <Pressable
            style={s.upgradeBtn}
            onPress={() => router.push("/subscribe" as any)}
          >
            <Ionicons name="star" size={18} color={tokens.color.white} />
            <Text style={s.upgradeBtnText}>Start your 30-day decision window</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => Linking.openURL("https://expathub.website")}
        style={s.websiteLink}
      >
        <Ionicons name="globe-outline" size={18} color={tokens.color.primary} />
        <Text style={s.websiteLinkText}>Visit expathub.website</Text>
        <Ionicons name="open-outline" size={14} color={tokens.color.primary} style={{ marginLeft: "auto" as any }} />
      </Pressable>

      <Pressable style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
        <Text style={s.logoutText}>Sign Out</Text>
      </Pressable>

      {__DEV__ ? (
        <Pressable
          style={s.debugBillingBtn}
          onPress={() => router.push("/debug-billing" as any)}
        >
          <Ionicons name="code-slash-outline" size={20} color="#1e40af" />
          <Text style={s.debugBillingText}>Billing Debug (Dev Only)</Text>
        </Pressable>
      ) : null}

      {__DEV__ ? (
        <Pressable
          style={s.crashTestBtn}
          onPress={() => {
            if (isNativeBuild()) {
              Alert.alert(
                "Test Crash",
                "This will force-crash the app to test Crashlytics. Continue?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Crash Now", style: "destructive", onPress: () => testCrash() },
                ]
              );
            } else {
              Alert.alert(
                "Not Available",
                "Crashlytics test crashes only work in native builds (EAS), not in Expo Go or web."
              );
            }
          }}
        >
          <Ionicons name="bug-outline" size={20} color="#92400e" />
          <Text style={s.crashTestText}>Test Crashlytics (Dev Only)</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={handleVersionTap} style={s.versionLabel}>
        <Text style={s.versionText}>ExpatHub v1.0.0</Text>
      </Pressable>
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
    paddingBottom: 40,
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

  section: {
    alignItems: "center" as const,
    marginBottom: 32,
  } as const,

  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: tokens.color.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  } as const,

  email: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 16,
    marginBottom: 24,
  } as const,

  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  } as const,

  rowLabel: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  } as const,

  rowValue: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    flexShrink: 1,
    textAlign: "right" as const,
  } as const,

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  } as const,

  badgePro: { backgroundColor: tokens.color.primary } as const,
  badgeFree: { backgroundColor: tokens.color.border } as const,

  badgeText: { fontSize: tokens.text.small, fontWeight: tokens.weight.black } as const,
  badgeTextPro: { color: tokens.color.white } as const,
  badgeTextFree: { color: tokens.color.subtext } as const,

  countrySection: {
    gap: 8,
  } as const,

  countryLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
  } as const,

  countryChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  } as const,

  countryChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  } as const,

  countryChipText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  } as const,

  upgradeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    marginTop: 4,
  } as const,

  upgradeBtnText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.white,
  } as const,

  websiteLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    marginBottom: 16,
  } as const,

  websiteLinkText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  } as const,

  logoutBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  } as const,

  logoutText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: "#b91c1c",
  } as const,

  debugBillingBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    marginTop: 16,
  } as const,

  debugBillingText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: "#1e40af",
  } as const,

  crashTestBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    marginTop: 16,
  } as const,

  crashTestText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: "#92400e",
  } as const,

  versionLabel: {
    alignItems: "center" as const,
    paddingVertical: 24,
    marginTop: 16,
  } as const,

  versionText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    opacity: 0.5,
  } as const,
} as const;
