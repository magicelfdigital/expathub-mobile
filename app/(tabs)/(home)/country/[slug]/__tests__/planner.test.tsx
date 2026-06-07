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
  PLANNER_BOUNCE_THRESHOLD_MS: 500,
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
    isLoaded: true,
  }),
}));

jest.mock("@/contexts/BookmarkContext", () => ({
  useBookmarks: () => ({ bookmarkCount: 1, bookmarks: [], hasBookmark: () => false }),
}));
let selectedCountrySlug: string | null = "portugal";
jest.mock("@/contexts/CountryContext", () => ({
  useCountry: () => ({ selectedCountrySlug }),
}));
jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({ quizResult: null, completeOnboarding: jest.fn() }),
}));

let subscriptionState: {
  hasActiveSubscription: boolean;
  hasFullAccess: boolean;
  loading: boolean;
  lastRefreshAt: number | null;
} = {
  hasActiveSubscription: true,
  hasFullAccess: true,
  loading: false,
  lastRefreshAt: Date.now(),
};
jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => subscriptionState,
}));
let authState: { loading: boolean; token: string | null } = {
  loading: false,
  token: null,
};
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
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
const legacyBodyProps: any[] = [];
jest.mock("@/src/components/PlannerLegacyStepBody", () => {
  const React = require("react");
  return {
    PlannerLegacyStepBody: (props: any) => {
      legacyBodyProps.push(props);
      return React.createElement("PlannerLegacyStepBody", {
        "data-country": props?.countrySlug,
      });
    },
  };
});
const eligibilityProps: any[] = [];
jest.mock("@/src/components/EligibilitySnapshot", () => {
  const React = require("react");
  const Stub = (props: any) => {
    eligibilityProps.push(props);
    return React.createElement("EligibilitySnapshot", {
      "data-country": props?.countrySlug,
    });
  };
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
  subscriptionState = {
    hasActiveSubscription: true,
    hasFullAccess: true,
    loading: false,
    lastRefreshAt: Date.now(),
  };
  authState = { loading: false, token: null };
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
  legacyBodyProps.length = 0;
  eligibilityProps.length = 0;
  selectedCountrySlug = "portugal";
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
    subscriptionState = {
      hasActiveSubscription: false,
      hasFullAccess: false,
      loading: false,
      lastRefreshAt: Date.now(),
    };
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
      // Two synchronous taps in the same tick → msOpen well under 500ms,
      // so the event must be flagged as a bounce for the warehouse to
      // exclude from dwell-time stats.
      bounced: true,
    });
    expect(typeof collapsed[0][1].msOpen).toBe("number");
    expect(collapsed[0][1].msOpen).toBeLessThan(500);
  });

  it("tags planner_step_collapsed with bounced=false when the step was open past the threshold", () => {
    const { GENERIC_PLAN_STEPS } = require("@/src/data/planSteps");
    activeCountrySlug = "portugal";
    activePathwayId = "skilled-migrant";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const stepRow = renderer.root.findAll((n: any) => {
      if (n.type !== "Pressable") return false;
      if (typeof n.props?.onPress !== "function") return false;
      const texts = n.findAllByType("Text");
      return texts.some((t: any) => {
        const c = t.props?.children;
        const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
        return flat === GENERIC_PLAN_STEPS[0].title;
      });
    })[0];
    expect(stepRow).toBeDefined();

    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      act(() => {
        stepRow.props.onPress(); // expand at t=now
      });
      now += 1500; // dwell 1.5s — well past the 500ms threshold
      act(() => {
        stepRow.props.onPress(); // collapse
      });
    } finally {
      Date.now = realNow;
    }
    const collapsed = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_step_collapsed",
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0][1]).toMatchObject({
      stepId: GENERIC_PLAN_STEPS[0].id,
      country: "portugal",
      bounced: false,
    });
    expect(collapsed[0][1].msOpen).toBeGreaterThanOrEqual(500);
  });

  it("renders the Spain country name (not Portugal) when the route slug is spain — even with selectedCountrySlug=portugal as a decoy", () => {
    __setSearchParams({ slug: "spain" });
    selectedCountrySlug = "portugal"; // CountryContext decoy
    activeCountrySlug = "spain";
    activePathwayId = "non-lucrative";
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
    expect(allText).toMatch(/Spain/);
    // Cardinal regression guard: Portugal must NOT leak through when the
    // route slug is spain — that would mean a step is wired to the wrong
    // country.
    expect(allText).not.toMatch(/Portugal/);
  });

  it("forwards the route slug (NOT selectedCountrySlug) to PlannerLegacyStepBody on expand", () => {
    const { GENERIC_PLAN_STEPS } = require("@/src/data/planSteps");
    const stepWithLegacy = GENERIC_PLAN_STEPS.find(
      (s: any) => s.legacyModuleIds && s.legacyModuleIds.length > 0,
    );
    expect(stepWithLegacy).toBeDefined();

    __setSearchParams({ slug: "spain" });
    selectedCountrySlug = "portugal"; // CountryContext decoy — must NOT win
    activeCountrySlug = "spain"; // required so steps render (paid+focused)
    activePathwayId = "non-lucrative";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const stepRow = renderer.root.findAll((n: any) => {
      if (n.type !== "Pressable") return false;
      if (typeof n.props?.onPress !== "function") return false;
      const texts = n.findAllByType("Text");
      return texts.some((t: any) => {
        const c = t.props?.children;
        const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
        return flat === stepWithLegacy.title;
      });
    })[0];
    expect(stepRow).toBeDefined();
    act(() => {
      stepRow.props.onPress();
    });
    // After expanding, the country-aware legacy body must have rendered
    // and received the route slug — not the activeCountrySlug, not a
    // hard-coded one. This is the wiring the task explicitly calls out.
    expect(legacyBodyProps.length).toBeGreaterThan(0);
    const last = legacyBodyProps[legacyBodyProps.length - 1];
    expect(last.countrySlug).toBe("spain");
    expect(Array.isArray(last.legacyStepIds)).toBe(true);
    expect(last.legacyStepIds).toEqual(
      expect.arrayContaining(stepWithLegacy.legacyModuleIds),
    );
  });

  it("forwards the route slug AND active pathwayId to EligibilitySnapshot on visa_pathway expand", () => {
    __setSearchParams({ slug: "spain" });
    selectedCountrySlug = "portugal"; // CountryContext decoy — must NOT win
    activeCountrySlug = "spain";
    activePathwayId = "non-lucrative";
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    const visaRow = renderer.root.findAll((n: any) => {
      if (n.type !== "Pressable") return false;
      if (typeof n.props?.onPress !== "function") return false;
      const texts = n.findAllByType("Text");
      return texts.some((t: any) => {
        const c = t.props?.children;
        const flat = Array.isArray(c) ? c.join("") : String(c ?? "");
        return flat === "Identify a visa pathway";
      });
    })[0];
    expect(visaRow).toBeDefined();
    act(() => {
      visaRow.props.onPress();
    });
    expect(eligibilityProps.length).toBeGreaterThan(0);
    const last = eligibilityProps[eligibilityProps.length - 1];
    expect(last.countrySlug).toBe("spain");
    expect(last.pathwayId).toBe("non-lucrative");
  });

  it("country-specific PLAN_STEPS content actually differs per country (proves the forwarded slug drives different output)", () => {
    // Closes the loop: the planner forwards `countrySlug` into
    // PlannerLegacyStepBody (asserted in the test above), and that
    // component resolves country-specific content via
    // getStep3Checklist(countrySlug). Here we assert the data layer
    // genuinely returns different content for spain vs portugal — so a
    // forwarded "spain" slug results in Spanish checklist items
    // (e.g. NIE, empadronamiento) reaching the screen and a forwarded
    // "portugal" slug results in Portuguese ones (NIF, NISS).
    const { getStep3Checklist } = require("@/src/data/planSteps");
    const spainList = getStep3Checklist("spain").map((c: any) => c.label).join(" | ");
    const portugalList = getStep3Checklist("portugal").map((c: any) => c.label).join(" | ");
    expect(spainList).not.toEqual(portugalList);
    expect(spainList).toMatch(/NIE/);
    expect(portugalList).toMatch(/NIF/);
    // And spain must not leak portugal-specific content (and vice versa).
    expect(spainList).not.toMatch(/NISS/);
    expect(portugalList).not.toMatch(/empadronamiento/i);
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

describe("PlannerScreen — render gate (flicker guard)", () => {
  const allRenderedText = (renderer: any) =>
    renderer.root
      .findAllByType("Text")
      .map((t: any) =>
        Array.isArray(t.props.children)
          ? t.props.children.join("")
          : String(t.props.children ?? ""),
      )
      .join(" | ");

  it("holds the neutral state during cold start when the only entitlement result predates auth settling (prevents the free/locked flash)", () => {
    // Cold start: the planner mounts while auth is still hydrating. The
    // pre-token entitlement refresh stamped lastRefreshAt BEFORE auth settled,
    // so once the token hydrates the gate must NOT trust that stale result —
    // no country content is painted until a post-auth refresh lands.
    authState = { loading: true, token: null };
    subscriptionState = {
      hasActiveSubscription: false,
      hasFullAccess: false,
      loading: false,
      lastRefreshAt: Date.now() - 60_000,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    // Auth settles (token hydrates) but only the stale pre-token entitlement
    // result exists so far; authReadyAt is now > lastRefreshAt, gate stays shut.
    authState = { loading: false, token: "tok-123" };
    act(() => {
      renderer.update(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).not.toMatch(/Portugal/i);
  });

  it("opens during cold start once a post-auth entitlement refresh lands", () => {
    // Full cold-start transition: spinner held while only the stale pre-token
    // result exists, then a legitimate post-auth refresh (lastRefreshAt now in
    // the future relative to authReadyAt) lands and the screen renders.
    authState = { loading: true, token: null };
    subscriptionState = {
      hasActiveSubscription: false,
      hasFullAccess: false,
      loading: false,
      lastRefreshAt: Date.now() - 60_000,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    authState = { loading: false, token: "tok-123" };
    act(() => {
      renderer.update(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).not.toMatch(/Portugal/i);
    // Post-auth refresh completes with access granted.
    subscriptionState = {
      hasActiveSubscription: true,
      hasFullAccess: true,
      loading: false,
      lastRefreshAt: Date.now() + 60_000,
    };
    act(() => {
      renderer.update(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).toMatch(/Portugal/i);
  });

  it("renders on warm navigation when auth already settled before mount, even though lastRefreshAt predates it (no deadlock)", () => {
    // Regression for "plan doesn't load at all": a signed-in subscriber opens
    // the planner AFTER cold start. Auth settled and the correct entitlement
    // refresh already happened earlier, so lastRefreshAt predates this screen's
    // mount and no new refresh is triggered. The gate must still open.
    authState = { loading: false, token: "tok-123" };
    subscriptionState = {
      hasActiveSubscription: true,
      hasFullAccess: true,
      loading: false,
      lastRefreshAt: Date.now() - 120_000,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).toMatch(/Portugal/i);
  });

  it("renders for a signed-in user once the entitlement is refreshed after auth settles", () => {
    // A far-future refresh timestamp guarantees lastRefreshAt >= authReadyAt
    // (captured at render time), i.e. a legitimate post-auth result.
    authState = { loading: false, token: "tok-123" };
    subscriptionState = {
      hasActiveSubscription: true,
      hasFullAccess: true,
      loading: false,
      lastRefreshAt: Date.now() + 60_000,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).toMatch(/Portugal/i);
  });

  it("does not spin forever when entitlement settles without ever recording a refresh (lastRefreshAt null, e.g. RC init error)", () => {
    authState = { loading: false, token: "tok-123" };
    subscriptionState = {
      hasActiveSubscription: false,
      hasFullAccess: false,
      loading: false,
      lastRefreshAt: null,
    };
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<PlannerScreen />);
    });
    expect(allRenderedText(renderer)).toMatch(/Portugal/i);
  });

  it("fail-safe: renders after the ceiling even if a driver never settles (no permanent spinner)", () => {
    // Pathological on-device case: a hung entitlement fetch leaves
    // subscriptionState.loading stuck true forever, so the gate never opens
    // on its own. The screen must still render after PLANNER_GATE_MAX_WAIT_MS
    // rather than spin indefinitely ("planner doesn't load at all").
    authState = { loading: false, token: "tok-123" };
    subscriptionState = {
      hasActiveSubscription: true,
      hasFullAccess: true,
      loading: true, // never settles
      lastRefreshAt: null,
    };
    jest.useFakeTimers();
    try {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(<PlannerScreen />);
      });
      // Before the ceiling: still gated (no country content painted).
      expect(allRenderedText(renderer)).not.toMatch(/Portugal/i);
      // Advance past the fail-safe ceiling.
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(allRenderedText(renderer)).toMatch(/Portugal/i);
    } finally {
      jest.useRealTimers();
    }
  });
});
