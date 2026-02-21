import type { BackendEntitlements } from "./types";

export function hasEntitlement(
  entitlements: BackendEntitlements | null | undefined,
  productKey?: string,
): boolean {
  if (!entitlements) return false;

  if (entitlements.hasFullAccess) return true;

  if (entitlements.subscription?.status === "active") return true;

  if (entitlements.decisionPass?.active) return true;

  if (productKey) {
    const slug = productKey
      .replace(/^country_lifetime_/, "")
      .replace(/_/g, "-");
    if (entitlements.countryUnlocks.includes(slug)) return true;
  }

  return false;
}

export function hasCountryEntitlement(
  entitlements: BackendEntitlements | null | undefined,
  countrySlug: string,
): boolean {
  if (!entitlements) return false;

  if (entitlements.hasFullAccess) return true;
  if (entitlements.subscription?.status === "active") return true;
  if (entitlements.decisionPass?.active) return true;

  const normalized = countrySlug.replace(/_/g, "-");
  return entitlements.countryUnlocks.includes(normalized);
}
