/**
 * Pure derivation of "effective" entitlement flags from the raw inputs that
 * `EntitlementContext` aggregates. Extracted so the boundary matrix can be
 * exhaustively tested without standing up React + AsyncStorage + RevenueCat.
 */

export type AccessType = "subscription" | "sandbox" | "none";
export type EntitlementSource =
  | "revenuecat"
  | "stripe"
  | "sandbox"
  | "none";

export interface EntitlementInputs {
  /** Whether running under __DEV__ — only then can sandbox/promo bypass. */
  isDev: boolean;
  /** Sandbox toggled on AND SANDBOX_ENABLED. */
  sandboxOverrideActive: boolean;
  /** Promo code redeemed and still valid in this session. */
  promoCodeActive: boolean;
  /** Backend-confirmed full access (single source of truth in prod). */
  hasFullAccess: boolean;
  hasProAccess: boolean;
  /** Backend-confirmed access type (only meaningful when hasFullAccess). */
  rawAccessType: AccessType;
  rawSource: EntitlementSource;
  rawExpirationDate: string | null;
}

export interface DerivedEntitlement {
  hasFullAccess: boolean;
  hasProAccess: boolean;
  accessType: AccessType;
  source: EntitlementSource;
  expirationDate: string | null;
  /** True when sandbox/promo code is granting access (DEV-only). */
  devBypass: boolean;
}

export function deriveEntitlement(input: EntitlementInputs): DerivedEntitlement {
  const devBypass =
    input.isDev && (input.sandboxOverrideActive || input.promoCodeActive);

  const hasFullAccess = devBypass ? true : input.hasFullAccess;
  const hasProAccess = devBypass ? true : input.hasProAccess;

  const accessType: AccessType = devBypass ? "sandbox" : input.rawAccessType;
  const source: EntitlementSource = devBypass ? "sandbox" : input.rawSource;

  return {
    hasFullAccess,
    hasProAccess,
    accessType,
    source,
    expirationDate: input.rawExpirationDate,
    devBypass,
  };
}
