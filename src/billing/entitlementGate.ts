import type { BackendEntitlements } from "./types";

/**
 * Gate function: returns true only if the user has full subscription access.
 *
 * Decision Pass and Country Lifetime tiers were removed in v1.5 (2-tier
 * pricing). The `decisionPass` and `countryUnlocks` fields on
 * `BackendEntitlements` are kept for backwards-compat with the legacy backend
 * payload but are intentionally ignored here — anything that previously
 * checked them now treats the user as not entitled.
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

/**
 * Country-level entitlement check. With the 2-tier model there is no
 * per-country gating any more — country access is granted iff the user has
 * a full subscription (or `hasFullAccess` is set by the backend).
 */
export function hasCountryEntitlement(
  entitlements: BackendEntitlements | null | undefined,
  _countrySlug: string,
): boolean {
  return hasEntitlement(entitlements);
}
