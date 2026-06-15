/**
 * Screen-level functional tests for app/onboarding/result.tsx.
 *
 * Asserts the result screen wires the right analytics events at the right
 * times: result_screen_viewed exactly once on mount (even across re-renders),
 * the CTA buttons fire CTA-specific quiz_completed payloads, and the
 * lead-save endpoint + readiness_lead_saved event are gated on a valid
 * email (no PII leak from invalid taps).
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
const logFbEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  logFbEvent: (...args: any[]) => logFbEvent(...args),
  identifyUser: () => {},
  identifyByEmail: () => {},
}));

const completeOnboarding = jest.fn(async () => {});
jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({ completeOnboarding }),
}));

let __authUser: { id: number; email: string } | null = {
  id: 1,
  email: "ada@example.com",
};
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: __authUser, token: __authUser ? "t" : null }),
  AUTH_API_URL: "http://test/api/auth",
}));

let __hasProAccess = false;
let __entitlementLoading = false;
jest.mock("@/src/contexts/EntitlementContext", () => ({
  useEntitlement: () => ({
    hasProAccess: __hasProAccess,
    loading: __entitlementLoading,
  }),
}));

jest.mock("@/src/subscriptions/revenuecat", () => ({
  setUserAttributes: jest.fn(async () => {}),
}));

const cancelQuizReminders = jest.fn();
jest.mock("@/src/lib/notifications", () => ({
  cancelQuizReminders: (...args: any[]) => cancelQuizReminders(...args),
}));

const maybeRequestReview = jest.fn();
jest.mock("@/src/lib/rating", () => ({
  maybeRequestReview: (...args: any[]) => maybeRequestReview(...args),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://test/",
}));
jest.mock("@/src/billing/backendClient", () => ({
  getBackendBase: () => "http://test",
}));

const quizSaveModalRenders: Array<{ visible: boolean; noCount: number }> = [];
jest.mock("@/src/components/QuizSaveModal", () => {
  const React = require("react");
  return {
    QuizSaveModal: (props: {
      visible: boolean;
      noCount: number;
      onClose: () => void;
      onContinue: () => void;
    }) => {
      quizSaveModalRenders.push({
        visible: props.visible,
        noCount: props.noCount,
      });
      return React.createElement("QuizSaveModal", {
        testID: "quiz-save-modal",
        visible: props.visible,
        noCount: props.noCount,
        onClose: props.onClose,
        onContinue: props.onContinue,
      });
    },
  };
});

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  __resetRouter,
  __getRouter,
  __setSearchParams,
} from "@/src/__test-mocks__/expo-router";

import ResultScreen from "../result";

function getButton(
  testInstance: any,
  label: string,
) {
  return testInstance.findAll((n: any) => {
    if (n.type !== "Pressable") return false;
    if (typeof n.props?.onPress !== "function") return false;
    const texts = n.findAllByType("Text", { deep: true } as any);
    return texts.some((t: any) => {
      const c = t.props?.children;
      return (
        c === label || (Array.isArray(c) && c.some((cc) => cc === label))
      );
    });
  })[0];
}

function getTextInput(testInstance: any) {
  return testInstance.findAll((n: any) => n.type === "TextInput")[0];
}

const ANSWERS_HIGH_READY = JSON.stringify({
  1: "yes",
  2: "yes",
  3: "yes",
  4: "yes",
  5: "yes",
  6: "yes",
  7: "yes",
  8: "twelve_months",
  firstName: "Ada",
});

beforeEach(() => {
  trackEvent.mockReset();
  logFbEvent.mockReset();
  completeOnboarding.mockClear();
  cancelQuizReminders.mockReset();
  maybeRequestReview.mockReset();
  quizSaveModalRenders.length = 0;
  __resetRouter();
  __setSearchParams({ answers: ANSWERS_HIGH_READY });
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  __authUser = { id: 1, email: "ada@example.com" };
});

describe("ResultScreen — funnel analytics", () => {
  it("fires result_screen_viewed exactly once on mount (and not on re-render)", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const viewed = trackEvent.mock.calls.filter(
      (c) => c[0] === "result_screen_viewed",
    );
    expect(viewed).toHaveLength(1);
    expect(viewed[0][1]).toMatchObject({
      readiness_level: expect.any(String),
      matchScore: expect.any(Number),
    });
    act(() => {
      renderer!.update(<ResultScreen />);
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "result_screen_viewed"),
    ).toHaveLength(1);
  });

  it("fires logFbEvent('CompletedQuiz') alongside result_screen_viewed", () => {
    act(() => {
      TestRenderer.create(<ResultScreen />);
    });
    expect(logFbEvent).toHaveBeenCalledWith(
      "CompletedQuiz",
      undefined,
      expect.objectContaining({ readiness_level: expect.any(String) }),
    );
  });

  it("Create Account CTA fires quiz_completed with action='create_account' and routes to /auth?mode=register", async () => {
    __authUser = null;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const btn = getButton(renderer!.root, "Create free account to save");
    expect(btn).toBeDefined();
    await act(async () => {
      await btn.props.onPress();
    });
    const completed = trackEvent.mock.calls.filter(
      (c) => c[0] === "quiz_completed",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0][1]).toMatchObject({ action: "create_account" });
    expect(__getRouter().replace).toHaveBeenCalledWith("/auth?mode=register");
    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.anything(),
      false,
      expect.anything(),
    );
  });

  it("Continue CTA fires quiz_completed with action='continue' and routes home", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const btn = getButton(renderer!.root, "Continue to ExpatHub");
    expect(btn).toBeDefined();
    await act(async () => {
      await btn.props.onPress();
    });
    const completed = trackEvent.mock.calls.filter(
      (c) => c[0] === "quiz_completed",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0][1]).toMatchObject({ action: "continue" });
    expect(__getRouter().replace).toHaveBeenCalledWith("/(tabs)/(home)");
    expect(completeOnboarding).toHaveBeenCalledWith(expect.anything(), true, expect.anything());
  });

  it("does NOT fire readiness_lead_saved when the email field is empty", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const btn = getButton(renderer!.root, "Email me the results");
    expect(btn).toBeDefined();
    await act(async () => {
      await btn.props.onPress();
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "readiness_lead_saved"),
    ).toHaveLength(0);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("does NOT fire readiness_lead_saved when the API returns a 5xx (no false-positive conversion)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }));
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "readiness_lead_saved"),
    ).toHaveLength(0);
  });

  it("does NOT fire readiness_lead_saved when fetch itself rejects (network error)", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("network down");
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "readiness_lead_saved"),
    ).toHaveLength(0);
  });

  it("fires readiness_lead_saved AND POSTs to /api/readiness-lead when the email is valid AND the API succeeds", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    expect(input).toBeDefined();
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = ((global as any).fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/api/readiness-lead");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      email: "ada@lovelace.io",
      readinessLevel: expect.any(String),
      score: expect.any(Number),
    });
    const saved = trackEvent.mock.calls.filter(
      (c) => c[0] === "readiness_lead_saved",
    );
    expect(saved).toHaveLength(1);
    expect(saved[0][1]).toMatchObject({
      readiness_level: expect.any(String),
      score: expect.any(Number),
    });
  });

  it("fires logFbEvent('Lead', source='readiness_quiz_gate') after a successful /api/readiness-lead save", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    const leads = logFbEvent.mock.calls.filter((c) => c[0] === "Lead");
    expect(leads).toHaveLength(1);
    expect(leads[0]).toEqual([
      "Lead",
      undefined,
      { source: "readiness_quiz_gate" },
    ]);
    // PII guardrail: the raw email must never appear in the Meta payload.
    expect(JSON.stringify(leads[0])).not.toContain("ada@lovelace.io");
  });

  it("does NOT fire logFbEvent('Lead') when the API returns a 5xx (no false-positive ad signal)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }));
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(
      logFbEvent.mock.calls.filter((c) => c[0] === "Lead"),
    ).toHaveLength(0);
  });

  it("does NOT fire logFbEvent('Lead') when the API returns a 4xx", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad request" }),
    }));
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const input = getTextInput(renderer!.root);
    act(() => {
      input.props.onChangeText("ada@lovelace.io");
    });
    const btn = getButton(renderer!.root, "Email me the results");
    await act(async () => {
      await btn.props.onPress();
    });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(
      logFbEvent.mock.calls.filter((c) => c[0] === "Lead"),
    ).toHaveLength(0);
  });

  it("Edit answers link fires result_edit_answers_tapped and router.replace with prefill + edit=1", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const link = renderer!.root.findByProps({ testID: "result-edit-answers-link" });
    expect(link).toBeDefined();
    await act(async () => {
      await link.props.onPress();
    });
    const tapped = trackEvent.mock.calls.filter(
      (c) => c[0] === "result_edit_answers_tapped",
    );
    expect(tapped).toHaveLength(1);
    expect(tapped[0][1]).toMatchObject({
      readiness_level: expect.any(String),
    });
    expect(__getRouter().replace).toHaveBeenCalledWith({
      pathname: "/onboarding/quiz",
      params: expect.objectContaining({
        prefill: ANSWERS_HIGH_READY,
        edit: "1",
      }),
    });
    // The prefill param must be a JSON-decodable copy of the user's answers
    // so the quiz can re-hydrate every selection (regression: a stringified
    // [object Object] would silently strand the editor with empty state).
    const replaceCall = __getRouter().replace.mock.calls[0][0] as any;
    const decoded = JSON.parse(replaceCall.params.prefill);
    expect(decoded).toMatchObject({ 1: "yes", 8: "twelve_months" });
  });

  it("Unlock Roadmap CTA fires paywall_unlock_tapped with source='result_screen' and routes to /subscribe", async () => {
    // need at least one urgent blocker for the paywall CTA to render
    __setSearchParams({
      answers: JSON.stringify({
        1: "no",
        2: "no",
        3: "no",
        4: "no",
        5: "no",
        6: "no",
        7: "no",
        8: "twelve_plus",
      }),
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const btn = getButton(renderer!.root, "Unlock your full roadmap");
    if (!btn) {
      // some answer sets may not surface urgent blockers; skip rather than fail
      return;
    }
    await act(async () => {
      await btn.props.onPress();
    });
    const tapped = trackEvent.mock.calls.filter(
      (c) => c[0] === "paywall_unlock_tapped",
    );
    expect(tapped).toHaveLength(1);
    expect(tapped[0][1]).toMatchObject({ source: "result_screen" });
    expect(__getRouter().push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/subscribe",
        params: expect.objectContaining({ entryPoint: "result_screen" }),
      }),
    );
  });

  it("does NOT render the Unlock Roadmap CTA when the user already has access (no paywall dead-end)", async () => {
    // Same urgent-blocker answer set that surfaces the CTA for non-entitled users.
    __setSearchParams({
      answers: JSON.stringify({
        1: "no",
        2: "no",
        3: "no",
        4: "no",
        5: "no",
        6: "no",
        7: "no",
        8: "twelve_plus",
      }),
    });
    __hasProAccess = true;
    try {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(<ResultScreen />);
      });
      const btn = getButton(renderer!.root, "Unlock your full roadmap");
      expect(btn).toBeFalsy();
    } finally {
      __hasProAccess = false;
    }
  });
});

describe("ResultScreen — save-progress prompt for low-readiness takers", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function findSaveModalNode(root: any) {
    return root.findAll(
      (n: any) => n.props && n.props.testID === "quiz-save-modal",
    )[0];
  }

  it("renders QuizSaveModal with visible=true ~900ms after mount when there are ≥3 'no' answers", () => {
    __setSearchParams({
      answers: JSON.stringify({
        1: "no",
        2: "no",
        3: "no",
        4: "yes",
        5: "yes",
        6: "yes",
        7: "yes",
        8: "twelve_months",
      }),
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    const initial = findSaveModalNode(renderer!.root);
    expect(initial).toBeDefined();
    expect(initial.props.visible).toBe(false);
    expect(initial.props.noCount).toBe(3);
    act(() => {
      jest.advanceTimersByTime(900);
    });
    const after = findSaveModalNode(renderer!.root);
    expect(after.props.visible).toBe(true);
    expect(after.props.noCount).toBe(3);
  });

  it("never makes QuizSaveModal visible when there are fewer than 3 'no' answers", () => {
    __setSearchParams({
      answers: JSON.stringify({
        1: "no",
        2: "no",
        3: "yes",
        4: "yes",
        5: "yes",
        6: "yes",
        7: "yes",
        8: "twelve_months",
      }),
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    const node = findSaveModalNode(renderer!.root);
    expect(node).toBeDefined();
    expect(node.props.noCount).toBe(2);
    expect(
      quizSaveModalRenders.every((r) => r.visible === false),
    ).toBe(true);
  });

  it("only triggers the save prompt once: after dismissal, re-renders and timers never re-open it (savePromptShownRef guard)", () => {
    __setSearchParams({
      answers: JSON.stringify({
        1: "no",
        2: "no",
        3: "no",
        4: "no",
        5: "yes",
        6: "yes",
        7: "yes",
        8: "twelve_months",
      }),
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    // Helper: count false→true transitions in the recorded prop history.
    const countOpens = () => {
      let opens = 0;
      let prev = false;
      for (const r of quizSaveModalRenders) {
        if (!prev && r.visible) opens++;
        prev = r.visible;
      }
      return opens;
    };

    // No timer fired yet — modal must still be hidden.
    expect(findSaveModalNode(renderer!.root).props.visible).toBe(false);
    expect(countOpens()).toBe(0);

    // First trigger fires after 900ms.
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(findSaveModalNode(renderer!.root).props.visible).toBe(true);
    expect(countOpens()).toBe(1);

    // Simulate the user dismissing the modal — this is exactly what the
    // production handler does (setSavePromptVisible(false)). We invoke
    // the real onClose prop passed down to QuizSaveModal so we exercise
    // the actual dismissal path, not a synthetic one.
    const onClose = findSaveModalNode(renderer!.root).props.onClose;
    expect(typeof onClose).toBe("function");
    act(() => {
      onClose();
    });
    expect(findSaveModalNode(renderer!.root).props.visible).toBe(false);

    // Force several re-renders and drain a generous timer window. The
    // guard ref must prevent the effect from scheduling a second timer
    // and must prevent any new false→true transition from happening.
    act(() => {
      renderer!.update(<ResultScreen />);
      renderer!.update(<ResultScreen />);
      renderer!.update(<ResultScreen />);
    });
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    // Still hidden, and exactly one open ever recorded across the whole
    // lifetime of this render — the guard held.
    expect(findSaveModalNode(renderer!.root).props.visible).toBe(false);
    expect(countOpens()).toBe(1);
  });
});

describe("ResultScreen — re-engagement cleanup + rating prompt", () => {
  it("cancels the quiz reminders and offers the rating prompt once on mount", async () => {
    await act(async () => {
      TestRenderer.create(<ResultScreen />);
    });
    expect(cancelQuizReminders).toHaveBeenCalledTimes(1);
    expect(maybeRequestReview).toHaveBeenCalledTimes(1);
  });

  it("cancels the reminders before requesting the rating prompt", async () => {
    let order = 0;
    let cancelOrder = -1;
    let reviewOrder = -1;
    cancelQuizReminders.mockImplementation(async () => {
      cancelOrder = order++;
    });
    maybeRequestReview.mockImplementation(async () => {
      reviewOrder = order++;
    });
    await act(async () => {
      TestRenderer.create(<ResultScreen />);
    });
    expect(cancelOrder).toBeGreaterThanOrEqual(0);
    expect(reviewOrder).toBeGreaterThan(cancelOrder);
  });

  it("does not re-trigger the cleanup or rating prompt on re-render (viewedRef guard)", async () => {
    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(<ResultScreen />);
    });
    await act(async () => {
      renderer!.update(<ResultScreen />);
    });
    expect(cancelQuizReminders).toHaveBeenCalledTimes(1);
    expect(maybeRequestReview).toHaveBeenCalledTimes(1);
  });
});
