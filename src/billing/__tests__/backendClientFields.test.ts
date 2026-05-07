import { createBackendClient } from "../backendClient";
import { Platform } from "react-native";
import type { BackendClient } from "../types";

const MOCK_TOKEN = "jwt_test";
const MOCK_USER_ID = "7";

describe("createBackendClient — field cleanup & shape contract", () => {
  let client: BackendClient;

  beforeEach(() => {
    (Platform as any).OS = "ios";
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://t.example.com";
    client = createBackendClient(() => MOCK_TOKEN);
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    jest.restoreAllMocks();
  });

  it("returns ONLY the BackendEntitlements shape — no decisionPass, no countryUnlocks, no other unknown fields leak through", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hasFullAccess: true,
        accessSource: "stripe",
        subscription: { status: "active", platform: "web" },
        // legacy / unrelated fields the backend may still send:
        decisionPass: { active: true, expiresAt: "2026-12-31" },
        countryUnlocks: ["spain", "germany"],
        legacyFlag: true,
        someExperiment: { variant: "B" },
      }),
    }));

    const result = await client.getEntitlements(MOCK_USER_ID);

    // Whitelist exactly: only these three top-level keys are exposed to the
    // app code. If a future change starts leaking unknown fields back into
    // the client, this assertion fails loudly.
    expect(Object.keys(result).sort()).toEqual([
      "accessSource",
      "hasFullAccess",
      "subscription",
    ]);
  });

  it("falls back to legacy `hasProAccess` when `hasFullAccess` is missing (back-compat)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hasProAccess: true,
        source: "revenuecat",
        subscription: null,
      }),
    }));
    const result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.hasFullAccess).toBe(true);
    expect(result.accessSource).toBe("revenuecat");
  });

  it("coerces `hasFullAccess` to boolean (truthy non-bool → true, undefined → false)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hasFullAccess: 1,
        accessSource: "revenuecat",
      }),
    }));
    let result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.hasFullAccess).toBe(true);

    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
    result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.hasFullAccess).toBe(false);
    expect(result.accessSource).toBeNull();
    expect(result.subscription).toBeNull();
  });

  it("preserves the full subscription object when present (status, period end, platform)", async () => {
    const sub = {
      status: "trialing" as const,
      currentPeriodEnd: "2027-01-01T00:00:00Z",
      platform: "ios" as const,
      productId: "annual_pro",
    };
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hasFullAccess: true, accessSource: "revenuecat", subscription: sub }),
    }));
    const result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.subscription).toEqual(sub);
  });

  it("throws on a 5xx so EntitlementContext.refresh hits its fail-closed catch path", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));
    await expect(client.getEntitlements(MOCK_USER_ID)).rejects.toThrow(
      /Backend entitlements failed: 503/,
    );
  });

  it("throws on a 4xx (e.g. expired auth) so callers cannot mistake it for an empty-entitlement success", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));
    await expect(client.getEntitlements(MOCK_USER_ID)).rejects.toThrow(
      /Backend entitlements failed: 401/,
    );
  });

  it("refreshMobileBilling propagates the underlying status code in the thrown error message", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => "Unprocessable",
    }));
    await expect(
      client.refreshMobileBilling({ userId: MOCK_USER_ID, source: "revenuecat", action: "purchase" }),
    ).rejects.toThrow("Backend refresh failed: 422");
  });

  it("refreshMobileBilling omits `transactionId` from the JSON body when not provided (sync action)", async () => {
    let captured: any = null;
    (global as any).fetch = jest.fn(async (_url: string, options: RequestInit) => {
      captured = JSON.parse(options.body as string);
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    await client.refreshMobileBilling({ userId: MOCK_USER_ID, source: "revenuecat" });
    expect(captured).toEqual({
      userId: MOCK_USER_ID,
      source: "revenuecat",
      action: undefined,
      transactionId: undefined,
    });
  });
});
