import { BillingOrchestrator } from "../orchestrator";
import type {
  RevenueCatClient,
  BackendClient,
  BackendEntitlements,
} from "../types";
import {
  BillingRefreshError,
  EntitlementPollingTimeoutError,
  RevenueCatPurchaseError,
} from "../errors";

function makeInactiveEntitlements(): BackendEntitlements {
  return {
    hasFullAccess: false,
    accessSource: null,
    subscription: null,
  };
}

function makeActiveEntitlements(
  source: "revenuecat" | "stripe" = "revenuecat",
): BackendEntitlements {
  return {
    hasFullAccess: true,
    accessSource: source,
    subscription: {
      status: "active",
      currentPeriodEnd: "2026-12-31T00:00:00Z",
      platform: "ios",
    },
  };
}

function mockRCClient(overrides?: Partial<RevenueCatClient>): RevenueCatClient {
  return {
    purchasePackage: jest.fn().mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {
            full_access_subscription: { isActive: true, expirationDate: null },
          },
        },
        activeSubscriptions: ["monthly_subscription_all_access"],
        originalAppUserId: "usr_123",
        managementURL: null,
      },
      productIdentifier: "monthly_subscription_all_access",
    }),
    restorePurchases: jest.fn().mockResolvedValue({
      entitlements: {
        active: {
          full_access_subscription: { isActive: true, expirationDate: null },
        },
      },
      activeSubscriptions: ["monthly_subscription_all_access"],
    }),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    logIn: jest.fn().mockResolvedValue({
      customerInfo: {
        entitlements: { active: {} },
        activeSubscriptions: [],
        originalAppUserId: "usr_123",
        managementURL: null,
      },
      created: false,
    }),
    logOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockBackendClient(
  overrides?: Partial<BackendClient>,
): BackendClient {
  return {
    refreshMobileBilling: jest.fn().mockResolvedValue({ success: true }),
    getEntitlements: jest.fn().mockResolvedValue(makeActiveEntitlements()),
    ...overrides,
  };
}

describe("BillingOrchestrator", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("purchase() — success path", () => {
    it("calls RC purchasePackage, backend refresh, polls entitlements, returns backend result", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient();
      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 5000,
      });

      const resultPromise = orchestrator.purchase("monthly_subscription_all_access", "usr_123");
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(rc.purchasePackage).toHaveBeenCalledTimes(1);
      expect(rc.purchasePackage).toHaveBeenCalledWith("monthly_subscription_all_access");
      expect(backend.refreshMobileBilling).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_123",
          source: "revenuecat",
          action: "purchase",
        }),
      );
      expect(backend.getEntitlements).toHaveBeenCalled();
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });
  });

  describe("purchase() — delayed webhook path", () => {
    it("polls until entitlement becomes active", async () => {
      const rc = mockRCClient();
      let callCount = 0;
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 4) return makeInactiveEntitlements();
          return makeActiveEntitlements();
        }),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 10000,
      });

      const resultPromise = orchestrator.purchase("monthly_subscription_all_access", "usr_123");
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(backend.getEntitlements).toHaveBeenCalledTimes(4);
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });
  });

  describe("purchase() — timeout path", () => {
    it("throws EntitlementPollingTimeoutError when entitlements never become active", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockResolvedValue(makeInactiveEntitlements()),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 500,
      });

      const resultPromise = orchestrator.purchase("monthly_subscription_all_access", "usr_123");
      jest.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(EntitlementPollingTimeoutError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "ENTITLEMENT_POLLING_TIMEOUT",
      });
    });
  });

  describe("purchase() — RC failure", () => {
    it("throws RevenueCatPurchaseError when RC purchase fails", async () => {
      const rc = mockRCClient({
        purchasePackage: jest.fn().mockRejectedValue(new Error("Store unavailable")),
      });
      const backend = mockBackendClient();
      const orchestrator = new BillingOrchestrator(rc, backend);

      await expect(
        orchestrator.purchase("monthly_subscription_all_access", "usr_123"),
      ).rejects.toThrow(RevenueCatPurchaseError);

      expect(backend.refreshMobileBilling).not.toHaveBeenCalled();
    });
  });

  describe("purchase() — user cancelled", () => {
    it("throws RevenueCatPurchaseError with userCancelled flag", async () => {
      const cancelErr = Object.assign(new Error("User cancelled"), {
        userCancelled: true,
      });
      const rc = mockRCClient({
        purchasePackage: jest.fn().mockRejectedValue(cancelErr),
      });
      const backend = mockBackendClient();
      const orchestrator = new BillingOrchestrator(rc, backend);

      try {
        await orchestrator.purchase("monthly_subscription_all_access", "usr_123");
        fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RevenueCatPurchaseError);
        expect((err as RevenueCatPurchaseError).userCancelled).toBe(true);
      }

      expect(backend.refreshMobileBilling).not.toHaveBeenCalled();
    });
  });

  describe("purchase() — backend refresh failure", () => {
    it("throws BillingRefreshError when backend refresh fails", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient({
        refreshMobileBilling: jest
          .fn()
          .mockRejectedValue(new Error("Server error")),
      });
      const orchestrator = new BillingOrchestrator(rc, backend);

      await expect(
        orchestrator.purchase("monthly_subscription_all_access", "usr_123"),
      ).rejects.toThrow(BillingRefreshError);

      expect(rc.purchasePackage).toHaveBeenCalledTimes(1);
      expect(backend.getEntitlements).not.toHaveBeenCalled();
    });
  });

  describe("restore()", () => {
    it("calls restorePurchases, backend refresh, and re-fetches entitlements after refresh", async () => {
      const rc = mockRCClient();
      let callCount = 0;
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) return makeInactiveEntitlements();
          return makeActiveEntitlements();
        }),
      });
      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 5000,
      });

      const resultPromise = orchestrator.restore("usr_123");
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(rc.restorePurchases).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_123",
          source: "revenuecat",
          action: "restore",
        }),
      );
      expect(backend.getEntitlements).toHaveBeenCalledTimes(2);
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });
  });

  describe("restore() — delayed webhook path", () => {
    it("polls entitlements after backend refresh until they become active", async () => {
      const rc = mockRCClient();
      let callCount = 0;
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockImplementation(async () => {
          callCount++;
          // Call 1 = pre-check before RC restore (must be inactive so we
          // proceed to refresh + poll). Calls 2-4 simulate the webhook
          // arriving late; call 5 is when the backend finally reflects
          // the active entitlement.
          if (callCount < 5) return makeInactiveEntitlements();
          return makeActiveEntitlements();
        }),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 10000,
      });

      const resultPromise = orchestrator.restore("usr_123");
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(rc.restorePurchases).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledTimes(1);
      // 1 pre-check + 4 polls (3 inactive + 1 active) = 5 total calls.
      expect(backend.getEntitlements).toHaveBeenCalledTimes(5);
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });
  });

  describe("restore() — pre-check transient error", () => {
    it("retries the pre-check once and skips RC restore when backend confirms access", async () => {
      const rc = mockRCClient();
      let callCount = 0;
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("network blip");
          }
          return makeActiveEntitlements();
        }),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 5000,
      });

      const result = await orchestrator.restore("usr_123");

      expect(backend.getEntitlements).toHaveBeenCalledTimes(2);
      expect(rc.restorePurchases).not.toHaveBeenCalled();
      expect(backend.refreshMobileBilling).not.toHaveBeenCalled();
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });

    it("falls through to RC restore + poll when both pre-check attempts error", async () => {
      const rc = mockRCClient();
      let callCount = 0;
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 2) {
            throw new Error("network down");
          }
          return makeActiveEntitlements();
        }),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 5000,
      });

      const resultPromise = orchestrator.restore("usr_123");
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(rc.restorePurchases).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledTimes(1);
      // 2 failed pre-check attempts + poll calls until active (3rd call onward)
      expect((backend.getEntitlements as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(result.status).toBe("confirmed");
      expect(result.entitlements.hasFullAccess).toBe(true);
    });
  });

  describe("restore() — timeout path", () => {
    it("throws EntitlementPollingTimeoutError when entitlements never become active", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockResolvedValue(makeInactiveEntitlements()),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 500,
      });

      const resultPromise = orchestrator.restore("usr_123");
      jest.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(EntitlementPollingTimeoutError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "ENTITLEMENT_POLLING_TIMEOUT",
      });
    });
  });

  describe("syncOnLogin()", () => {
    it("calls RC logIn with userId, backend refresh, fetches entitlements", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient();
      const orchestrator = new BillingOrchestrator(rc, backend);

      const result = await orchestrator.syncOnLogin("usr_456");

      expect(rc.logIn).toHaveBeenCalledTimes(1);
      expect(rc.logIn).toHaveBeenCalledWith("usr_456");
      expect(backend.refreshMobileBilling).toHaveBeenCalledTimes(1);
      expect(backend.refreshMobileBilling).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_456",
          source: "revenuecat",
        }),
      );
      expect(backend.getEntitlements).toHaveBeenCalledTimes(1);
      expect(backend.getEntitlements).toHaveBeenCalledWith("usr_456");
      expect(result.status).toBe("confirmed");
    });
  });

  describe("CRITICAL: Never gate from RC CustomerInfo", () => {
    it("returns inactive when RC shows entitlement but backend says no", async () => {
      const rc = mockRCClient({
        purchasePackage: jest.fn().mockResolvedValue({
          customerInfo: {
            entitlements: {
              active: {
                full_access_subscription: { isActive: true, expirationDate: null },
                decision_access: { isActive: true, expirationDate: null },
              },
            },
            activeSubscriptions: ["monthly_subscription_all_access"],
            originalAppUserId: "usr_123",
            managementURL: null,
          },
          productIdentifier: "monthly_subscription_all_access",
        }),
      });

      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockResolvedValue(makeInactiveEntitlements()),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 100,
        timeoutMs: 500,
      });

      const resultPromise = orchestrator.purchase("monthly_subscription_all_access", "usr_123");
      jest.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(EntitlementPollingTimeoutError);
    });
  });

  describe("polling timer correctness", () => {
    it("polls expected number of times given interval and timeout", async () => {
      const rc = mockRCClient();
      const backend = mockBackendClient({
        getEntitlements: jest.fn().mockResolvedValue(makeInactiveEntitlements()),
      });

      const orchestrator = new BillingOrchestrator(rc, backend, {
        intervalMs: 200,
        timeoutMs: 1000,
      });

      const resultPromise = orchestrator.purchase("monthly_subscription_all_access", "usr_123");
      jest.runAllTimersAsync();

      try {
        await resultPromise;
      } catch (err) {
        expect(err).toBeInstanceOf(EntitlementPollingTimeoutError);
        const timeoutErr = err as EntitlementPollingTimeoutError;
        expect(timeoutErr.pollCount).toBeGreaterThanOrEqual(5);
        expect(timeoutErr.pollCount).toBeLessThanOrEqual(7);
      }
    });
  });
});
