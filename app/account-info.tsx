import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  getAppUserId,
  getCustomerInfo as rcGetCustomerInfo,
  getOfferings as rcGetOfferings,
  isRCInitialized,
} from "@/src/subscriptions/revenuecat";
import { tokens } from "@/theme/tokens";

type EntitlementInfo = {
  id: string;
  isActive: boolean;
  expirationDate: string | null;
};

type OfferingInfo = {
  identifier: string;
  packages: { identifier: string; productId: string; priceString: string }[];
};

type AccountData = {
  appUserId: string | null;
  entitlements: EntitlementInfo[];
  managementURL: string | null;
  offerings: OfferingInfo | null;
  rcInitialized: boolean;
  customerInfoError: string | null;
  offeringsError: string | null;
};

const EMPTY: AccountData = {
  appUserId: null,
  entitlements: [],
  managementURL: null,
  offerings: null,
  rcInitialized: false,
  customerInfoError: null,
  offeringsError: null,
};

const DEBUG_TAP_COUNT = 7;
const DEBUG_TAP_WINDOW_MS = 4000;

async function loadPurchasesModule() {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("react-native-purchases");
    return mod.default;
  } catch {
    return null;
  }
}

export default function AccountInfoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh, rcConfigured, purchasesError } = useSubscription();
  const [data, setData] = useState<AccountData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(true);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [actionLog, setActionLog] = useState<string[]>([]);
  const [debugBusy, setDebugBusy] = useState(false);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setActionLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const fetchData = useCallback(async () => {
    const rcInit = isRCInitialized();
    let appUserId: string | null = null;
    let entitlements: EntitlementInfo[] = [];
    let managementURL: string | null = null;
    let offerings: OfferingInfo | null = null;
    let customerInfoError: string | null = null;
    let offeringsError: string | null = null;

    appUserId = await getAppUserId();

    if (Platform.OS !== "web") {
      const ciResult = await rcGetCustomerInfo();
      if (ciResult.error) {
        customerInfoError = ciResult.error;
      } else {
        if (!appUserId) {
          const rc = await loadPurchasesModule();
          if (rc) {
            try {
              const info = await rc.getCustomerInfo();
              appUserId = info.originalAppUserId ?? null;
            } catch {}
          }
        }
        const allEnts = ciResult.entitlements;
        entitlements = Object.entries(allEnts).map(([id, active]) => ({
          id,
          isActive: Boolean(active),
          expirationDate: null,
        }));
        managementURL = ciResult.managementURL;
      }

      const offResult = await rcGetOfferings();
      if (offResult.error) {
        offeringsError = offResult.error;
      } else if (offResult.current.length > 0) {
        offerings = {
          identifier: "default",
          packages: offResult.current.map((p) => ({
            identifier: p.identifier,
            productId: p.productId,
            priceString: p.priceString,
          })),
        };
      }
    }

    setData({
      appUserId,
      entitlements,
      managementURL,
      offerings,
      rcInitialized: rcInit,
      customerInfoError,
      offeringsError,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleIdTap = () => {
    if (!__DEV__) return;
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= DEBUG_TAP_COUNT) {
      tapCountRef.current = 0;
      setShowDebug((prev) => !prev);
      if (!showDebug) log("Debug section revealed");
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, DEBUG_TAP_WINDOW_MS);
  };

  const handleCopyId = async () => {
    if (!data.appUserId) return;
    try {
      await Clipboard.setStringAsync(data.appUserId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleRestore = async () => {
    setBusy(true);
    setStatusMsg(null);
    const rc = await loadPurchasesModule();
    if (!rc) {
      setStatusMsg("Purchase system not available on this platform.");
      setBusy(false);
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
      await fetchData();
      await refresh();
    } catch {
      setStatusMsg("Restore failed. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  const handleManageSubscription = () => {
    if (data.managementURL) {
      Linking.openURL(data.managementURL);
    } else if (Platform.OS === "ios") {
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
      `\n\n---\nUser ID: ${data.appUserId ?? "unknown"}\nPlatform: ${Platform.OS}\nRC Configured: ${data.rcInitialized}`
    );
    Linking.openURL(
      `mailto:support@magicelfdigital.com?subject=${subject}&body=${body}`
    );
  };

  const handleRefreshPurchasesStatus = async () => {
    setBusy(true);
    setStatusMsg(null);
    log("Refreshing purchases status...");
    try {
      await fetchData();
      await refresh();
      log("Purchases status refreshed");
      setStatusMsg("Purchases status refreshed.");
    } catch (e: any) {
      log(`Refresh error: ${e?.message ?? e}`);
      setStatusMsg("Failed to refresh. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDebugResetUser = async () => {
    setDebugBusy(true);
    log("Resetting RevenueCat user...");
    const rc = await loadPurchasesModule();
    if (!rc) {
      log("Module not available");
      setDebugBusy(false);
      return;
    }
    try {
      await rc.logOut();
      log("Logged out from RevenueCat");
      await fetchData();
      await refresh();
      log("Entitlements refreshed");
    } catch (e: any) {
      log(`Reset error: ${e?.message ?? e}`);
    } finally {
      setDebugBusy(false);
    }
  };

  const handleDebugShowOfferings = async () => {
    setDebugBusy(true);
    log("Fetching offerings...");
    const rc = await loadPurchasesModule();
    if (!rc) {
      log("Module not available");
      setDebugBusy(false);
      return;
    }
    try {
      const off = await rc.getOfferings();
      if (!off.current) {
        log("No current offering found");
        setDebugBusy(false);
        return;
      }
      log(`Offering: "${off.current.identifier}"`);
      for (const pkg of off.current.availablePackages) {
        log(`  ${pkg.identifier} | ${pkg.product.identifier} | ${pkg.product.priceString}`);
      }
      await fetchData();
    } catch (e: any) {
      log(`Offerings error: ${e?.message ?? e}`);
    } finally {
      setDebugBusy(false);
    }
  };

  const handleDebugRefresh = async () => {
    log("Refreshing all...");
    await fetchData();
    await refresh();
    log("Refreshed");
  };

  const activeEntitlements = data.entitlements.filter((e) => e.isActive);
  const WEB_TOP = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={[
        s.container,
        { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 },
      ]}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle}>Account Info</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
        </View>
      ) : (
        <>
          {(purchasesError || data.customerInfoError) && Platform.OS !== "web" && (
            <View style={s.errorBanner}>
              <Ionicons name="warning" size={18} color="#b45309" />
              <Text style={s.errorBannerText}>
                {purchasesError || data.customerInfoError || "Purchases unavailable, please try again."}
              </Text>
            </View>
          )}

          <Pressable onPress={handleIdTap} style={s.card}>
            <Text style={s.cardLabel}>Your Account ID</Text>
            <View style={s.idRow}>
              <Text style={s.idText} numberOfLines={1} ellipsizeMode="middle">
                {data.appUserId ?? "Not available"}
              </Text>
              {data.appUserId && (
                <Pressable onPress={handleCopyId} hitSlop={8}>
                  <Ionicons
                    name={copied ? "checkmark-circle" : "copy-outline"}
                    size={20}
                    color={copied ? "#16a34a" : tokens.color.primary}
                  />
                </Pressable>
              )}
            </View>
            {!data.appUserId && Platform.OS !== "web" && (
              <Text style={s.warningText}>
                {!data.rcInitialized ? "RevenueCat not configured" : "Could not retrieve user ID"}
              </Text>
            )}
            {copied && (
              <Text style={s.copiedText}>Copied to clipboard</Text>
            )}
          </Pressable>

          <View style={s.card}>
            <Text style={s.cardLabel}>Active Purchases</Text>
            {activeEntitlements.length === 0 ? (
              <Text style={s.emptyText}>No active purchases</Text>
            ) : (
              activeEntitlements.map((ent) => (
                <View key={ent.id} style={s.entRow}>
                  <View style={s.entHeader}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#16a34a"
                    />
                    <Text style={s.entName}>
                      {formatEntitlementName(ent.id)}
                    </Text>
                  </View>
                  <Text style={s.entExpiry}>
                    {ent.expirationDate
                      ? `Expires: ${new Date(ent.expirationDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
                      : "Lifetime access"}
                  </Text>
                </View>
              ))
            )}
          </View>

          {statusMsg && (
            <View style={s.statusBox}>
              <Text style={s.statusText}>{statusMsg}</Text>
            </View>
          )}

          <View style={s.actions}>
            <Pressable
              onPress={handleRefreshPurchasesStatus}
              disabled={busy}
              style={({ pressed }) => [
                s.actionBtn,
                s.actionPrimary,
                pressed && s.actionPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={tokens.color.primary} />
              ) : (
                <>
                  <Ionicons name="refresh" size={18} color={tokens.color.primary} />
                  <Text style={s.actionPrimaryText}>Refresh Purchases Status</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={handleRestore}
              disabled={busy}
              style={({ pressed }) => [
                s.actionBtn,
                s.actionPrimary,
                pressed && s.actionPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={tokens.color.primary} />
              ) : (
                <>
                  <Ionicons name="arrow-undo" size={18} color={tokens.color.primary} />
                  <Text style={s.actionPrimaryText}>Restore Purchases</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={handleManageSubscription}
              style={({ pressed }) => [
                s.actionBtn,
                s.actionPrimary,
                pressed && s.actionPressed,
              ]}
            >
              <Ionicons name="settings-outline" size={18} color={tokens.color.primary} />
              <Text style={s.actionPrimaryText}>Manage Subscription</Text>
            </Pressable>

            <Pressable
              onPress={handleContactSupport}
              style={({ pressed }) => [
                s.actionBtn,
                s.actionSecondary,
                pressed && s.actionPressed,
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={tokens.color.subtext} />
              <Text style={s.actionSecondaryText}>Contact Support</Text>
            </Pressable>
          </View>

          {showDebug && (
            <>
              <View style={s.debugDivider} />

              <Pressable
                onPress={() => setDebugExpanded((v) => !v)}
                style={s.debugToggle}
              >
                <Ionicons
                  name="construct"
                  size={16}
                  color="#f59e0b"
                />
                <Text style={s.debugToggleText}>Advanced / Debug</Text>
                <Ionicons
                  name={debugExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={tokens.color.subtext}
                />
              </Pressable>

              {debugExpanded && (
                <>
                  <View style={s.debugCard}>
                    <Text style={s.debugCardTitle}>RC Status</Text>
                    <View style={s.debugStatusRow}>
                      <Ionicons
                        name={data.rcInitialized ? "checkmark-circle" : "close-circle"}
                        size={14}
                        color={data.rcInitialized ? "#16a34a" : "#dc2626"}
                      />
                      <Text style={s.debugStatusText}>
                        SDK Configured: {data.rcInitialized ? "Yes" : "No"}
                      </Text>
                    </View>
                    {data.customerInfoError && (
                      <Text style={s.debugErrorText}>CustomerInfo: {data.customerInfoError}</Text>
                    )}
                    {data.offeringsError && (
                      <Text style={s.debugErrorText}>Offerings: {data.offeringsError}</Text>
                    )}
                  </View>

                  <View style={s.debugCard}>
                    <Text style={s.debugCardTitle}>Current Offering</Text>
                    {data.offerings ? (
                      <>
                        <Text style={s.mono}>{data.offerings.identifier}</Text>
                        {data.offerings.packages.map((pkg) => (
                          <View key={pkg.identifier} style={s.pkgRow}>
                            <Text style={s.pkgId}>{pkg.identifier}</Text>
                            <Text style={s.pkgDetail}>
                              {pkg.productId} — {pkg.priceString}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text style={s.debugEmpty}>
                        {data.offeringsError ?? "No offering loaded"}
                      </Text>
                    )}
                  </View>

                  <View style={s.debugCard}>
                    <Text style={s.debugCardTitle}>
                      All Entitlements ({data.entitlements.length})
                    </Text>
                    {data.entitlements.length === 0 ? (
                      <Text style={s.debugEmpty}>None</Text>
                    ) : (
                      data.entitlements.map((ent) => (
                        <View key={ent.id} style={s.debugEntRow}>
                          <View style={s.entHeader}>
                            <Ionicons
                              name={ent.isActive ? "checkmark-circle" : "close-circle"}
                              size={14}
                              color={ent.isActive ? "#16a34a" : "#dc2626"}
                            />
                            <Text style={s.debugEntId}>{ent.id}</Text>
                          </View>
                          <Text style={s.debugEntDetail}>
                            {ent.isActive ? "Active" : "Inactive"}
                            {ent.expirationDate
                              ? ` | Exp: ${new Date(ent.expirationDate).toLocaleString()}`
                              : " | No expiration"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={s.debugActions}>
                    <Pressable
                      onPress={handleDebugResetUser}
                      disabled={debugBusy}
                      style={({ pressed }) => [
                        s.actionBtn,
                        s.actionReset,
                        pressed && s.actionPressed,
                      ]}
                    >
                      {debugBusy ? (
                        <ActivityIndicator size="small" color="#b91c1c" />
                      ) : (
                        <>
                          <Ionicons name="person-remove" size={18} color="#b91c1c" />
                          <Text style={s.actionResetText}>Reset RevenueCat User</Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={handleDebugShowOfferings}
                      disabled={debugBusy}
                      style={({ pressed }) => [
                        s.actionBtn,
                        s.actionPrimary,
                        pressed && s.actionPressed,
                      ]}
                    >
                      {debugBusy ? (
                        <ActivityIndicator size="small" color={tokens.color.primary} />
                      ) : (
                        <>
                          <Ionicons name="list" size={18} color={tokens.color.primary} />
                          <Text style={s.actionPrimaryText}>Show Offerings</Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={handleDebugRefresh}
                      disabled={debugBusy}
                      style={({ pressed }) => [
                        s.actionBtn,
                        s.actionPrimary,
                        pressed && s.actionPressed,
                      ]}
                    >
                      {debugBusy ? (
                        <ActivityIndicator size="small" color={tokens.color.primary} />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={18} color={tokens.color.primary} />
                          <Text style={s.actionPrimaryText}>Refresh All</Text>
                        </>
                      )}
                    </Pressable>
                  </View>

                  <View style={s.logCard}>
                    <Text style={s.logTitle}>Action Log</Text>
                    {actionLog.length === 0 ? (
                      <Text style={s.logEmpty}>No actions yet</Text>
                    ) : (
                      actionLog.map((entry, i) => (
                        <Text key={i} style={s.logEntry}>
                          {entry}
                        </Text>
                      ))
                    )}
                  </View>
                </>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function formatEntitlementName(id: string): string {
  if (id === "full_access_subscription") return "Monthly Subscription";
  if (id === "decision_access") return "Decision Pass";
  if (id.startsWith("country_")) {
    const slug = id.replace("country_", "");
    return (
      slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") + " Unlock"
    );
  }
  return id;
}

const s = {
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  } as const,
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  } as const,
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 24,
  } as const,
  headerTitle: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  } as const,
  loadingBox: {
    alignItems: "center" as const,
    paddingTop: 60,
  } as const,
  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    marginBottom: 16,
  } as const,
  errorBannerText: {
    flex: 1,
    fontSize: tokens.text.small,
    color: "#92400e",
    lineHeight: 16,
  } as const,
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 8,
    marginBottom: 16,
  } as const,
  cardLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  } as const,
  idRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  } as const,
  idText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: tokens.color.text,
  } as const,
  warningText: {
    fontSize: tokens.text.small,
    color: "#b45309",
  } as const,
  copiedText: {
    fontSize: tokens.text.small,
    color: "#16a34a",
  } as const,
  emptyText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
  } as const,
  entRow: {
    gap: 2,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  } as const,
  entHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  } as const,
  entName: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,
  entExpiry: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    paddingLeft: 24,
  } as const,
  statusBox: {
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 16,
  } as const,
  statusText: {
    fontSize: tokens.text.body,
    color: tokens.color.primary,
    textAlign: "center" as const,
  } as const,
  actions: {
    gap: 10,
    marginBottom: 16,
  } as const,
  actionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
  } as const,
  actionPrimary: {
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  } as const,
  actionSecondary: {
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  } as const,
  actionReset: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  } as const,
  actionPressed: {
    opacity: 0.7,
  } as const,
  actionPrimaryText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  } as const,
  actionSecondaryText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
  } as const,
  actionResetText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: "#b91c1c",
  } as const,
  debugDivider: {
    height: 1,
    backgroundColor: "#f59e0b",
    opacity: 0.3,
    marginVertical: 8,
  } as const,
  debugToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
  } as const,
  debugToggleText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: "#f59e0b",
  } as const,
  debugCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f59e0b40",
    gap: 8,
    marginBottom: 12,
  } as const,
  debugCardTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  } as const,
  debugStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  } as const,
  debugStatusText: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
  } as const,
  debugErrorText: {
    fontSize: tokens.text.small,
    color: "#dc2626",
    paddingLeft: 20,
  } as const,
  mono: {
    fontSize: tokens.text.small,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: tokens.color.subtext,
  } as const,
  debugEmpty: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
  } as const,
  debugEntRow: {
    gap: 2,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  } as const,
  debugEntId: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,
  debugEntDetail: {
    fontSize: 11,
    color: tokens.color.subtext,
    paddingLeft: 20,
  } as const,
  pkgRow: {
    gap: 2,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  } as const,
  pkgId: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,
  pkgDetail: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  } as const,
  debugActions: {
    gap: 10,
    marginBottom: 12,
  } as const,
  logCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: tokens.radius.lg,
    padding: 16,
    gap: 6,
    marginBottom: 16,
  } as const,
  logTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: "#e2e8f0",
  } as const,
  logEmpty: {
    fontSize: tokens.text.small,
    color: "#64748b",
    fontStyle: "italic" as const,
  } as const,
  logEntry: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#a3e635",
    lineHeight: 16,
  } as const,
} as const;
