import { hasEntitlement, hasCountryEntitlement } from "../entitlementGate";
import type { BackendEntitlements } from "../types";

function makeBase(): BackendEntitlements {
  return {
    hasFullAccess: false,
    accessSource: null,
    subscription: null,
  };
}

describe("hasEntitlement (2-tier model)", () => {
  it("returns false for null entitlements", () => {
    expect(hasEntitlement(null)).toBe(false);
    expect(hasEntitlement(undefined)).toBe(false);
  });

  it("returns false when no access", () => {
    expect(hasEntitlement(makeBase())).toBe(false);
  });

  it("returns true when hasFullAccess is true", () => {
    expect(hasEntitlement({ ...makeBase(), hasFullAccess: true })).toBe(true);
  });

  it("returns true when subscription is active", () => {
    expect(
      hasEntitlement({
        ...makeBase(),
        subscription: {
          status: "active",
          currentPeriodEnd: "2026-12-31T00:00:00Z",
          platform: "ios",
        },
      }),
    ).toBe(true);
  });

  it("returns false when subscription is expired", () => {
    expect(
      hasEntitlement({
        ...makeBase(),
        subscription: {
          status: "expired",
          currentPeriodEnd: "2025-01-01T00:00:00Z",
          platform: "ios",
        },
      }),
    ).toBe(false);
  });

  it("returns true for any productKey when hasFullAccess is true", () => {
    expect(
      hasEntitlement(
        { ...makeBase(), hasFullAccess: true },
        "country_lifetime_spain",
      ),
    ).toBe(true);
  });
});

describe("hasCountryEntitlement (2-tier model)", () => {
  it("returns false for null entitlements", () => {
    expect(hasCountryEntitlement(null, "portugal")).toBe(false);
    expect(hasCountryEntitlement(undefined, "portugal")).toBe(false);
  });

  it("returns true when hasFullAccess regardless of country", () => {
    expect(
      hasCountryEntitlement(
        { ...makeBase(), hasFullAccess: true },
        "malta",
      ),
    ).toBe(true);
  });

  it("returns true when subscription is active", () => {
    expect(
      hasCountryEntitlement(
        {
          ...makeBase(),
          subscription: {
            status: "active",
            currentPeriodEnd: "2026-12-31T00:00:00Z",
            platform: "ios",
          },
        },
        "spain",
      ),
    ).toBe(true);
  });

  it("returns false when no access", () => {
    expect(hasCountryEntitlement(makeBase(), "ecuador")).toBe(false);
  });
});
