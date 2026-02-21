import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useEntitlement } from "@/src/contexts/EntitlementContext";
import { tokens } from "@/theme/tokens";
import { isRCInitialized, getCustomerInfo, getAppUserId } from "@/src/subscriptions/revenuecat";
import { getOrchestrator, clearRefreshCooldown } from "@/src/billing";
import {
  redactSensitiveFields,
  formatEntitlements,
  formatTimestamp,
  getCooldownStatus,
  getBackendBaseUrl,
  debugFetchEntitlements,
  debugForceRefresh,
  addDebugLogEntry,
  getDebugLog,
  clearDebugLog,
} from "@/src/billing/debugHelpers";
import type { CooldownStatus, DebugLogEntry } from "@/src/billing/debugHelpers";
import type { BackendEntitlements } from "@/src/billing/types";

if (!__DEV__) {
  throw new Error("Debug billing screen should never load in production");
}

export default function DebugBillingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();
  const { backendEntitlements, refresh, rcConfigured } = useEntitlement();
  const WEB_TOP = Platform.OS === "web" ? 67 : 0;

  const [rcAppUserId, setRcAppUserId] = useState<string | null>(null);
  const [rcCustomerInfo, setRcCustomerInfo] = useState<any>(null);
  const [rcError, setRcError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<CooldownStatus | null>(null);
  const [lastRefreshResponse, setLastRefreshResponse] = useState<{ status: string; timestamp: string } | null>(null);
  const [fetchedEntitlements, setFetchedEntitlements] = useState<BackendEntitlements | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<DebugLogEntry[]>([]);

  const userId = user?.id?.toString() ?? "";

  const refreshState = useCallback(async () => {
    try {
      const appUserId = await getAppUserId();
      setRcAppUserId(appUserId);
    } catch {}

    try {
      const info = await getCustomerInfo();
      setRcCustomerInfo(info);
      if (info.error) setRcError(info.error);
      else setRcError(null);
    } catch (e: any) {
      setRcError(e?.message);
    }

    if (userId) {
      setCooldown(getCooldownStatus(userId));
    }
    setLog(getDebugLog());
  }, [userId]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handleFetchEntitlements = useCallback(async () => {
    if (!token || !userId) {
      Alert.alert("Not signed in", "Sign in first to fetch entitlements.");
      return;
    }
    setBusy("fetch");
    try {
      const result = await debugFetchEntitlements(() => token, userId, rcAppUserId);
      setFetchedEntitlements(result.entitlements);
      if (!result.success) Alert.alert("Error", result.error ?? "Unknown error");
    } finally {
      await refreshState();
      setBusy(null);
    }
  }, [token, userId, rcAppUserId, refreshState]);

  const handleForceRefresh = useCallback(async () => {
    if (!token || !userId) {
      Alert.alert("Not signed in", "Sign in first.");
      return;
    }
    setBusy("refresh");
    try {
      const result = await debugForceRefresh(() => token, userId, rcAppUserId);
      setFetchedEntitlements(result.entitlements);
      setLastRefreshResponse({
        status: result.refreshSuccess ? "200 OK" : `Error: ${result.refreshError}`,
        timestamp: new Date().toISOString(),
      });
      await refresh();
      if (!result.refreshSuccess) Alert.alert("Refresh Error", result.refreshError);
    } finally {
      await refreshState();
      setBusy(null);
    }
  }, [token, userId, rcAppUserId, refresh, refreshState]);

  const handleRestorePurchases = useCallback(async () => {
    if (!token || !userId) {
      Alert.alert("Not signed in", "Sign in first.");
      return;
    }
    setBusy("restore");
    try {
      clearRefreshCooldown(userId);
      const orchestrator = getOrchestrator(() => token);
      const result = await orchestrator.restore(userId);
      await refresh();
      setFetchedEntitlements(result.entitlements);
      addDebugLogEntry({
        userId,
        rcAppUserId,
        action: "restore_purchases",
        result: result.status,
        entitlementCount: (result.entitlements.countryUnlocks?.length ?? 0) + (result.entitlements.hasFullAccess ? 1 : 0),
      });
      Alert.alert("Restore Complete", `Status: ${result.status}`);
    } catch (e: any) {
      addDebugLogEntry({
        userId,
        rcAppUserId,
        action: "restore_purchases",
        result: `error: ${e?.message}`,
        entitlementCount: 0,
      });
      Alert.alert("Restore Error", e?.message ?? "Unknown error");
    } finally {
      await refreshState();
      setBusy(null);
    }
  }, [token, userId, rcAppUserId, refresh, refreshState]);

  const handleRCLogOutLogIn = useCallback(async () => {
    if (!token || !userId) {
      Alert.alert("Not signed in", "Sign in first.");
      return;
    }
    setBusy("rclogin");
    try {
      clearRefreshCooldown(userId);
      const orchestrator = getOrchestrator(() => token);
      const result = await orchestrator.syncOnLogin(userId);
      await refresh();
      setFetchedEntitlements(result.entitlements);
      addDebugLogEntry({
        userId,
        rcAppUserId,
        action: "rc_logout_login",
        result: result.status,
        entitlementCount: (result.entitlements.countryUnlocks?.length ?? 0) + (result.entitlements.hasFullAccess ? 1 : 0),
      });
      Alert.alert("RC Re-Login Complete", `Status: ${result.status}`);
    } catch (e: any) {
      addDebugLogEntry({
        userId,
        rcAppUserId,
        action: "rc_logout_login",
        result: `error: ${e?.message}`,
        entitlementCount: 0,
      });
      Alert.alert("RC Login Error", e?.message ?? "Unknown error");
    } finally {
      await refreshState();
      setBusy(null);
    }
  }, [token, userId, rcAppUserId, refresh, refreshState]);

  const rcEntitlementKeys = rcCustomerInfo?.entitlements
    ? Object.keys(rcCustomerInfo.entitlements)
    : [];

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
        <Text style={s.headerTitle}>Billing Debug</Text>
        <Pressable onPress={refreshState} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={tokens.color.primary} />
        </Pressable>
      </View>

      <Text style={s.sectionTitle}>Identity</Text>
      <View style={s.card}>
        <Row label="User ID" value={userId || "(not signed in)"} />
        <Row label="Email" value={user?.email ?? "(none)"} />
        <Row label="JWT Token" value={token ? "present" : "absent"} />
        <Row label="Backend URL" value={getBackendBaseUrl()} mono />
      </View>

      <Text style={s.sectionTitle}>RevenueCat State</Text>
      <View style={s.card}>
        <Row label="RC Initialized" value={rcConfigured ? "Yes" : "No"} />
        <Row label="RC App User ID" value={rcAppUserId ?? "(unknown)"} />
        <Row label="Active Entitlements" value={rcEntitlementKeys.length > 0 ? rcEntitlementKeys.join(", ") : "(none)"} />
        {rcCustomerInfo?.activeSubscriptions?.length > 0 && (
          <Row label="Active Subs" value={rcCustomerInfo.activeSubscriptions.join(", ")} />
        )}
        {rcCustomerInfo?.expirationDate && (
          <Row label="Expiration" value={rcCustomerInfo.expirationDate} />
        )}
        <Row label="Platform" value={Platform.OS} />
        {rcError && <Row label="Last RC Error" value={rcError} error />}
      </View>

      <Text style={s.sectionTitle}>Backend State</Text>
      <View style={s.card}>
        <Text style={s.monoLabel}>GET /api/entitlements (context):</Text>
        <Text style={s.mono}>{formatEntitlements(backendEntitlements)}</Text>
        {fetchedEntitlements && (
          <>
            <Text style={[s.monoLabel, { marginTop: 12 }]}>Last manual fetch:</Text>
            <Text style={s.mono}>{formatEntitlements(fetchedEntitlements)}</Text>
          </>
        )}
        {lastRefreshResponse && (
          <>
            <Text style={[s.monoLabel, { marginTop: 12 }]}>Last POST refresh:</Text>
            <Text style={s.mono}>
              {lastRefreshResponse.status} @ {lastRefreshResponse.timestamp}
            </Text>
          </>
        )}
        {cooldown && (
          <>
            <Text style={[s.monoLabel, { marginTop: 12 }]}>Cooldown:</Text>
            <Text style={s.mono}>
              {cooldown.cooldownActive
                ? `Active — next allowed: ${cooldown.nextAllowedAt} (${Math.ceil(cooldown.remainingMs / 1000)}s remaining)`
                : `Inactive — refresh allowed now (last: ${cooldown.lastRefreshAt})`}
            </Text>
          </>
        )}
      </View>

      <Text style={s.sectionTitle}>Actions</Text>
      <View style={s.actionsCard}>
        <ActionButton
          label="Fetch Backend Entitlements"
          icon="cloud-download-outline"
          onPress={handleFetchEntitlements}
          loading={busy === "fetch"}
          disabled={!!busy}
        />
        <ActionButton
          label="Force Mobile Refresh (bypass cooldown)"
          icon="sync-outline"
          onPress={handleForceRefresh}
          loading={busy === "refresh"}
          disabled={!!busy}
        />
        <ActionButton
          label="Restore Purchases"
          icon="receipt-outline"
          onPress={handleRestorePurchases}
          loading={busy === "restore"}
          disabled={!!busy}
        />
        <ActionButton
          label="RC LogOut + LogIn"
          icon="swap-horizontal-outline"
          onPress={handleRCLogOutLogIn}
          loading={busy === "rclogin"}
          disabled={!!busy}
        />
      </View>

      <View style={s.logHeader}>
        <Text style={s.sectionTitle}>Debug Log</Text>
        {log.length > 0 && (
          <Pressable
            onPress={() => {
              clearDebugLog();
              setLog([]);
            }}
            hitSlop={8}
          >
            <Text style={s.clearLog}>Clear</Text>
          </Pressable>
        )}
      </View>
      <View style={s.card}>
        {log.length === 0 ? (
          <Text style={s.logEmpty}>No debug actions yet</Text>
        ) : (
          log.slice(0, 20).map((entry, i) => (
            <View key={i} style={[s.logEntry, i > 0 && s.logBorder]}>
              <Text style={s.logTime}>{entry.timestamp}</Text>
              <Text style={s.logAction}>
                {entry.action} — {entry.result}
              </Text>
              <Text style={s.logDetail}>
                user={entry.userId} rc={entry.rcAppUserId ?? "?"} ent={entry.entitlementCount}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function Row({ label, value, mono, error }: { label: string; value: string; mono?: boolean; error?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={[s.rowValue, mono && s.monoText, error && s.errorText]}
        numberOfLines={3}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[s.actionBtn, disabled && s.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tokens.color.primary} />
      ) : (
        <Ionicons name={icon as any} size={18} color={tokens.color.primary} />
      )}
      <Text style={s.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

const s = {
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  } as const,

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
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

  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    marginBottom: 8,
    marginTop: 16,
  } as const,

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 10,
  } as const,

  actionsCard: {
    gap: 8,
  } as const,

  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  } as const,

  rowLabel: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontWeight: tokens.weight.bold,
    minWidth: 90,
  } as const,

  rowValue: {
    fontSize: tokens.text.small,
    color: tokens.color.text,
    flexShrink: 1,
    textAlign: "right" as const,
  } as const,

  monoText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  } as const,

  errorText: {
    color: "#b91c1c",
  } as const,

  monoLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
  } as const,

  mono: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: tokens.color.text,
    lineHeight: 16,
  } as const,

  actionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  } as const,

  actionBtnDisabled: {
    opacity: 0.5,
  } as const,

  actionBtnText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
    flexShrink: 1,
  } as const,

  logHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: 16,
    marginBottom: 8,
  } as const,

  clearLog: {
    fontSize: tokens.text.small,
    color: "#b91c1c",
    fontWeight: tokens.weight.bold,
  } as const,

  logEmpty: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
  } as const,

  logEntry: {
    gap: 2,
    paddingVertical: 6,
  } as const,

  logBorder: {
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  } as const,

  logTime: {
    fontSize: 10,
    color: tokens.color.subtext,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  } as const,

  logAction: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  } as const,

  logDetail: {
    fontSize: 10,
    color: tokens.color.subtext,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  } as const,
} as const;
