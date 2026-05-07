/**
 * Functional test for app/account.tsx — the readiness section.
 *
 * Mounts the account screen with all contexts mocked and verifies the
 * rendered output for the "Relocation readiness" card:
 *
 *  - when quizResult is null, the readiness section is not rendered
 *    (graceful absence — no crash, no empty card)
 *  - when quizResult is present, the legacy "X/16" string is NOT in
 *    the rendered tree (regression guard against re-introducing the
 *    score-as-text pattern)
 *  - the progress-bar fill width is derived from quizResult.score /
 *    quizResult.maxScore via getReadinessFillPercent
 *  - the readiness label from quizResult.readiness.label IS rendered
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@/src/__test-mocks__/async-storage"),
);

jest.mock("@/src/lib/analytics", () => ({
  trackEvent: jest.fn(),
  logFbEvent: jest.fn(),
}));

jest.mock("@/src/data", () => ({
  getCountries: () => [],
  getCountry: (_slug: string) => null,
  getPathways: (_slug: string) => [],
  isLaunchCountry: (_slug: string) => true,
  sortCountriesAlpha: (a: any, b: any) =>
    String(a?.name ?? "").localeCompare(String(b?.name ?? "")),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, email: "ada@example.com" },
    token: "tok",
    logout: jest.fn(async () => {}),
  }),
}));

jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => ({
    hasActiveSubscription: false,
    hasFullAccess: false,
    accessType: null,
    source: null,
    expirationDate: null,
    sandboxMode: false,
    setSandboxOverride: jest.fn(),
    refresh: jest.fn(async () => {}),
  }),
}));

let mockQuizResult: any = null;
const clearForRetake = jest.fn(async () => {});
jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({
    quizResult: mockQuizResult,
    clearForRetake,
  }),
}));

jest.mock("@/src/contexts/PlanContext", () => ({
  usePlan: () => ({
    activeCountrySlug: null,
    startPlan: jest.fn(),
    resetPlan: jest.fn(),
  }),
}));

jest.mock("@/src/hooks/useProgress", () => ({
  useProgressPercent: () => ({
    percent: 0,
    completedCount: 0,
    totalSteps: 10,
    isLoading: false,
    isReady: false,
  }),
}));

jest.mock("@/src/billing/backendClient", () => ({
  getBackendBase: () => "http://test",
}));
jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://test/",
}));

jest.mock("@/src/billing", () => ({
  getOrchestrator: () => ({ restore: async () => ({ status: "none" }) }),
  clearRefreshCooldown: jest.fn(),
}));

jest.mock("@/src/components/CancellationModal", () => {
  const React = require("react");
  return { CancellationModal: () => React.createElement("CancellationModal") };
});

jest.mock("@/utils/crashlytics", () => ({
  testCrash: jest.fn(),
  isNativeBuild: false,
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { __resetRouter } from "@/src/__test-mocks__/expo-router";

import AccountScreen from "../account";

function collectText(root: any): string {
  return root
    .findAllByType("Text")
    .map((t: any) => {
      const c = t.props?.children;
      if (c == null) return "";
      if (Array.isArray(c)) {
        return c
          .map((x: any) =>
            x == null
              ? ""
              : typeof x === "object"
                ? JSON.stringify(x)
                : String(x),
          )
          .join("");
      }
      return typeof c === "object" ? JSON.stringify(c) : String(c);
    })
    .join(" | ");
}

beforeEach(() => {
  __resetRouter();
  mockQuizResult = null;
  clearForRetake.mockReset();
});

describe("AccountScreen — readiness section", () => {
  it("does NOT render the readiness card when quizResult is null (graceful absence)", () => {
    mockQuizResult = null;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    const text = collectText(renderer.root);
    expect(text).not.toMatch(/Relocation readiness/i);
    expect(text).not.toMatch(/Retake Quiz/i);
  });

  it("does NOT render the readiness card when quizResult is undefined (defensive)", () => {
    mockQuizResult = undefined;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    const text = collectText(renderer.root);
    expect(text).not.toMatch(/Relocation readiness/i);
  });

  it("renders the readiness card and the readiness label, but NEVER the legacy 'X/16' score string", () => {
    mockQuizResult = {
      score: 12,
      maxScore: 16,
      readiness: { level: "ready", label: "Ready to launch" },
      risks: [],
      topMatch: null,
      answers: {},
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    const text = collectText(renderer.root);
    expect(text).toMatch(/Relocation readiness/i);
    expect(text).toMatch(/Ready to launch/);
    expect(text).toMatch(/Retake Quiz/);
    // The cardinal regression guard: NO "12/16" or any "/16" raw score
    // anywhere in the rendered text. The score is communicated via the
    // progress bar + label only.
    expect(text).not.toMatch(/12\s*\/\s*16/);
    expect(text).not.toMatch(/\b\d{1,2}\s*\/\s*16\b/);
  });

  it("renders the topMatch country name when quizResult includes one", () => {
    mockQuizResult = {
      score: 12,
      maxScore: 16,
      readiness: { level: "ready", label: "Ready to launch" },
      risks: [],
      topMatch: { name: "Portugal", flag: "PT" },
      answers: {},
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    const text = collectText(renderer.root);
    expect(text).toMatch(/Top Match: Portugal/);
  });

  it("derives the progress-bar fill width from quizResult.score (not a hard-coded value)", () => {
    mockQuizResult = {
      score: 8,
      maxScore: 16,
      readiness: { level: "exploring", label: "Exploring" },
      risks: [],
      topMatch: null,
      answers: {},
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    // Find any inner View with width: "X%" — the progress bar fill.
    const fills = renderer.root.findAll(
      (n: any) =>
        n.type === "View" &&
        typeof n.props?.style?.width === "string" &&
        /%$/.test(n.props.style.width),
    );
    expect(fills.length).toBeGreaterThan(0);
    const widths = fills.map((n: any) =>
      parseFloat(String(n.props.style.width).replace("%", "")),
    );
    // 8/16 = 50% — fill must be in [40,60] band (allow rounding/calc helper)
    const inMidRange = widths.some((w: number) => w >= 40 && w <= 60);
    expect(inMidRange).toBe(true);
  });

  it("renders a higher fill width for a higher score (proves derivation, not constant)", () => {
    mockQuizResult = {
      score: 15,
      maxScore: 16,
      readiness: { level: "ready", label: "Ready" },
      risks: [],
      topMatch: null,
      answers: {},
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AccountScreen />);
    });
    const fills = renderer.root.findAll(
      (n: any) =>
        n.type === "View" &&
        typeof n.props?.style?.width === "string" &&
        /%$/.test(n.props.style.width),
    );
    const widths = fills.map((n: any) =>
      parseFloat(String(n.props.style.width).replace("%", "")),
    );
    // 15/16 ~ 93.75% — at least one fill width must be >= 80
    const isHigh = widths.some((w: number) => w >= 80);
    expect(isHigh).toBe(true);
  });
});
