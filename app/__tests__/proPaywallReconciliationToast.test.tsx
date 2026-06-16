/**
 * Screen-mount tests for ProPaywall's post-purchase reconciliation effect
 * (the "confirmed-but-still-locked" toast), Behavior B from the brief.
 *
 * The effect (src/components/ProPaywall.tsx) runs after a confirmed
 * purchase once entitlements settle. It is gated on a private
 * `confirmedPurchaseRef` that is ONLY set on the real confirmed-purchase
 * code path, so these tests mount the real ProPaywall and drive a real
 * purchase by pressing a plan CTA (orchestrator mocked to return
 * `{ status: "confirmed" }`). The mocked `refresh()` from useSubscription
 * then mutates the subscription state to simulate how entitlements settle:
 *
 *   B1. refresh flips hasFullAccess → true (normal): no toast.
 *   B2. refresh leaves hasFullAccess false but updates lastRefreshAt
 *       (confirmed-but-still-locked): one "info" toast.
 *   B3. After B2's toast, an unrelated entitlement refresh (lastRefreshAt
 *       changes again, access still false) does NOT re-fire the toast —
 *       the ref was cleared.
 *
 * hasFullAccess, entitlementLoading (loading) and lastRefreshAt all come
 * from useSubscription(), so a single stateful useSubscription mock drives
 * every guard in the effect.
 */

import * as React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (_props: any) => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockShowToast = jest.fn();
jest.mock("@/src/lib/toastBus", () => ({
  showToast: (...args: any[]) => mockShowToast(...args),
}));

const mockTrackEvent = jest.fn();
const mockLogFbEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
  logFbEvent: (...args: any[]) => mockLogFbEvent(...args),
}));

// Orchestrator that confirms the purchase against the backend.
const mockPurchase = jest.fn(async (..._args: any[]) => ({
  status: "confirmed" as const,
}));
class RevenueCatPurchaseError extends Error {
  userCancelled: boolean;
  constructor(message: string, userCancelled = false) {
    super(message);
    this.userCancelled = userCancelled;
  }
}
class EntitlementPollingTimeoutError extends Error {
  elapsedMs: number;
  constructor(elapsedMs = 0) {
    super("timeout");
    this.elapsedMs = elapsedMs;
  }
}
jest.mock("@/src/billing", () => ({
  getOrchestrator: () => ({
    purchase: (...args: any[]) => mockPurchase(...args),
    restore: jest.fn(),
  }),
  RevenueCatPurchaseError,
  EntitlementPollingTimeoutError,
  clearRefreshCooldown: jest.fn(),
}));

// Return live prices so the offerings-error card (which renders its own
// `disabled` retry Pressable ahead of the plan cards) does NOT appear —
// keeping the first CTA the annual purchase button.
jest.mock("@/src/subscriptions/revenuecat", () => ({
  getOfferings: jest.fn(async () => ({
    current: [],
    monthlyPackage: { productId: "monthly", priceString: "$14.99", price: 14.99 },
    annualPackage: { productId: "annual", priceString: "$89.00", price: 89 },
    error: null,
  })),
}));

jest.mock("@/src/subscriptions/stripeWeb", () => ({
  createCheckoutSession: jest.fn(async () => null),
  createCustomerPortalSession: jest.fn(async () => null),
}));

jest.mock("@/src/data", () => ({
  getProOffer: () => ({
    headline: "Unlock full access",
    subhead: "All countries, all tools",
    bullets: [],
    valueProps: [],
  }),
  isLaunchCountry: () => true,
  COVERAGE_SUMMARY: { countries: 11, sections: 0 },
}));

jest.mock("@/data/countries", () => ({
  COUNTRIES: [],
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 42, email: "ada@example.com" }, token: "tok" }),
}));

jest.mock("@/contexts/CountryContext", () => ({
  useCountry: () => ({ selectedCountrySlug: null }),
}));

// ProPaywall does not import useEntitlement, but mock defensively in case a
// transitive dependency does.
jest.mock("@/src/contexts/EntitlementContext", () => ({
  useEntitlement: () => ({
    hasProAccess: false,
    hasFullAccess: false,
    accessType: "none",
    source: "none",
    lastRefreshAt: null,
  }),
}));

// Subscription mock backed by a REAL React context + useState provider.
// This mirrors production: the real useSubscription is context-backed, so
// when refresh() settles new entitlement state the provider re-renders its
// consumers, which is what lets the reconciliation effect (keyed on
// lastRefreshAt/hasFullAccess) run. Driving state through useState (rather
// than mutating a plain object) makes those re-renders genuine React state
// updates, so the effect's passive cleanup/run flushes inside act() exactly
// as it would in the app.
let subState: any;
jest.mock("@/contexts/SubscriptionContext", () => {
  const ReactM = require("react");
  const Ctx = ReactM.createContext(null);
  let setState: ((updater: any) => void) | null = null;
  const TestSubProvider = ({ initial, children }: any) => {
    const [state, set] = ReactM.useState(initial);
    setState = set;
    return ReactM.createElement(Ctx.Provider, { value: state }, children);
  };
  return {
    useSubscription: () => ReactM.useContext(Ctx),
    __TestSubProvider: TestSubProvider,
    __setSub: (updater: any) => {
      if (setState) setState(updater);
    },
  };
});

import { ProPaywall } from "@/src/components/ProPaywall";

const { __TestSubProvider, __setSub } = jest.requireMock(
  "@/contexts/SubscriptionContext",
) as {
  __TestSubProvider: React.ComponentType<{
    initial: any;
    children: React.ReactNode;
  }>;
  __setSub: (updater: any) => void;
};

function makeSubState() {
  return {
    hasActiveSubscription: false,
    hasFullAccess: false,
    accessType: "none",
    source: "none",
    loading: false,
    sandboxMode: false,
    managementURL: null,
    expirationDate: null,
    setSandboxOverride: jest.fn(),
    refresh: jest.fn(async () => {}),
    promoCodeActive: false,
    redeemPromoCode: jest.fn(),
    clearPromoCode: jest.fn(),
    lastRefreshAt: null,
  };
}

function findCtaPressables(renderer: ReactTestRenderer): any[] {
  return renderer.root.findAll(
    (n: any) =>
      n.type === "Pressable" &&
      typeof n.props?.onPress === "function" &&
      "disabled" in (n.props ?? {}),
  );
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function pressFirstPlanCta(renderer: ReactTestRenderer) {
  const ctas = findCtaPressables(renderer);
  expect(ctas.length).toBeGreaterThan(0);
  await act(async () => {
    await ctas[0].props.onPress();
  });
  await flush();
}

async function renderPaywall(
  onClose: () => void,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <__TestSubProvider initial={subState}>
        <ProPaywall onClose={onClose} />
      </__TestSubProvider>,
    );
  });
  await flush();
  return renderer;
}

beforeEach(() => {
  mockShowToast.mockReset();
  mockPurchase.mockReset();
  mockPurchase.mockResolvedValue({ status: "confirmed" });
  mockTrackEvent.mockReset();
  mockLogFbEvent.mockReset();
  subState = makeSubState();
  (global as any).__DEV__ = false;
});

describe("ProPaywall — confirmed-but-locked reconciliation toast (Behavior B)", () => {
  it("B1: confirmed purchase where entitlements flip to full access shows no toast", async () => {
    const onClose = jest.fn();
    subState.refresh = jest.fn(async () => {
      // Happy path: the post-purchase refresh flips access on. Settling new
      // entitlement state through the provider re-renders the consumer, just
      // as the real context does.
      __setSub((prev: any) => ({
        ...prev,
        hasFullAccess: true,
        lastRefreshAt: Date.now(),
      }));
    });

    const renderer = await renderPaywall(onClose);

    await pressFirstPlanCta(renderer);

    expect(mockPurchase).toHaveBeenCalled();
    // Access is present, so the effect closes the paywall and shows no toast.
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("B2: confirmed purchase that stays locked after refresh shows one info toast", async () => {
    const onClose = jest.fn();
    subState.refresh = jest.fn(async () => {
      // Entitlements refreshed (lastRefreshAt advances) but access did NOT
      // flip — the divergent confirmed-but-locked case.
      __setSub((prev: any) => ({ ...prev, lastRefreshAt: Date.now() }));
    });

    const renderer = await renderPaywall(onClose);

    await pressFirstPlanCta(renderer);

    expect(mockPurchase).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "info" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("B3: a later unrelated entitlement refresh does not re-fire the toast", async () => {
    const onClose = jest.fn();
    subState.refresh = jest.fn(async () => {
      __setSub((prev: any) => ({ ...prev, lastRefreshAt: Date.now() }));
    });

    const renderer = await renderPaywall(onClose);

    await pressFirstPlanCta(renderer);
    expect(mockShowToast).toHaveBeenCalledTimes(1);

    // A later, unrelated entitlement refresh: a new lastRefreshAt with access
    // still locked. The confirmed-purchase ref was cleared on the first run,
    // so the effect must not toast again.
    await act(async () => {
      __setSub((prev: any) => ({ ...prev, lastRefreshAt: Date.now() + 5000 }));
    });
    await flush();

    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });
});
