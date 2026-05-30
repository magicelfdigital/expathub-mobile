/**
 * Regression test for the ProPaywall resumed-purchase staleness guard
 * added in task #144.
 *
 * The resumed-purchase effect reads a `pending_purchase` entry from
 * AsyncStorage when the paywall mounts with a logged-in user. The
 * guard ensures that:
 *
 *   - entries older than 30 minutes are silently discarded
 *   - legacy entries without `storedAt` are silently discarded
 *   - fresh entries (within 30 minutes) still resume normally
 *
 * "Silently" means: the stored key is cleared, no analytics events
 * fire, the orchestrator's purchase() is not invoked, and `busy` is
 * never flipped to true (so the CTA buttons stay enabled — the
 * stuck-button bug the original fix was guarding against).
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => {
  const mock = require("@/src/__test-mocks__/expo-router");
  // ProPaywall's success path calls `router.canGoBack()`. Provide a
  // stub so the resume flow doesn't throw and mask other assertions.
  const router = mock.__getRouter();
  router.canGoBack = jest.fn(() => false);
  return mock;
});
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@/src/__test-mocks__/async-storage"),
);

const trackEvent = jest.fn();
const logFbEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  logFbEvent: (...args: any[]) => logFbEvent(...args),
}));

jest.mock("@/src/lib/toastBus", () => ({ showToast: jest.fn() }));

const orchestratorPurchase = jest.fn(async () => ({ status: "confirmed" }));
const orchestratorRestore = jest.fn(async () => ({ status: "none" }));
jest.mock("@/src/billing", () => ({
  getOrchestrator: () => ({
    purchase: orchestratorPurchase,
    restore: orchestratorRestore,
  }),
  EntitlementPollingTimeoutError: class EntitlementPollingTimeoutError extends Error {
    elapsedMs = 0;
  },
  RevenueCatPurchaseError: class RevenueCatPurchaseError extends Error {
    userCancelled = false;
  },
  clearRefreshCooldown: jest.fn(),
}));

jest.mock("@/src/subscriptions/revenuecat", () => ({
  getOfferings: jest.fn(async () => ({
    current: [],
    monthlyPackage: null,
    annualPackage: null,
    error: null,
  })),
}));

jest.mock("@/src/subscriptions/stripeWeb", () => ({
  createCheckoutSession: jest.fn(),
  createCustomerPortalSession: jest.fn(),
}));

jest.mock("@/src/data", () => {
  const offer = {
    headline: "Unlock your relocation plan",
    subhead: "Sub",
    bullets: [],
    proofPoints: [],
  };
  return {
    getProOffer: () => offer,
    isLaunchCountry: () => true,
    COVERAGE_SUMMARY: { decisionReady: 11, comingSoon: 5 },
  };
});

jest.mock("@/data/countries", () => ({
  COUNTRIES: [{ slug: "portugal", name: "Portugal" }],
}));

const refresh = jest.fn(async () => {});
jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => ({
    hasActiveSubscription: false,
    hasFullAccess: false,
    accessType: null,
    source: null,
    loading: false,
    sandboxMode: false,
    managementURL: null,
    expirationDate: null,
    setSandboxOverride: jest.fn(),
    refresh,
    promoCodeActive: false,
    redeemPromoCode: jest.fn(),
    clearPromoCode: jest.fn(),
  }),
}));

jest.mock("@/src/contexts/EntitlementContext", () => ({
  useEntitlement: () => ({
    hasProAccess: false,
    hasFullAccess: false,
    accessType: "none",
    source: "none",
    lastRefreshAt: null,
  }),
}));

jest.mock("@/contexts/AuthContext", () => {
  const user = { id: 42, email: "ada@example.com" };
  return {
    useAuth: () => ({ user, token: "tok" }),
  };
});

jest.mock("@/contexts/CountryContext", () => ({
  useCountry: () => ({ selectedCountrySlug: null }),
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import AsyncStorage, {
  __testStore,
} from "@/src/__test-mocks__/async-storage";

import { ProPaywall } from "@/src/components/ProPaywall";

async function flush() {
  // Let the resumed-purchase effect's promise chain settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The plans tab renders three primary CTA Pressables — the annual
// trial button, the monthly trial button, and Restore Purchases —
// all wired to `disabled={busy}`. Any of them being disabled proves
// busy flipped to true.
function findCtaPressables(root: any): any[] {
  return root.findAll(
    (n: any) =>
      n.type === "Pressable" &&
      typeof n.props?.onPress === "function" &&
      // exclude tabs, faq, close button, etc.
      "disabled" in (n.props ?? {}),
  );
}

function anyCtaDisabled(root: any): boolean {
  return findCtaPressables(root).some((p) => p.props.disabled === true);
}

function trackEventFired(name: string): boolean {
  return trackEvent.mock.calls.some(([n]) => n === name);
}

beforeEach(() => {
  __testStore.clear();
  trackEvent.mockReset();
  logFbEvent.mockReset();
  orchestratorPurchase.mockReset();
  orchestratorPurchase.mockResolvedValue({ status: "confirmed" });
  orchestratorRestore.mockReset();
  refresh.mockReset();
});

describe("ProPaywall resumed-purchase staleness guard", () => {
  it("silently discards a pending_purchase older than 30 minutes (no resume, busy stays false)", async () => {
    const stale = {
      type: "monthly",
      countrySlug: null,
      storedAt: Date.now() - 31 * 60 * 1000,
    };
    await AsyncStorage.setItem("pending_purchase", JSON.stringify(stale));

    let renderer: any;
    const onClose = jest.fn();
    await act(async () => {
      renderer = TestRenderer.create(<ProPaywall onClose={onClose} />);
    });
    await flush();

    // Storage cleared.
    expect(await AsyncStorage.getItem("pending_purchase")).toBeNull();
    // Orchestrator never invoked.
    expect(orchestratorPurchase).not.toHaveBeenCalled();
    // No analytics events from the resume path.
    expect(trackEventFired("purchase_success")).toBe(false);
    expect(trackEventFired("purchase_error")).toBe(false);
    expect(logFbEvent).not.toHaveBeenCalledWith(
      "StartTrial",
      expect.anything(),
      expect.anything(),
    );
    // refresh()/onClose were not called — paywall didn't think a
    // purchase completed.
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // CTA buttons remain enabled — the stuck-button regression guard.
    const ctas = findCtaPressables(renderer.root);
    expect(ctas.length).toBeGreaterThan(0);
    expect(anyCtaDisabled(renderer.root)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("silently discards a legacy pending_purchase with no storedAt (no resume, busy stays false)", async () => {
    const legacy = { type: "annual", countrySlug: "portugal" };
    await AsyncStorage.setItem("pending_purchase", JSON.stringify(legacy));

    let renderer: any;
    const onClose = jest.fn();
    await act(async () => {
      renderer = TestRenderer.create(<ProPaywall onClose={onClose} />);
    });
    await flush();

    expect(await AsyncStorage.getItem("pending_purchase")).toBeNull();
    expect(orchestratorPurchase).not.toHaveBeenCalled();
    expect(trackEventFired("purchase_success")).toBe(false);
    expect(trackEventFired("purchase_error")).toBe(false);
    expect(logFbEvent).not.toHaveBeenCalledWith(
      "StartTrial",
      expect.anything(),
      expect.anything(),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const ctas = findCtaPressables(renderer.root);
    expect(ctas.length).toBeGreaterThan(0);
    expect(anyCtaDisabled(renderer.root)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("a fresh pending_purchase clears storage but does NOT auto-fire StoreKit (user must tap Continue)", async () => {
    const fresh = {
      type: "monthly",
      countrySlug: "portugal",
      storedAt: Date.now() - 60 * 1000,
    };
    await AsyncStorage.setItem("pending_purchase", JSON.stringify(fresh));

    let renderer: any;
    const onClose = jest.fn();
    await act(async () => {
      renderer = TestRenderer.create(<ProPaywall onClose={onClose} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    await flush();
    await flush();

    // Storage is consumed so the resume only triggers once.
    expect(await AsyncStorage.getItem("pending_purchase")).toBeNull();
    // The orchestrator is NOT invoked — user must tap the highlighted CTA.
    expect(orchestratorPurchase).not.toHaveBeenCalled();
    expect(trackEventFired("purchase_success")).toBe(false);
    expect(logFbEvent).not.toHaveBeenCalledWith(
      "StartTrial",
      expect.anything(),
      expect.anything(),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // CTAs remain interactive.
    const ctas = findCtaPressables(renderer.root);
    expect(ctas.length).toBeGreaterThan(0);
    expect(anyCtaDisabled(renderer.root)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
