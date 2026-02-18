import { Platform } from "react-native";

import {
  RC_API_KEY_IOS,
  RC_API_KEY_ANDROID,
  ENTITLEMENT_ID,
  ENTITLEMENT_DECISION_ACCESS,
  ENTITLEMENT_FULL_ACCESS,
  ENTITLEMENT_COUNTRY_PREFIX,
} from "@/src/config/subscription";

type PurchasesModule = typeof import("react-native-purchases");

let Purchases: PurchasesModule["default"] | null = null;
let LOG_LEVEL: PurchasesModule["LOG_LEVEL"] | null = null;
let PURCHASES_ERROR_CODE: PurchasesModule["PURCHASES_ERROR_CODE"] | null = null;
let PACKAGE_TYPE: PurchasesModule["PACKAGE_TYPE"] | null = null;

function rcLog(msg: string) {
  console.log(`[RC] ${msg}`);
}

function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

async function loadPurchases() {
  if (Platform.OS === "web") return null;
  if (Purchases) return Purchases;
  try {
    const mod = await import("react-native-purchases");
    Purchases = mod.default;
    LOG_LEVEL = mod.LOG_LEVEL;
    PURCHASES_ERROR_CODE = mod.PURCHASES_ERROR_CODE;
    PACKAGE_TYPE = mod.PACKAGE_TYPE;
    return Purchases;
  } catch (e) {
    rcLog(`Failed to load purchases module: ${e}`);
    return null;
  }
}

let initialized = false;

export function isRCInitialized(): boolean {
  return initialized;
}

export async function initPurchases(): Promise<boolean> {
  if (Platform.OS === "web") {
    rcLog("Skipping init on web platform");
    return false;
  }
  if (initialized) {
    rcLog("Already initialized, skipping");
    return true;
  }
  const rc = await loadPurchases();
  if (!rc) {
    rcLog("FAILED: Could not load purchases module");
    return false;
  }

  const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  if (!apiKey) {
    rcLog(`FAILED: No API key found for platform: ${Platform.OS}. Check EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY env vars.`);
    return false;
  }

  try {
    if (__DEV__ && LOG_LEVEL) {
      rc.setLogLevel(LOG_LEVEL.DEBUG);
    }

    rc.configure({ apiKey });
    initialized = true;
    rcLog(`RevenueCat configured (key ends with: ${maskKey(apiKey)})`);

    try {
      const info = await rc.getCustomerInfo();
      rcLog(`App User ID: ${info.originalAppUserId}`);
      const activeKeys = Object.keys(info.entitlements.active);
      rcLog(`Active entitlements: ${activeKeys.length > 0 ? activeKeys.join(", ") : "none"}`);
    } catch (e) {
      rcLog(`Warning: Could not read initial CustomerInfo: ${e}`);
    }

    return true;
  } catch (e) {
    rcLog(`FAILED: Configure threw: ${e}`);
    return false;
  }
}

export async function loginUser(appUserId: string): Promise<void> {
  if (!initialized) {
    rcLog(`loginUser called before init, attempting initPurchases first for user ${appUserId}`);
    const ok = await initPurchases();
    if (!ok) {
      rcLog(`loginUser: initPurchases failed, cannot log in user ${appUserId}`);
      return;
    }
  }
  const rc = await loadPurchases();
  if (!rc) return;
  try {
    const { customerInfo } = await rc.logIn(appUserId);
    const activeKeys = Object.keys(customerInfo.entitlements.active);
    rcLog(`Logged in user: ${appUserId}`);
    rcLog(`App User ID after logIn: ${customerInfo.originalAppUserId}`);
    rcLog(`Active entitlements after logIn: ${activeKeys.length > 0 ? activeKeys.join(", ") : "none"}`);
  } catch (e) {
    rcLog(`Login error: ${e}`);
  }
}

export async function logoutUser(): Promise<void> {
  if (!initialized) return;
  const rc = await loadPurchases();
  if (!rc) return;
  try {
    await rc.logOut();
    rcLog("Logged out");
  } catch (e) {
    rcLog(`Logout error: ${e}`);
  }
}

export type CustomerInfoListener = (info: {
  hasProAccess: boolean;
  activeSubscriptions: string[];
  managementURL: string | null;
}) => void;

export function addCustomerInfoListener(
  listener: CustomerInfoListener,
): () => void {
  if (Platform.OS === "web" || !initialized) return () => {};

  let remove: (() => void) | null = null;

  loadPurchases().then((rc) => {
    if (!rc) return;
    const unsub = rc.addCustomerInfoUpdateListener((info) => {
      const hasFullSub = !!info.entitlements.active[ENTITLEMENT_FULL_ACCESS];
      const hasDecisionPass = !!info.entitlements.active[ENTITLEMENT_DECISION_ACCESS];
      const hasCountryUnlock = Object.keys(info.entitlements.active).some((k) => k.startsWith(ENTITLEMENT_COUNTRY_PREFIX));
      const hasAccess = hasFullSub || hasDecisionPass || hasCountryUnlock;
      rcLog(`CustomerInfo update: hasAccess=${hasAccess}, active=[${Object.keys(info.entitlements.active).join(", ")}]`);
      listener({
        hasProAccess: hasAccess,
        activeSubscriptions: info.activeSubscriptions,
        managementURL: info.managementURL,
      });
    });
    remove = unsub ?? null;
  });

  return () => {
    remove?.();
  };
}

export type CustomerInfoResult = {
  hasProAccess: boolean;
  activeSubscriptions: string[];
  managementURL: string | null;
  expirationDate: string | null;
  entitlements: Record<string, boolean>;
  error?: string;
};

const emptyCustomerInfo: CustomerInfoResult = {
  hasProAccess: false,
  activeSubscriptions: [],
  managementURL: null,
  expirationDate: null,
  entitlements: {},
};

export async function getCustomerInfo(): Promise<CustomerInfoResult> {
  if (Platform.OS === "web") return emptyCustomerInfo;

  if (!initialized) {
    rcLog("getCustomerInfo called but RC not initialized");
    return { ...emptyCustomerInfo, error: "RevenueCat not initialized" };
  }

  const rc = await loadPurchases();
  if (!rc) {
    rcLog("getCustomerInfo: module not available");
    return { ...emptyCustomerInfo, error: "Purchases module not available" };
  }

  try {
    const info = await rc.getCustomerInfo();

    const activeEntitlements: Record<string, boolean> = {};
    for (const key of Object.keys(info.entitlements.active)) {
      activeEntitlements[key] = true;
    }

    const hasFullSub = !!info.entitlements.active[ENTITLEMENT_FULL_ACCESS];
    const hasDecisionPass = !!info.entitlements.active[ENTITLEMENT_DECISION_ACCESS];
    const hasCountryUnlock = Object.keys(activeEntitlements).some((k) => k.startsWith(ENTITLEMENT_COUNTRY_PREFIX));
    const hasAnyAccess = hasFullSub || hasDecisionPass || hasCountryUnlock;

    const primaryEntitlement = info.entitlements.active[ENTITLEMENT_FULL_ACCESS]
      ?? info.entitlements.active[ENTITLEMENT_DECISION_ACCESS];

    rcLog(`getCustomerInfo: hasAccess=${hasAnyAccess}, entitlements=[${Object.keys(activeEntitlements).join(", ")}]`);

    return {
      hasProAccess: hasAnyAccess,
      activeSubscriptions: info.activeSubscriptions,
      managementURL: info.managementURL,
      expirationDate: primaryEntitlement?.expirationDate ?? null,
      entitlements: activeEntitlements,
    };
  } catch (e: any) {
    rcLog(`getCustomerInfo ERROR: ${e?.message ?? e}`);
    return { ...emptyCustomerInfo, error: e?.message ?? "Failed to load customer info" };
  }
}

export async function getEntitlements(): Promise<{ hasProAccess: boolean }> {
  const info = await getCustomerInfo();
  return { hasProAccess: info.hasProAccess };
}

export type OfferingPackage = {
  identifier: string;
  packageType: string;
  productId: string;
  priceString: string;
  price: number;
  title: string;
  description: string;
  introPrice: string | null;
};

export async function getOfferings(): Promise<{
  current: OfferingPackage[];
  monthlyPackage: OfferingPackage | null;
  annualPackage: OfferingPackage | null;
  error?: string;
}> {
  const empty = { current: [] as OfferingPackage[], monthlyPackage: null as OfferingPackage | null, annualPackage: null as OfferingPackage | null };

  if (Platform.OS === "web") return empty;

  if (!initialized) {
    rcLog("getOfferings called but RC not initialized");
    return { ...empty, error: "RevenueCat not initialized" };
  }

  const rc = await loadPurchases();
  if (!rc) return { ...empty, error: "Purchases module not available" };

  try {
    const offerings = await rc.getOfferings();
    if (!offerings.current) {
      rcLog("getOfferings: no current offering");
      return { ...empty, error: "No offerings configured in RevenueCat" };
    }

    const packages: OfferingPackage[] =
      offerings.current.availablePackages.map((pkg) => ({
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        productId: pkg.product.identifier,
        priceString: pkg.product.priceString,
        price: pkg.product.price,
        title: pkg.product.title,
        description: pkg.product.description,
        introPrice: (pkg.product as any).introPrice?.priceString ?? null,
      }));

    const monthlyPackage =
      packages.find(
        (p) =>
          p.packageType === PACKAGE_TYPE?.MONTHLY ||
          p.identifier === "$rc_monthly",
      ) ?? null;

    const annualPackage =
      packages.find(
        (p) =>
          p.packageType === PACKAGE_TYPE?.ANNUAL ||
          p.identifier === "$rc_annual",
      ) ?? null;

    rcLog(`getOfferings: ${packages.length} packages loaded`);
    return { current: packages, monthlyPackage, annualPackage };
  } catch (e: any) {
    rcLog(`getOfferings ERROR: ${e?.message ?? e}`);
    return { ...empty, error: e?.message ?? "Failed to load offerings" };
  }
}

export type PurchaseStatus = "purchased" | "already_owned" | "cancelled";

export type PurchaseResult = {
  status: PurchaseStatus;
  hasProAccess: boolean;
};

export async function purchasePackage(
  productId: string,
): Promise<PurchaseResult> {
  if (!initialized) {
    rcLog(`purchasePackage: RC not initialized, cannot purchase ${productId}`);
    throw new Error("Purchase system is not ready. Please restart the app and try again.");
  }
  const rc = await loadPurchases();
  if (!rc) {
    rcLog(`purchasePackage: Purchases module not available for ${productId}`);
    throw new Error("Purchase system is not available. Please restart the app and try again.");
  }

  try {
    rcLog(`purchasePackage: initiating purchase for productId=${productId}`);
    const offerings = await rc.getOfferings();

    if (!offerings.current?.availablePackages.length) {
      throw new Error("No products available. Please try again later.");
    }

    const pkg = offerings.current.availablePackages.find(
      (p) => p.product.identifier === productId,
    );

    if (!pkg) {
      throw new Error(`Product "${productId}" not found in current offering.`);
    }

    rcLog(`purchasePackage: native purchase dialog opening for ${productId}`);
    const result = await rc.purchasePackage(pkg);
    const activeKeys = Object.keys(result.customerInfo.entitlements.active);
    const hasAccess =
      !!result.customerInfo.entitlements.active[ENTITLEMENT_FULL_ACCESS] ||
      !!result.customerInfo.entitlements.active[ENTITLEMENT_DECISION_ACCESS] ||
      activeKeys.some((k) => k.startsWith(ENTITLEMENT_COUNTRY_PREFIX));
    rcLog(`purchasePackage: complete for ${productId}, status=purchased, hasAccess=${hasAccess}, activeEntitlements=[${activeKeys.join(", ")}]`);
    return { status: "purchased", hasProAccess: hasAccess };
  } catch (e: any) {
    if (e.userCancelled) {
      rcLog(`purchasePackage: user cancelled for ${productId}`);
      return { status: "cancelled", hasProAccess: false };
    }

    if (
      PURCHASES_ERROR_CODE &&
      e.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR
    ) {
      rcLog(`purchasePackage: product already owned for ${productId}, checking entitlements`);
      const info = await getEntitlements();
      rcLog(`purchasePackage: already-owned check, status=already_owned, hasProAccess=${info.hasProAccess}`);
      return { status: "already_owned", hasProAccess: info.hasProAccess };
    }

    rcLog(`purchasePackage: error for ${productId}: ${e?.message ?? e}`);
    throw e;
  }
}

export async function restorePurchases(): Promise<{
  hasProAccess: boolean;
  restoredSubscriptions: string[];
}> {
  if (!initialized) return { hasProAccess: false, restoredSubscriptions: [] };
  const rc = await loadPurchases();
  if (!rc) return { hasProAccess: false, restoredSubscriptions: [] };

  try {
    const info = await rc.restorePurchases();
    const hasAccess =
      !!info.entitlements.active[ENTITLEMENT_FULL_ACCESS] ||
      !!info.entitlements.active[ENTITLEMENT_DECISION_ACCESS] ||
      Object.keys(info.entitlements.active).some((k) => k.startsWith(ENTITLEMENT_COUNTRY_PREFIX));
    rcLog(`Restore complete: hasAccess=${hasAccess}, subs=[${info.activeSubscriptions.join(", ")}]`);
    return {
      hasProAccess: hasAccess,
      restoredSubscriptions: info.activeSubscriptions,
    };
  } catch (e: any) {
    rcLog(`Restore error: ${e?.message ?? e}`);
    return { hasProAccess: false, restoredSubscriptions: [] };
  }
}

export async function getManagementURL(): Promise<string | null> {
  const info = await getCustomerInfo();
  return info.managementURL;
}

export async function getAppUserId(): Promise<string | null> {
  if (Platform.OS === "web" || !initialized) return null;
  const rc = await loadPurchases();
  if (!rc) return null;
  try {
    const info = await rc.getCustomerInfo();
    return info.originalAppUserId ?? null;
  } catch {
    return null;
  }
}
