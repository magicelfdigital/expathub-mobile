export interface RevenueCatClient {
  purchasePackage(productId: string): Promise<RevenueCatPurchaseResult>;
  restorePurchases(): Promise<RevenueCatRestoreResult>;
  getOfferings(): Promise<RevenueCatOfferings>;
  logIn(userId: string): Promise<{ customerInfo: RevenueCatCustomerInfo; created: boolean }>;
  logOut(): Promise<void>;
  getCustomerInfo?(): Promise<RevenueCatCustomerInfo>;
}

export interface RevenueCatPurchaseResult {
  customerInfo: RevenueCatCustomerInfo;
  productIdentifier: string;
}

export interface RevenueCatRestoreResult {
  entitlements: {
    active: Record<string, { isActive: boolean; expirationDate: string | null }>;
  };
  activeSubscriptions: string[];
}

export interface RevenueCatCustomerInfo {
  entitlements: {
    active: Record<string, { isActive: boolean; expirationDate: string | null }>;
  };
  activeSubscriptions: string[];
  originalAppUserId: string;
  managementURL: string | null;
}

export interface RevenueCatOfferings {
  current: {
    availablePackages: Array<{
      identifier: string;
      packageType: string;
      product: {
        identifier: string;
        priceString: string;
        price: number;
        title: string;
        description: string;
      };
    }>;
  } | null;
}

export interface BackendEntitlements {
  hasFullAccess: boolean;
  accessSource: "stripe" | "revenuecat" | "promo" | null;
  subscription: {
    status: "active" | "cancelled" | "expired";
    currentPeriodEnd: string;
    platform: "web" | "ios" | "android";
  } | null;
  decisionPass: {
    expiresAt: string;
    active: boolean;
  } | null;
  countryUnlocks: string[];
}

export interface BackendClient {
  refreshMobileBilling(params: {
    userId: string;
    transactionId?: string;
    source: "revenuecat";
    action?: "purchase" | "restore";
  }): Promise<{ success: boolean }>;
  getEntitlements(userId: string): Promise<BackendEntitlements>;
}

export interface OrchestratorResult {
  entitlements: BackendEntitlements;
  status: "confirmed" | "pending" | "timeout" | "error";
  error?: string;
}

export interface PollingConfig {
  intervalMs: number;
  timeoutMs: number;
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  intervalMs: 2000,
  timeoutMs: 60000,
};
