import { Platform } from "react-native";
import type { BackendClient, BackendEntitlements } from "./types";

const EMPTY_ENTITLEMENTS: BackendEntitlements = {
  hasFullAccess: false,
  accessSource: null,
  subscription: null,
};

function billingLog(msg: string) {
  console.log(`[BILLING] ${msg}`);
}

// Production backend host. Used as the final fallback on every platform when
// no explicit env override is provided. This is a known constant (mirrored in
// eas.json and PRD.md) and is deliberately hardcoded so that a missing build-
// time env var can never crash the app or silently point us at the wrong host.
export const PROD_BACKEND_URL = "https://www.expathub.website";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function getBackendBase(): string {
  const explicit = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return stripTrailingSlash(`https://${domain}`);

  // No env override available. Web in production is served from the same
  // origin as the backend, so an empty string (same-origin relative fetches)
  // is correct there. Native always needs an absolute URL, so fall back to
  // the known production host rather than throwing.
  if (Platform.OS === "web") return "";
  return PROD_BACKEND_URL;
}

export function createBackendClient(getToken: () => string | null): BackendClient {
  function authHeaders(): Record<string, string> {
    const token = getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  return {
    async refreshMobileBilling(params) {
      const base = getBackendBase();
      billingLog(`POST ${base}/api/billing/mobile/refresh for user=${params.userId} action=${params.action ?? "sync"}`);
      const res = await fetch(`${base}/api/billing/mobile/refresh`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          userId: params.userId,
          transactionId: params.transactionId,
          source: params.source,
          action: params.action,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        billingLog(`refresh failed: ${res.status} ${text}`);
        throw new Error(`Backend refresh failed: ${res.status}`);
      }

      const data = await res.json();
      billingLog(`refresh success`);
      return { success: true };
    },

    async getEntitlements(userId) {
      const base = getBackendBase();
      billingLog(`GET ${base}/api/entitlements`);
      const res = await fetch(`${base}/api/entitlements`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!res.ok) {
        billingLog(`getEntitlements failed: ${res.status}`);
        // Surface as a thrown error so the caller (EntitlementContext.refresh)
        // hits its fail-closed catch path explicitly rather than silently
        // accepting an empty-entitlements response that's indistinguishable
        // from a legitimate "user has no subscription" response.
        throw new Error(`Backend entitlements failed: ${res.status}`);
      }

      const data = await res.json();

      const entitlements: BackendEntitlements = {
        hasFullAccess: Boolean(data.hasFullAccess ?? data.hasProAccess),
        accessSource: data.accessSource ?? data.source ?? null,
        subscription: data.subscription ?? null,
      };

      billingLog(`entitlements: hasFullAccess=${entitlements.hasFullAccess}, source=${entitlements.accessSource}`);
      return entitlements;
    },
  };
}
