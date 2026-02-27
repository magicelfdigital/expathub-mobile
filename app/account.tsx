import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getBackendBase } from "@/src/billing/backendClient";
import { getApiUrl } from "@/lib/query-client";
import { COUNTRIES } from "@/data/countries";
import { tokens } from "@/theme/tokens";
import { testCrash, isNativeBuild } from "@/utils/crashlytics";
import { trackEvent } from "@/src/lib/analytics";

async function loadPurchasesModule() {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("react-native-purchases");
    return mod.default;
  } catch {
    return null;
  }
}

function getCountryName(slug: string): string {
  return COUNTRIES.find((c) => c.slug === slug)?.name ?? slug;
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const {
    hasActiveSubscription,
    hasFullAccess,
    accessType,
    source,
    decisionPassDaysLeft,
    decisionPassExpiresAt,
    unlockedCountries,
  } = useSubscription();

  const [deleting, setDeleting] = useState(false);
  const [deletedSuccess, setDeletedSuccess] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;
  const WEB_TOP = Platform.OS === "web" ? 67 : 0;
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = useCallback(() => {
    if (!__DEV__) return;
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      router.push("/debug-billing" as any);
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

  const handleRestore = async () => {
    setRestoring(true);
    setStatusMsg(null);
    const rc = await loadPurchasesModule();
    if (!rc) {
      setStatusMsg("Purchase system not available on this platform.");
      setRestoring(false);
      return;
    }
    try {
      const result = await rc.restorePurchases();
      const activeCount = Object.values(result.entitlements.active).length;
      setStatusMsg(
        activeCount > 0
          ? `Restored ${activeCount} purchase(s) successfully.`
          : "No previous purchases found."
      );
    } catch {
      setStatusMsg("Restore failed. Please try again later.");
    } finally {
      setRestoring(false);
    }
  };

  const handleManageSubscription = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      Alert.alert(
        "Manage Subscription",
        "Visit your app store account settings to manage your subscription."
      );
    }
  };

  const handleContactSupport = () => {
    const subject = encodeURIComponent("ExpatHub Support Request");
    const body = encodeURIComponent(
      `\n\n---\nEmail: ${user?.email ?? "unknown"}\nPlatform: ${Platform.OS}`
    );
    Linking.openURL(
      `mailto:support@magicelfdigital.com?subject=${subject}&body=${body}`
    );
  };

  const handleDeleteAccount = async () => {
    const confirmed = Platform.OS === "web"
      ? window.confirm("This will permanently delete your account and associated data. This action cannot be undone.")
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Delete Account",
            "This will permanently delete your account and associated data. This action cannot be undone.",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Confirm Delete", style: "destructive", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });

    if (!confirmed) return;

    setDeleting(true);
    try {
      const base = Platform.OS === "web"
        ? getApiUrl().replace(/\/$/, "")
        : getBackendBase();
      console.log(`[DELETE_ACCOUNT] DELETE ${base}/api/account`);
      const res = await fetch(`${base}/api/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = await res.text();
      console.log(`[DELETE_ACCOUNT] status=${res.status} body=${body}`);
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status}): ${body}`);
      }
      await logout();
      trackEvent("account_deleted", { platform: Platform.OS });
      setDeletedSuccess(true);
      setTimeout(() => {
        router.replace("/");
      }, 2500);
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      console.log(`[DELETE_ACCOUNT] error: ${msg}`);
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setDeleting(false);
    }
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

  if (deletedSuccess) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <Ionicons name="checkmark-circle" size={64} color={tokens.color.primary} />
        <Text style={{ fontSize: 22, fontWeight: "700", color: tokens.color.text, marginTop: 16, textAlign: "center" }}>
          Account Deleted
        </Text>
        <Text style={{ fontSize: 15, color: tokens.color.subtext, marginTop: 8, textAlign: "center" }}>
          Your account has been successfully deleted.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.container, { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 }]}
      contentContainerStyle={[s.scrollContent, isLargeScreen && s.scrollContentLarge]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/"); }} hitSlop={12}>
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

      </View>

      {statusMsg ? (
        <View style={s.statusBox}>
          <Text style={s.statusText}>{statusMsg}</Text>
        </View>
      ) : null}

      <View style={s.actionsGroup}>
        <Pressable
          onPress={handleRestore}
          disabled={restoring}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={tokens.color.primary} />
          ) : (
            <Ionicons name="arrow-undo" size={18} color={tokens.color.primary} />
          )}
          <Text style={s.actionRowText}>Restore Purchases</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={handleManageSubscription}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="settings-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Manage Subscription</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={handleContactSupport}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="mail-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Contact Support</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>

        <View style={s.actionDivider} />

        <Pressable
          onPress={() => Linking.openURL("https://www.expathub.website")}
          style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="globe-outline" size={18} color={tokens.color.primary} />
          <Text style={s.actionRowText}>Visit www.expathub.website</Text>
          <Ionicons name="open-outline" size={14} color={tokens.color.subtext} style={{ marginLeft: "auto" as any }} />
        </Pressable>
      </View>

      <Pressable style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
        <Text style={s.logoutText}>Sign Out</Text>
      </Pressable>

      <Text style={s.dangerHeader}>Danger Zone</Text>
      <Pressable
        style={s.deleteBtn}
        onPress={handleDeleteAccount}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator size="small" color="#991b1b" />
        ) : (
          <Ionicons name="trash-outline" size={20} color="#991b1b" />
        )}
        <Text style={s.deleteText}>Delete Account</Text>
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

  statusBox: {
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  } as const,

  statusText: {
    fontSize: tokens.text.small,
    color: tokens.color.primary,
    textAlign: "center" as const,
  } as const,

  actionsGroup: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: 24,
    overflow: "hidden" as const,
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

  actionDivider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginHorizontal: 16,
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

  dangerHeader: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: "#991b1b",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginTop: 32,
    marginBottom: 8,
  } as const,

  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
  } as const,

  deleteText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: "#991b1b",
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
