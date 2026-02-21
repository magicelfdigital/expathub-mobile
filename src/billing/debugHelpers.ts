import { Platform } from "react-native";
import { getBackendBase, createBackendClient } from "./backendClient";
import { shouldRefresh, clearCooldown, recordRefresh, _getLastRefreshTime } from "./refreshCooldown";
import type { BackendEntitlements } from "./types";

const REDACTED_KEYS = ["token", "jwt", "secret", "password", "apikey", "authorization"];

export function redactSensitiveFields(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveFields);
  if (typeof obj !== "object") return obj;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.some((rk) => key.toLowerCase().includes(rk))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitiveFields(value);
    }
  }
  return result;
}

export function formatEntitlements(ent: BackendEntitlements | null): string {
  if (!ent) return "null (no data)";
  return JSON.stringify(redactSensitiveFields(ent), null, 2);
}

export function formatTimestamp(ms: number | null | undefined): string {
  if (ms == null) return "never";
  return new Date(ms).toISOString();
}

export interface CooldownStatus {
  lastRefreshAt: string;
  nextAllowedAt: string;
  cooldownActive: boolean;
  remainingMs: number;
}

const COOLDOWN_MS = 10 * 60 * 1000;

export function getCooldownStatus(userId: string): CooldownStatus {
  const lastMs = _getLastRefreshTime(userId);
  if (lastMs === undefined) {
    return {
      lastRefreshAt: "never",
      nextAllowedAt: "now (no prior refresh)",
      cooldownActive: false,
      remainingMs: 0,
    };
  }
  const nextAllowedMs = lastMs + COOLDOWN_MS;
  const now = Date.now();
  const remaining = Math.max(0, nextAllowedMs - now);
  return {
    lastRefreshAt: new Date(lastMs).toISOString(),
    nextAllowedAt: new Date(nextAllowedMs).toISOString(),
    cooldownActive: remaining > 0,
    remainingMs: remaining,
  };
}

export interface DebugLogEntry {
  timestamp: string;
  userId: string;
  rcAppUserId: string | null;
  action: string;
  result: string;
  entitlementCount: number;
}

const debugLog: DebugLogEntry[] = [];
const MAX_LOG_ENTRIES = 50;

export function addDebugLogEntry(entry: Omit<DebugLogEntry, "timestamp">): void {
  debugLog.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  if (debugLog.length > MAX_LOG_ENTRIES) {
    debugLog.length = MAX_LOG_ENTRIES;
  }
}

export function getDebugLog(): DebugLogEntry[] {
  return [...debugLog];
}

export function clearDebugLog(): void {
  debugLog.length = 0;
}

export interface DebugFetchEntitlementsResult {
  success: boolean;
  entitlements: BackendEntitlements | null;
  error?: string;
}

export async function debugFetchEntitlements(
  getToken: () => string | null,
  userId: string,
  rcAppUserId: string | null,
): Promise<DebugFetchEntitlementsResult> {
  try {
    const client = createBackendClient(getToken);
    const ent = await client.getEntitlements(userId);
    addDebugLogEntry({
      userId,
      rcAppUserId,
      action: "fetch_entitlements",
      result: "success",
      entitlementCount: (ent.countryUnlocks?.length ?? 0) + (ent.hasFullAccess ? 1 : 0),
    });
    return { success: true, entitlements: ent };
  } catch (e: any) {
    addDebugLogEntry({
      userId,
      rcAppUserId,
      action: "fetch_entitlements",
      result: `error: ${e?.message}`,
      entitlementCount: 0,
    });
    return { success: false, entitlements: null, error: e?.message };
  }
}

export interface DebugForceRefreshResult {
  refreshSuccess: boolean;
  refreshError?: string;
  entitlements: BackendEntitlements | null;
  entitlementError?: string;
}

export async function debugForceRefresh(
  getToken: () => string | null,
  userId: string,
  rcAppUserId: string | null,
): Promise<DebugForceRefreshResult> {
  clearCooldown(userId);

  const client = createBackendClient(getToken);
  let refreshSuccess = false;
  let refreshError: string | undefined;

  try {
    await client.refreshMobileBilling({ userId, source: "revenuecat" });
    recordRefresh(userId);
    refreshSuccess = true;
  } catch (e: any) {
    refreshError = e?.message;
    recordRefresh(userId);
  }

  let entitlements: BackendEntitlements | null = null;
  let entitlementError: string | undefined;
  try {
    entitlements = await client.getEntitlements(userId);
  } catch (e: any) {
    entitlementError = e?.message;
  }

  addDebugLogEntry({
    userId,
    rcAppUserId,
    action: "force_refresh",
    result: refreshSuccess ? "success" : `error: ${refreshError}`,
    entitlementCount: (entitlements?.countryUnlocks?.length ?? 0) + (entitlements?.hasFullAccess ? 1 : 0),
  });

  return { refreshSuccess, refreshError, entitlements, entitlementError };
}

export function getBackendBaseUrl(): string {
  try {
    return getBackendBase();
  } catch {
    return "(not configured — would throw on native)";
  }
}
