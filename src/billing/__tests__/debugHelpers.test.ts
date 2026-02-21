import {
  redactSensitiveFields,
  formatEntitlements,
  formatTimestamp,
  getCooldownStatus,
  addDebugLogEntry,
  getDebugLog,
  clearDebugLog,
  debugFetchEntitlements,
  debugForceRefresh,
  getBackendBaseUrl,
} from "../debugHelpers";
import { recordRefresh, clearCooldown, _getLastRefreshTime } from "../refreshCooldown";
import { Platform } from "react-native";

beforeEach(() => {
  clearCooldown();
  clearDebugLog();
  delete process.env.EXPO_PUBLIC_BACKEND_URL;
  delete process.env.EXPO_PUBLIC_DOMAIN;
  (Platform as any).OS = "web";
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("redactSensitiveFields", () => {
  it("redacts keys containing sensitive names", () => {
    const input = {
      userId: "42",
      token: "eyJhbGciOi...",
      apiKey: "sk_live_1234",
      authorization: "Bearer xyz",
      name: "Alice",
    };
    const result = redactSensitiveFields(input);
    expect(result.userId).toBe("42");
    expect(result.token).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.authorization).toBe("[REDACTED]");
    expect(result.name).toBe("Alice");
  });

  it("handles nested objects", () => {
    const input = {
      user: { id: 1, jwtToken: "abc" },
      data: "safe",
    };
    const result = redactSensitiveFields(input);
    expect(result.user.id).toBe(1);
    expect(result.user.jwtToken).toBe("[REDACTED]");
    expect(result.data).toBe("safe");
  });

  it("handles arrays", () => {
    const input = [{ token: "abc" }, { name: "Bob" }];
    const result = redactSensitiveFields(input);
    expect(result[0].token).toBe("[REDACTED]");
    expect(result[1].name).toBe("Bob");
  });

  it("handles null/undefined/primitives", () => {
    expect(redactSensitiveFields(null)).toBeNull();
    expect(redactSensitiveFields(undefined)).toBeUndefined();
    expect(redactSensitiveFields("hello")).toBe("hello");
    expect(redactSensitiveFields(42)).toBe(42);
  });

  it("is case-insensitive for key matching", () => {
    const input = { SECRET_KEY: "val", Password: "val", JWT: "val" };
    const result = redactSensitiveFields(input);
    expect(result.SECRET_KEY).toBe("[REDACTED]");
    expect(result.Password).toBe("[REDACTED]");
    expect(result.JWT).toBe("[REDACTED]");
  });
});

describe("formatEntitlements", () => {
  it("returns descriptive string for null", () => {
    expect(formatEntitlements(null)).toBe("null (no data)");
  });

  it("formats valid entitlements as indented JSON", () => {
    const ent = {
      hasFullAccess: true,
      accessSource: "revenuecat" as const,
      subscription: { status: "active" as const, currentPeriodEnd: "2026-12-31", platform: "ios" as const },
      decisionPass: null,
      countryUnlocks: ["portugal"],
    };
    const result = formatEntitlements(ent);
    expect(result).toContain('"hasFullAccess": true');
    expect(result).toContain('"portugal"');
    expect(result).not.toContain("[REDACTED]");
  });
});

describe("formatTimestamp", () => {
  it("returns 'never' for null/undefined", () => {
    expect(formatTimestamp(null)).toBe("never");
    expect(formatTimestamp(undefined)).toBe("never");
  });

  it("returns ISO string for valid ms", () => {
    const ts = new Date("2026-01-15T10:30:00Z").getTime();
    expect(formatTimestamp(ts)).toBe("2026-01-15T10:30:00.000Z");
  });
});

describe("getCooldownStatus", () => {
  it("returns inactive for user with no prior refresh", () => {
    const status = getCooldownStatus("user_99");
    expect(status.cooldownActive).toBe(false);
    expect(status.lastRefreshAt).toBe("never");
    expect(status.remainingMs).toBe(0);
  });

  it("returns active when within cooldown window", () => {
    const now = Date.now();
    recordRefresh("user_1", now);
    const status = getCooldownStatus("user_1");
    expect(status.cooldownActive).toBe(true);
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(status.remainingMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("returns inactive when cooldown expired", () => {
    const past = Date.now() - 11 * 60 * 1000;
    recordRefresh("user_1", past);
    const status = getCooldownStatus("user_1");
    expect(status.cooldownActive).toBe(false);
    expect(status.remainingMs).toBe(0);
  });
});

describe("debug log", () => {
  it("stores and retrieves entries (newest first)", () => {
    addDebugLogEntry({
      userId: "1",
      rcAppUserId: "rc_1",
      action: "fetch",
      result: "success",
      entitlementCount: 2,
    });
    addDebugLogEntry({
      userId: "1",
      rcAppUserId: "rc_1",
      action: "refresh",
      result: "success",
      entitlementCount: 3,
    });

    const log = getDebugLog();
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe("refresh");
    expect(log[1].action).toBe("fetch");
    expect(log[0].timestamp).toBeTruthy();
  });

  it("caps at 50 entries", () => {
    for (let i = 0; i < 60; i++) {
      addDebugLogEntry({
        userId: "1",
        rcAppUserId: null,
        action: `action_${i}`,
        result: "ok",
        entitlementCount: 0,
      });
    }
    expect(getDebugLog()).toHaveLength(50);
  });

  it("clearDebugLog empties all entries", () => {
    addDebugLogEntry({ userId: "1", rcAppUserId: null, action: "a", result: "ok", entitlementCount: 0 });
    clearDebugLog();
    expect(getDebugLog()).toHaveLength(0);
  });
});

describe("debugFetchEntitlements", () => {
  it("calls backend and returns entitlements on success", async () => {
    const mockEnt = {
      hasFullAccess: true,
      accessSource: "revenuecat",
      subscription: null,
      decisionPass: null,
      countryUnlocks: ["portugal"],
    };
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockEnt,
    }));
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

    const result = await debugFetchEntitlements(() => "tok", "42", "rc_42");
    expect(result.success).toBe(true);
    expect(result.entitlements?.hasFullAccess).toBe(true);

    const log = getDebugLog();
    expect(log[0].action).toBe("fetch_entitlements");
    expect(log[0].result).toBe("success");
  });

  it("returns error on failure and logs it", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

    const result = await debugFetchEntitlements(() => "tok", "42", null);
    expect(result.success).toBe(true);
    expect(result.entitlements?.hasFullAccess).toBe(false);
  });
});

describe("debugForceRefresh", () => {
  it("clears cooldown, calls refresh, then fetches entitlements", async () => {
    recordRefresh("42");
    expect(_getLastRefreshTime("42")).toBeDefined();

    const callOrder: string[] = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      if (url.includes("/refresh")) {
        callOrder.push("refresh");
        return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => "ok" };
      }
      callOrder.push("entitlements");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hasFullAccess: true,
          accessSource: "revenuecat",
          subscription: null,
          decisionPass: null,
          countryUnlocks: [],
        }),
      };
    });
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

    const result = await debugForceRefresh(() => "tok", "42", null);
    expect(result.refreshSuccess).toBe(true);
    expect(result.entitlements?.hasFullAccess).toBe(true);
    expect(callOrder).toEqual(["refresh", "entitlements"]);

    const log = getDebugLog();
    expect(log[0].action).toBe("force_refresh");
    expect(log[0].result).toBe("success");
  });

  it("handles refresh failure gracefully and still fetches entitlements", async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes("/refresh")) {
        return { ok: false, status: 500, text: async () => "Server Error" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hasFullAccess: false,
          accessSource: null,
          subscription: null,
          decisionPass: null,
          countryUnlocks: [],
        }),
      };
    });
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

    const result = await debugForceRefresh(() => "tok", "42", null);
    expect(result.refreshSuccess).toBe(false);
    expect(result.refreshError).toContain("500");
    expect(result.entitlements).toBeTruthy();
  });
});

describe("getBackendBaseUrl", () => {
  it("returns URL when configured", () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://prod.example.com";
    expect(getBackendBaseUrl()).toBe("https://prod.example.com");
  });

  it("returns descriptive message when native and unconfigured", () => {
    (Platform as any).OS = "ios";
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    expect(getBackendBaseUrl()).toContain("not configured");
  });
});
