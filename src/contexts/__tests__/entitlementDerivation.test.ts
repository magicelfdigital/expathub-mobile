import {
  deriveEntitlement,
  type EntitlementInputs,
} from "../entitlementDerivation";

const NOW = Date.UTC(2026, 4, 6); // 2026-05-06
const RT_EXPIRES = NOW + 1000;

const baseFromBackend = (over: Partial<EntitlementInputs> = {}): EntitlementInputs => ({
  isDev: false,
  sandboxOverrideActive: false,
  promoCodeActive: false,
  hasFullAccess: false,
  hasProAccess: false,
  rawAccessType: "none",
  rawSource: "none",
  rawExpirationDate: null,
  reverseTrialActive: false,
  reverseTrialExpiresAt: null,
  ...over,
});

describe("deriveEntitlement — hard backend grants in production", () => {
  it("preserves a backend-confirmed Stripe subscription verbatim", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        hasFullAccess: true,
        hasProAccess: true,
        rawAccessType: "subscription",
        rawSource: "stripe",
        rawExpirationDate: "2027-01-01T00:00:00Z",
      }),
    );
    expect(r).toEqual({
      hasFullAccess: true,
      hasProAccess: true,
      accessType: "subscription",
      source: "stripe",
      expirationDate: "2027-01-01T00:00:00Z",
      devBypass: false,
    });
  });

  it("preserves a backend-confirmed RevenueCat subscription", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        hasFullAccess: true,
        hasProAccess: true,
        rawAccessType: "subscription",
        rawSource: "revenuecat",
        rawExpirationDate: "2026-09-01T00:00:00Z",
      }),
    );
    expect(r.source).toBe("revenuecat");
    expect(r.accessType).toBe("subscription");
  });

  it("returns a fully-locked state when backend says no access and no trial", () => {
    const r = deriveEntitlement(baseFromBackend());
    expect(r).toEqual({
      hasFullAccess: false,
      hasProAccess: false,
      accessType: "none",
      source: "none",
      expirationDate: null,
      devBypass: false,
    });
  });
});

describe("deriveEntitlement — reverse trial overlay", () => {
  it("upgrades a non-paid user to reverse_trial access while trial is active", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        reverseTrialActive: true,
        reverseTrialExpiresAt: RT_EXPIRES,
      }),
    );
    expect(r.hasFullAccess).toBe(true);
    expect(r.hasProAccess).toBe(true);
    expect(r.accessType).toBe("reverse_trial");
    expect(r.source).toBe("reverse_trial");
    // expiration date should be the trial expiration ISO string, not null
    expect(r.expirationDate).toBe(new Date(RT_EXPIRES).toISOString());
  });

  it("does NOT overwrite a real paid subscription's expiration with the trial's expiration", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        hasFullAccess: true,
        hasProAccess: true,
        rawAccessType: "subscription",
        rawSource: "stripe",
        rawExpirationDate: "2027-01-01T00:00:00Z",
        reverseTrialActive: true,
        reverseTrialExpiresAt: RT_EXPIRES,
      }),
    );
    // Real subscription wins on every field — trial is irrelevant.
    expect(r.accessType).toBe("subscription");
    expect(r.source).toBe("stripe");
    expect(r.expirationDate).toBe("2027-01-01T00:00:00Z");
  });

  it("expired reverse trial (active=false) does not grant any access", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        reverseTrialActive: false,
        reverseTrialExpiresAt: NOW - 1000,
      }),
    );
    expect(r.hasFullAccess).toBe(false);
    expect(r.accessType).toBe("none");
    expect(r.expirationDate).toBeNull();
  });
});

describe("deriveEntitlement — DEV bypasses (sandbox + promo code)", () => {
  it("DEV + sandbox override grants sandbox access regardless of backend", () => {
    const r = deriveEntitlement(
      baseFromBackend({ isDev: true, sandboxOverrideActive: true }),
    );
    expect(r).toMatchObject({
      hasFullAccess: true,
      hasProAccess: true,
      accessType: "sandbox",
      source: "sandbox",
      devBypass: true,
    });
  });

  it("DEV + promoCodeActive grants sandbox access regardless of backend", () => {
    const r = deriveEntitlement(
      baseFromBackend({ isDev: true, promoCodeActive: true }),
    );
    expect(r.devBypass).toBe(true);
    expect(r.accessType).toBe("sandbox");
    expect(r.source).toBe("sandbox");
  });

  it("PROD + sandbox override does NOT grant access (sandbox is DEV-only)", () => {
    const r = deriveEntitlement(
      baseFromBackend({ isDev: false, sandboxOverrideActive: true }),
    );
    expect(r.devBypass).toBe(false);
    expect(r.hasFullAccess).toBe(false);
    expect(r.accessType).toBe("none");
  });

  it("PROD + promoCodeActive does NOT grant access (promo is DEV-only)", () => {
    const r = deriveEntitlement(
      baseFromBackend({ isDev: false, promoCodeActive: true }),
    );
    expect(r.devBypass).toBe(false);
    expect(r.hasFullAccess).toBe(false);
  });

  it("DEV bypass takes precedence over reverse trial (sandbox wins)", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        isDev: true,
        sandboxOverrideActive: true,
        reverseTrialActive: true,
        reverseTrialExpiresAt: RT_EXPIRES,
      }),
    );
    expect(r.accessType).toBe("sandbox");
    expect(r.source).toBe("sandbox");
  });

  it("DEV bypass takes precedence over backend full access (sandbox label wins)", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        isDev: true,
        promoCodeActive: true,
        hasFullAccess: true,
        hasProAccess: true,
        rawAccessType: "subscription",
        rawSource: "stripe",
      }),
    );
    expect(r.accessType).toBe("sandbox");
    expect(r.source).toBe("sandbox");
  });
});

describe("deriveEntitlement — pro/full divergence", () => {
  it("hasFullAccess=false but hasProAccess=true is preserved (legacy boundary)", () => {
    const r = deriveEntitlement(
      baseFromBackend({
        hasFullAccess: false,
        hasProAccess: true,
        rawAccessType: "subscription",
        rawSource: "stripe",
      }),
    );
    // Without hasFullAccess and without trial, expiration stays null.
    expect(r.hasFullAccess).toBe(false);
    expect(r.hasProAccess).toBe(true);
    expect(r.expirationDate).toBeNull();
  });
});
