/**
 * Pure derivation of "effective" entitlement flags from the raw inputs that
 * `EntitlementContext` aggregates. Extracted so the boundary matrix can be
 * exhaustively tested without standing up React + AsyncStorage + RevenueCat.
 *
 * Mirrors the production rules in src/contexts/EntitlementContext.tsx
 * (search "effectiveHasFullAccess" / "effectiveAccessType").
 */

export type AccessType = "subscription" | "sandbox" | "none" | "reverse_trial";
export type EntitlementSource =
  | "revenuecat"
  | "stripe"
  | "sandbox"
  | "none"
  | "reverse_trial";

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
  reverseTrialActive: boolean;
  reverseTrialExpiresAt: number | null;
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

  const hasFullAccess = devBypass
    ? true
    : input.hasFullAccess || input.reverseTrialActive;
  const hasProAccess = devBypass
    ? true
    : input.hasProAccess || input.reverseTrialActive;

  const accessType: AccessType = devBypass
    ? "sandbox"
    : input.hasFullAccess
      ? input.rawAccessType
      : input.reverseTrialActive
        ? "reverse_trial"
        : input.rawAccessType;

  const source: EntitlementSource = devBypass
    ? "sandbox"
    : input.hasFullAccess
      ? input.rawSource
      : input.reverseTrialActive
        ? "reverse_trial"
        : input.rawSource;

  const expirationDate =
    !input.hasFullAccess && input.reverseTrialActive && input.reverseTrialExpiresAt
      ? new Date(input.reverseTrialExpiresAt).toISOString()
      : input.rawExpirationDate;

  return {
    hasFullAccess,
    hasProAccess,
    accessType,
    source,
    expirationDate,
    devBypass,
  };
}
