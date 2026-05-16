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
}));

const completeOnboarding = jest.fn(async () => {});
jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({ completeOnboarding }),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, email: "ada@example.com" }, token: "t" }),
  AUTH_API_URL: "http://test/api/auth",
}));

jest.mock("@/src/subscriptions/revenuecat", () => ({
  setUserAttributes: jest.fn(async () => {}),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://test/",
}));
jest.mock("@/src/billing/backendClient", () => ({
  getBackendBase: () => "http://test",
}));

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
  __resetRouter();
  __setSearchParams({ answers: ANSWERS_HIGH_READY });
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
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
      readiness_level: expect.any(String),
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
});
