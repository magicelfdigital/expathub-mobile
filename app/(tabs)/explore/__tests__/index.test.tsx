/**
 * Screen-level functional tests for the country waitlist email-capture moment
 * in app/(tabs)/explore/index.tsx.
 *
 * The waitlist submission is one of three email-capture surfaces that feed a
 * mid-funnel Meta `Lead` signal for App Promotion optimisation (the other two
 * being the readiness-quiz email gate and the web quiz-save modal). This suite
 * mirrors the readiness-gate coverage in app/onboarding/__tests__/result.test.tsx:
 * the `Lead` event must fire only after a successful backend save, never on a
 * 4xx/5xx or network error, and the raw email must never appear in the Meta
 * payload (PII guardrail).
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);

const trackEvent = jest.fn();
const logFbEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  logFbEvent: (...args: any[]) => logFbEvent(...args),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://test/",
}));

const setSelectedCountrySlug = jest.fn();
jest.mock("@/contexts/CountryContext", () => ({
  useCountry: () => ({ setSelectedCountrySlug }),
}));

jest.mock("@/components/Screen", () => {
  const React = require("react");
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement("Screen", null, children),
  };
});

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { __resetRouter } from "@/src/__test-mocks__/expo-router";

import ExploreScreen from "../index";

function getButtonsByText(testInstance: any, label: string) {
  return testInstance.findAll((n: any) => {
    if (n.type !== "Pressable") return false;
    if (typeof n.props?.onPress !== "function") return false;
    const texts = n.findAllByType("Text", { deep: true } as any);
    return texts.some((t: any) => {
      const c = t.props?.children;
      return c === label || (Array.isArray(c) && c.some((cc) => cc === label));
    });
  });
}

function getTextInputs(testInstance: any) {
  return testInstance.findAll((n: any) => n.type === "TextInput");
}

async function openWaitlistAndSubmit(
  root: any,
  email: string,
) {
  // The first "Join waitlist" button is the expanding-country trigger that
  // opens the modal (France is first in EXPANDING_COUNTRIES).
  const trigger = getButtonsByText(root, "Join waitlist")[0];
  expect(trigger).toBeDefined();
  await act(async () => {
    await trigger.props.onPress();
  });

  // First TextInput inside the now-open modal is the email field.
  const emailInput = getTextInputs(root)[0];
  expect(emailInput).toBeDefined();
  act(() => {
    emailInput.props.onChangeText(email);
  });

  // The modal's submit button is the LAST "Join waitlist" in tree order
  // (the modal renders after the ScrollView with the trigger buttons).
  const submitButtons = getButtonsByText(root, "Join waitlist");
  const submit = submitButtons[submitButtons.length - 1];
  expect(submit).toBeDefined();
  await act(async () => {
    await submit.props.onPress();
  });
}

beforeEach(() => {
  trackEvent.mockReset();
  logFbEvent.mockReset();
  setSelectedCountrySlug.mockReset();
  __resetRouter();
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({}),
  }));
});

describe("Country waitlist — Meta Lead signal", () => {
  it("fires logFbEvent('Lead', source='country_waitlist') after a successful /api/waitlist save", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ExploreScreen />);
    });

    await openWaitlistAndSubmit(renderer!.root, "ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = ((global as any).fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain("/api/waitlist");
    expect(opts.method).toBe("POST");

    const leads = logFbEvent.mock.calls.filter((c) => c[0] === "Lead");
    expect(leads).toHaveLength(1);
    expect(leads[0]).toEqual([
      "Lead",
      undefined,
      { source: "country_waitlist", country: "france" },
    ]);

    // PII guardrail: the raw email must never appear in the Meta payload.
    expect(JSON.stringify(leads[0])).not.toContain("ada@lovelace.io");
  });

  it("does NOT fire logFbEvent('Lead') when the email field is empty (no POST, no signal)", async () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ExploreScreen />);
    });

    const trigger = getButtonsByText(renderer!.root, "Join waitlist")[0];
    await act(async () => {
      await trigger.props.onPress();
    });

    // Submit without entering an email — handleSubmit bails on invalid email.
    const submitButtons = getButtonsByText(renderer!.root, "Join waitlist");
    const submit = submitButtons[submitButtons.length - 1];
    await act(async () => {
      await submit.props.onPress();
    });

    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(logFbEvent.mock.calls.filter((c) => c[0] === "Lead")).toHaveLength(0);
  });

  it("does NOT fire logFbEvent('Lead') when the API returns a 5xx (no false-positive ad signal)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }));
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ExploreScreen />);
    });

    await openWaitlistAndSubmit(renderer!.root, "ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(logFbEvent.mock.calls.filter((c) => c[0] === "Lead")).toHaveLength(0);
  });

  it("does NOT fire logFbEvent('Lead') when the API returns a 4xx", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad request" }),
    }));
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ExploreScreen />);
    });

    await openWaitlistAndSubmit(renderer!.root, "ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(logFbEvent.mock.calls.filter((c) => c[0] === "Lead")).toHaveLength(0);
  });

  it("does NOT fire logFbEvent('Lead') when fetch itself rejects (network error)", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("network down");
    });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<ExploreScreen />);
    });

    await openWaitlistAndSubmit(renderer!.root, "ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(logFbEvent.mock.calls.filter((c) => c[0] === "Lead")).toHaveLength(0);
  });
});
