import {
  deriveEntitlement,
  type EntitlementInputs,
} from "../entitlementDerivation";

const baseFromBackend = (over: Partial<EntitlementInputs> = {}): EntitlementInputs => ({
  isDev: false,
  sandboxOverrideActive: false,
  promoCodeActive: false,
  hasFullAccess: false,
  hasProAccess: false,
  rawAccessType: "none",
  rawSource: "none",
  rawExpirationDate: null,
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

  it("returns a fully-locked state when backend says no access", () => {
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
    expect(r.hasFullAccess).toBe(false);
    expect(r.hasProAccess).toBe(true);
    expect(r.expirationDate).toBeNull();
  });
});
