import { Platform } from "react-native";
import { BillingOrchestrator } from "./orchestrator";
import { createBackendClient } from "./backendClient";
import type { RevenueCatClient, BackendClient } from "./types";

export { hasEntitlement, hasCountryEntitlement } from "./entitlementGate";
export { BillingOrchestrator } from "./orchestrator";
export { createBackendClient } from "./backendClient";
export type { BackendEntitlements, OrchestratorResult } from "./types";
export {
  BillingRefreshError,
  EntitlementPollingTimeoutError,
  RevenueCatPurchaseError,
} from "./errors";
export { clearCooldown as clearRefreshCooldown } from "./refreshCooldown";

function createRCClient(): RevenueCatClient {
  async function loadRC() {
    if (Platform.OS === "web") return null;
    try {
      const mod = await import("react-native-purchases");
      return mod.default;
    } catch {
      return null;
    }
  }

  return {
    async purchasePackage(productId: string) {
      const rc = await loadRC();
      if (!rc) throw new Error("Purchases module not available");

      const offerings = await rc.getOfferings();
      if (!offerings.current?.availablePackages.length) {
        throw new Error("No products available");
      }
      const pkg = offerings.current.availablePackages.find(
        (p) => p.product.identifier === productId,
      );
      if (!pkg) throw new Error(`Product "${productId}" not found`);

      const result = await rc.purchasePackage(pkg);
      return {
        customerInfo: result.customerInfo as any,
        productIdentifier: productId,
      };
    },

    async restorePurchases() {
      const rc = await loadRC();
      if (!rc) throw new Error("Purchases module not available");
      const info = await rc.restorePurchases();
      return {
        entitlements: info.entitlements as any,
        activeSubscriptions: info.activeSubscriptions,
      };
    },

    async getOfferings() {
      const rc = await loadRC();
      if (!rc) return { current: null };
      const offerings = await rc.getOfferings();
      return { current: offerings.current as any };
    },

    async logIn(userId: string) {
      const rc = await loadRC();
      if (!rc) throw new Error("Purchases module not available");
      const result = await rc.logIn(userId);
      return {
        customerInfo: result.customerInfo as any,
        created: result.created,
      };
    },

    async logOut() {
      const rc = await loadRC();
      if (!rc) return;
      await rc.logOut();
    },
  };
}

let _tokenRef: { current: () => string | null } = { current: () => null };
let _orchestrator: BillingOrchestrator | null = null;
let _backendClient: BackendClient | null = null;

function tokenGetter(): string | null {
  return _tokenRef.current();
}

export function getOrchestrator(getToken: () => string | null): BillingOrchestrator {
  _tokenRef.current = getToken;
  if (!_orchestrator) {
    _backendClient = createBackendClient(tokenGetter);
    _orchestrator = new BillingOrchestrator(createRCClient(), _backendClient, {
      intervalMs: 2000,
      timeoutMs: 60000,
    });
  }
  return _orchestrator;
}

export function getBackendClientInstance(getToken: () => string | null): BackendClient {
  _tokenRef.current = getToken;
  if (!_backendClient) {
    _backendClient = createBackendClient(tokenGetter);
  }
  return _backendClient;
}

export function resetOrchestrator() {
  _orchestrator = null;
  _backendClient = null;
  _tokenRef.current = () => null;
}
