import type { BackendEntitlements } from "./types";

/**
 * Gate function: returns true only if the user has full subscription access.
 *
 * Decision Pass and Country Lifetime tiers were removed in v1.5 (2-tier
 * pricing) and the corresponding `decisionPass` / `countryUnlocks` fields
 * have been dropped from both the backend payload and `BackendEntitlements`.
 */
export function hasEntitlement(
  entitlements: BackendEntitlements | null | undefined,
  _productKey?: string,
): boolean {
  if (!entitlements) return false;
  if (entitlements.hasFullAccess) return true;
  if (entitlements.subscription?.status === "active") return true;
  return false;
}
