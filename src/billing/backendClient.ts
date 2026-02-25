import { Platform } from "react-native";
import type { BackendClient, BackendEntitlements } from "./types";

const EMPTY_ENTITLEMENTS: BackendEntitlements = {
  hasFullAccess: false,
  accessSource: null,
  subscription: null,
  decisionPass: null,
  countryUnlocks: [],
};

function billingLog(msg: string) {
  console.log(`[BILLING] ${msg}`);
}

const PRODUCTION_BACKEND = "https://www.expathub.website";

export function getBackendBase(): string {
  if (Platform.OS !== "web") {
    return PRODUCTION_BACKEND;
  }

  const explicit = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  return PRODUCTION_BACKEND;
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
        return EMPTY_ENTITLEMENTS;
      }

      const data = await res.json();

      const entitlements: BackendEntitlements = {
        hasFullAccess: Boolean(data.hasFullAccess ?? data.hasProAccess),
        accessSource: data.accessSource ?? data.source ?? null,
        subscription: data.subscription ?? null,
        decisionPass: data.decisionPass ?? null,
        countryUnlocks: data.countryUnlocks ?? [],
      };

      billingLog(`entitlements: hasFullAccess=${entitlements.hasFullAccess}, source=${entitlements.accessSource}, countries=[${entitlements.countryUnlocks.join(",")}]`);
      return entitlements;
    },
  };
}
