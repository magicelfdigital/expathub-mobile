import { hasEntitlement, hasCountryEntitlement } from "../entitlementGate";
import type { BackendEntitlements } from "../types";

function makeBase(): BackendEntitlements {
  return {
    hasFullAccess: false,
    accessSource: null,
    subscription: null,
    decisionPass: null,
    countryUnlocks: [],
  };
}

describe("hasEntitlement", () => {
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

  it("returns true when decision pass is active", () => {
    expect(
      hasEntitlement({
        ...makeBase(),
        decisionPass: { expiresAt: "2026-12-31T00:00:00Z", active: true },
      }),
    ).toBe(true);
  });

  it("returns false when decision pass is inactive", () => {
    expect(
      hasEntitlement({
        ...makeBase(),
        decisionPass: { expiresAt: "2025-01-01T00:00:00Z", active: false },
      }),
    ).toBe(false);
  });

  it("returns true for country unlock with matching productKey", () => {
    expect(
      hasEntitlement(
        { ...makeBase(), countryUnlocks: ["portugal"] },
        "country_lifetime_portugal",
      ),
    ).toBe(true);
  });

  it("returns false for country unlock with non-matching productKey", () => {
    expect(
      hasEntitlement(
        { ...makeBase(), countryUnlocks: ["portugal"] },
        "country_lifetime_spain",
      ),
    ).toBe(false);
  });

  it("handles productKey with underscores (costa_rica → costa-rica)", () => {
    expect(
      hasEntitlement(
        { ...makeBase(), countryUnlocks: ["costa-rica"] },
        "country_lifetime_costa_rica",
      ),
    ).toBe(true);
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

describe("hasCountryEntitlement", () => {
  it("returns false for null entitlements", () => {
    expect(hasCountryEntitlement(null, "portugal")).toBe(false);
    expect(hasCountryEntitlement(undefined, "portugal")).toBe(false);
  });

  it("returns true when country is in unlocked list", () => {
    expect(
      hasCountryEntitlement(
        { ...makeBase(), countryUnlocks: ["portugal", "spain"] },
        "portugal",
      ),
    ).toBe(true);
  });

  it("returns false when country is not in unlocked list", () => {
    expect(
      hasCountryEntitlement(
        { ...makeBase(), countryUnlocks: ["portugal"] },
        "spain",
      ),
    ).toBe(false);
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

  it("returns true when decision pass is active", () => {
    expect(
      hasCountryEntitlement(
        {
          ...makeBase(),
          decisionPass: { expiresAt: "2026-12-31T00:00:00Z", active: true },
        },
        "ecuador",
      ),
    ).toBe(true);
  });

  it("normalizes underscore slugs to hyphen", () => {
    expect(
      hasCountryEntitlement(
        { ...makeBase(), countryUnlocks: ["costa-rica"] },
        "costa_rica",
      ),
    ).toBe(true);
  });

  it("handles multiple entitlements", () => {
    const ent: BackendEntitlements = {
      ...makeBase(),
      countryUnlocks: ["portugal", "spain", "malta"],
    };
    expect(hasCountryEntitlement(ent, "portugal")).toBe(true);
    expect(hasCountryEntitlement(ent, "spain")).toBe(true);
    expect(hasCountryEntitlement(ent, "malta")).toBe(true);
    expect(hasCountryEntitlement(ent, "canada")).toBe(false);
  });
});
