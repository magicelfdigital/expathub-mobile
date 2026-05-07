/**
 * Functional test for app/(tabs)/(home)/country/[slug]/planner.tsx.
 *
 * Mounts the planner screen via react-test-renderer with every context
 * + native module mocked, then verifies the production interactions:
 *
 *  - the screen reads the country slug from the route and renders the
 *    country-specific heading
 *  - tapping the "Focus on <country>" CTA calls PlanContext.startPlan
 *    with (slug, pathwayKey, countryName)
 *  - tapping a step row toggles expand/collapse (handleSetExpandedId
 *    flips the same step closed on a second tap)
 *  - the planner_completed analytics event fires exactly once when the
 *    progress hook reports percent === 100 and the conditions in
 *    shouldFirePlannerCompleted are met
 *  - the planner_completed event does NOT re-fire on a re-render at 100%
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

const trackEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  logFbEvent: () => {},
}));

const startPlan = jest.fn();
const resetPlan = jest.fn();
let activeCountrySlug: string | null = "portugal";
let activePathwayId: string | null = "skilled-migrant";
jest.mock("@/src/contexts/PlanContext", () => ({
  usePlan: () => ({
    activeCountrySlug,
    activePathwayId,
    startPlan,
    resetPlan,
  }),
}));

jest.mock("@/contexts/BookmarkContext", () => ({
  useBookmarks: () => ({ bookmarkCount: 1, bookmarks: [], hasBookmark: () => false }),
}));
jest.mock("@/contexts/CountryContext", () => ({
  useCountry: () => ({ selectedCountrySlug: "portugal" }),
}));
jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({ quizResult: null, completeOnboarding: jest.fn() }),
}));

let subscriptionState: { hasActiveSubscription: boolean; hasFullAccess: boolean } = {
  hasActiveSubscription: true,
  hasFullAccess: true,
};
jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => subscriptionState,
}));

let progressState: any = {
  isStepComplete: () => false,
  setStep: jest.fn(),
  toggleStep: jest.fn(),
  completedCount: 0,
  percent: 0,
  isPending: false,
  isReady: true,
  isLoading: false,
};
jest.mock("@/src/hooks/useProgress", () => ({
  useProgress: () => progressState,
  useProgressPercent: () => ({
    percent: progressState.percent,
    completedCount: progressState.completedCount,
    totalSteps: 10,
    isLoading: false,
    isReady: true,
  }),
}));

jest.mock("@/src/hooks/useAutoCompletePlannerSteps", () => ({
  useAutoCompletePlannerSteps: () => {},
}));

jest.mock("@/components/Screen", () => {
  const React = require("react");
  return {
    Screen: ({ children }: any) =>
      React.createElement("Screen", null, children),
  };
});
jest.mock("@/src/components/PlannerConfetti", () => {
  const React = require("react");
  return { PlannerConfetti: () => React.createElement("PlannerConfetti") };
});
jest.mock("@/src/components/PlannerLegacyStepBody", () => {
  const React = require("react");
  return {
    PlannerLegacyStepBody: () =>
      React.createElement("PlannerLegacyStepBody"),
  };
});
jest.mock("@/src/components/EligibilitySnapshot", () => {
  const React = require("react");
  const Stub = () => React.createElement("EligibilitySnapshot");
  return { __esModule: true, default: Stub };
});

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  __resetRouter,
  __setSearchParams,
} from "@/src/__test-mocks__/expo-router";

import PlannerScreen from "../planner";

function getButton(root: any, label: string) {
  return root.findAll((n: any) => {
    if (n.type !== "Pressable") return false;
    if (typeof n.props?.onPress !== "function") return false;
    const texts = n.findAllByType("Text");
    return texts.some((t: any) => {
      const c = t.props?.children;
      const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
      return flat.includes(label);
    });
  })[0];
}

beforeEach(() => {
  trackEvent.mockReset();
  startPlan.mockReset();
  resetPlan.mockReset();
  __resetRouter();
  __setSearchParams({ slug: "portugal" });
  activeCountrySlug = null;
  activePathwayId = null;
  subscriptionState = { hasActiveSubscription: true, hasFullAccess: true };
  progressState = {
    isStepComplete: () => false,
    setStep: jest.fn(),
    toggleStep: jest.fn(),
    completedCount: 0,
    percent: 0,
    isPending: false,
    isReady: true,
    isLoading: false,
  };
});

describe("PlannerScreen — functional", () => {
  it("renders without throwing for a valid country slug", () => {
    let renderer: any;
    expect(() => {
      act(() => {
        renderer = TestRenderer.create(<PlannerScreen />);
      });
    }).not.toThrow();
    expect(renderer).toBeDefined();
  });

  it("renders the country name in the heading (proves slug -> country wiring)", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const allText = renderer.root
      .findAllByType("Text")
      .map((t: any) =>
        Array.isArray(t.props.children)
          ? t.props.children.join("")
          : String(t.props.children ?? ""),
      )
      .join(" | ");
    // The country in the fixture is Portugal.
    expect(allText).toMatch(/Portugal/i);
  });

  it("Focus button calls PlanContext.startPlan with (slug, pathwayKey, countryName)", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const focusBtn = getButton(renderer.root, "Focus on");
    expect(focusBtn).toBeDefined();
    act(() => {
      focusBtn.props.onPress();
    });
    expect(startPlan).toHaveBeenCalledTimes(1);
    const [slugArg, pathwayArg, nameArg] = startPlan.mock.calls[0];
    expect(slugArg).toBe("portugal");
    expect(typeof pathwayArg).toBe("string");
    expect(pathwayArg.length).toBeGreaterThan(0);
    expect(nameArg).toMatch(/Portugal/i);
  });

  it("fires planner_completed exactly once when percent reaches 100 and the user has the plan", () => {
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    progressState = {
      ...progressState,
      percent: 100,
      completedCount: 10,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const completed = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_completed",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0][1]).toEqual({ country: "portugal" });

    // Re-render at 100% — must NOT double-fire.
    act(() => {
      renderer.update(<PlannerScreen />);
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "planner_completed"),
    ).toHaveLength(1);
  });

  it("does NOT fire planner_completed at 100% if the user is not on a paid tier (Pro-only feature)", () => {
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    subscriptionState = { hasActiveSubscription: false, hasFullAccess: false };
    progressState = { ...progressState, percent: 100, completedCount: 10 };
    act(() => {
      TestRenderer.create(<PlannerScreen />);
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "planner_completed"),
    ).toHaveLength(0);
  });

  it("does NOT fire planner_completed at 100% if the user has not focused this country", () => {
    activeCountrySlug = "spain"; // user is planning a different country
    activePathwayId = "skilled-migrant";
    progressState = { ...progressState, percent: 100, completedCount: 10 };
    act(() => {
      TestRenderer.create(<PlannerScreen />);
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "planner_completed"),
    ).toHaveLength(0);
  });

  it("groups the 10 generic planner steps under their stage headings (stage grouping)", () => {
    const { PLAN_STAGES, GENERIC_PLAN_STEPS } = require("@/src/data/planSteps");
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const allText = renderer.root
      .findAllByType("Text")
      .map((t: any) =>
        Array.isArray(t.props.children)
          ? t.props.children.join("")
          : String(t.props.children ?? ""),
      )
      .join(" | ");
    // Every PLAN_STAGES title must appear as a heading in the rendered tree.
    for (const stage of PLAN_STAGES) {
      expect(allText).toContain(stage.title);
    }
    // Every GENERIC_PLAN_STEPS title must also appear (i.e. the steps are
    // grouped, not dropped on the floor).
    for (const step of GENERIC_PLAN_STEPS) {
      expect(allText).toContain(step.title);
    }
  });

  it("tapping a step row expands it; tapping it again collapses it (toggle behavior)", () => {
    const { GENERIC_PLAN_STEPS } = require("@/src/data/planSteps");
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    // Find the first step's expand toggle: the chevron Pressable inside
    // the step row. We locate it by walking pressables that have the
    // step title text nested under them.
    const firstStepTitle: string = GENERIC_PLAN_STEPS[0].title;
    const stepRow = renderer.root.findAll((n: any) => {
      if (n.type !== "Pressable") return false;
      if (typeof n.props?.onPress !== "function") return false;
      const texts = n.findAllByType("Text");
      return texts.some((t: any) => {
        const c = t.props?.children;
        const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
        return flat === firstStepTitle;
      });
    })[0];
    expect(stepRow).toBeDefined();

    // First tap: expand. The chevron icon (Ionicons stub) should flip to
    // "chevron-up" — and trackEvent("planner_step_expanded", ...) fires.
    act(() => {
      stepRow.props.onPress();
    });
    const expanded = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_step_expanded",
    );
    expect(expanded).toHaveLength(1);
    expect(expanded[0][1]).toMatchObject({
      stepId: GENERIC_PLAN_STEPS[0].id,
      country: "portugal",
    });

    // Second tap: collapse. planner_step_collapsed must fire.
    act(() => {
      stepRow.props.onPress();
    });
    const collapsed = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_step_collapsed",
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0][1]).toMatchObject({
      stepId: GENERIC_PLAN_STEPS[0].id,
      country: "portugal",
    });
  });

  it("expanding a second step auto-collapses the first (single-open invariant)", () => {
    const { GENERIC_PLAN_STEPS } = require("@/src/data/planSteps");
    if (GENERIC_PLAN_STEPS.length < 2) return; // defensive — should be 10
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const findStepRow = (title: string) =>
      renderer.root.findAll((n: any) => {
        if (n.type !== "Pressable") return false;
        if (typeof n.props?.onPress !== "function") return false;
        const texts = n.findAllByType("Text");
        return texts.some((t: any) => {
          const c = t.props?.children;
          const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
          return flat === title;
        });
      })[0];
    const first = findStepRow(GENERIC_PLAN_STEPS[0].title);
    const second = findStepRow(GENERIC_PLAN_STEPS[1].title);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    act(() => {
      first.props.onPress(); // open A
    });
    act(() => {
      second.props.onPress(); // open B → must auto-close A
    });
    // Two expansions logged (one per opened step)
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "planner_step_expanded"),
    ).toHaveLength(2);
    // One collapse logged (for A, when B opened)
    const collapsed = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_step_collapsed",
    );
    expect(collapsed.length).toBeGreaterThanOrEqual(1);
    expect(collapsed[0][1]).toMatchObject({
      stepId: GENERIC_PLAN_STEPS[0].id,
    });
  });
});
