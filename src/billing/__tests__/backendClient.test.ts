import { createBackendClient, getBackendBase } from "../backendClient";
import { Platform } from "react-native";
import type { BackendClient } from "../types";

const MOCK_TOKEN = "jwt_test_token_123";
const MOCK_USER_ID = "42";

let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

beforeEach(() => {
  fetchCalls = [];
  (global as any).fetch = jest.fn(async (url: string, options: RequestInit) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        hasFullAccess: true,
        accessSource: "revenuecat",
        subscription: { status: "active", currentPeriodEnd: "2026-12-31T00:00:00Z", platform: "ios" },
        decisionPass: null,
        countryUnlocks: [],
      }),
      text: async () => "ok",
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_BACKEND_URL;
  delete process.env.EXPO_PUBLIC_DOMAIN;
});

describe("getBackendBase — native enforcement", () => {
  it("throws when EXPO_PUBLIC_BACKEND_URL is missing on native (iOS)", () => {
    (Platform as any).OS = "ios";
    delete process.env.EXPO_PUBLIC_BACKEND_URL;

    expect(() => getBackendBase()).toThrow(
      "Missing EXPO_PUBLIC_BACKEND_URL — mobile builds must explicitly set backend base URL.",
    );
  });

  it("throws when EXPO_PUBLIC_BACKEND_URL is missing on native (Android)", () => {
    (Platform as any).OS = "android";
    delete process.env.EXPO_PUBLIC_BACKEND_URL;

    expect(() => getBackendBase()).toThrow(
      "Missing EXPO_PUBLIC_BACKEND_URL — mobile builds must explicitly set backend base URL.",
    );
  });

  it("returns EXPO_PUBLIC_BACKEND_URL on native when set", () => {
    (Platform as any).OS = "ios";
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://prod.example.com";

    expect(getBackendBase()).toBe("https://prod.example.com");
  });

  it("strips trailing slash on native", () => {
    (Platform as any).OS = "ios";
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://prod.example.com/";

    expect(getBackendBase()).toBe("https://prod.example.com");
  });
});

describe("getBackendBase — web fallback", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
  });

  it("returns EXPO_PUBLIC_BACKEND_URL when set on web", () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://prod.example.com";

    expect(getBackendBase()).toBe("https://prod.example.com");
  });

  it("falls back to EXPO_PUBLIC_DOMAIN on web when EXPO_PUBLIC_BACKEND_URL is missing", () => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    process.env.EXPO_PUBLIC_DOMAIN = "myapp.replit.dev:5000";

    expect(getBackendBase()).toBe("https://myapp.replit.dev:5000");
  });

  it("returns empty string on web when both env vars are missing", () => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    delete process.env.EXPO_PUBLIC_DOMAIN;

    expect(getBackendBase()).toBe("");
  });
});

describe("createBackendClient — route structure", () => {
  let client: BackendClient;

  beforeEach(() => {
    (Platform as any).OS = "ios";
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test-backend.example.com";
    client = createBackendClient(() => MOCK_TOKEN);
  });

  it("GET /api/entitlements with Authorization header", async () => {
    await client.getEntitlements(MOCK_USER_ID);

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0];
    expect(call.url).toBe("https://test-backend.example.com/api/entitlements");
    expect(call.options.method).toBe("GET");
    expect(call.options.headers).toMatchObject({
      "Authorization": `Bearer ${MOCK_TOKEN}`,
      "Content-Type": "application/json",
    });
  });

  it("POST /api/billing/mobile/refresh with Authorization header and body", async () => {
    await client.refreshMobileBilling({
      userId: MOCK_USER_ID,
      source: "revenuecat",
      action: "purchase",
      transactionId: "txn_abc",
    });

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0];
    expect(call.url).toBe("https://test-backend.example.com/api/billing/mobile/refresh");
    expect(call.options.method).toBe("POST");
    expect(call.options.headers).toMatchObject({
      "Authorization": `Bearer ${MOCK_TOKEN}`,
      "Content-Type": "application/json",
    });
    const body = JSON.parse(call.options.body as string);
    expect(body).toEqual({
      userId: MOCK_USER_ID,
      source: "revenuecat",
      action: "purchase",
      transactionId: "txn_abc",
    });
  });

  it("strips trailing slash from EXPO_PUBLIC_BACKEND_URL", async () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test-backend.example.com/";
    const c = createBackendClient(() => MOCK_TOKEN);
    await c.getEntitlements(MOCK_USER_ID);

    expect(fetchCalls[0].url).toBe("https://test-backend.example.com/api/entitlements");
  });

  it("omits Authorization header when token is null", async () => {
    const noAuthClient = createBackendClient(() => null);
    await noAuthClient.getEntitlements(MOCK_USER_ID);

    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("returns empty entitlements on non-OK response for getEntitlements", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    const result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.hasFullAccess).toBe(false);
    expect(result.countryUnlocks).toEqual([]);
  });

  it("throws on non-OK response for refreshMobileBilling", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    await expect(
      client.refreshMobileBilling({ userId: MOCK_USER_ID, source: "revenuecat" }),
    ).rejects.toThrow("Backend refresh failed: 500");
  });

  it("parses backend response fields correctly", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hasFullAccess: false,
        accessSource: "stripe",
        subscription: null,
        decisionPass: { expiresAt: "2026-03-15T00:00:00Z", active: true },
        countryUnlocks: ["portugal", "spain"],
      }),
    }));

    const result = await client.getEntitlements(MOCK_USER_ID);
    expect(result.hasFullAccess).toBe(false);
    expect(result.accessSource).toBe("stripe");
    expect(result.decisionPass).toEqual({ expiresAt: "2026-03-15T00:00:00Z", active: true });
    expect(result.countryUnlocks).toEqual(["portugal", "spain"]);
  });
});
