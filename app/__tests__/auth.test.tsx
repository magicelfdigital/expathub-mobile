/**
 * Screen-level test for app/auth.tsx — redirectTo handling on success.
 *
 * Anonymous users landing on /auth via a worksheet row are sent with a
 * redirectTo param. On successful registration, the screen MUST honor
 * that param via router.replace(redirectTo) instead of falling back to
 * router.back(); otherwise the user lands back on the worksheets list
 * instead of the worksheet they originally tapped.
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);

// auth.tsx requires a PNG asset for the logo at module-evaluation time;
// stub it so jest doesn't try to parse the binary file.
jest.mock(
  "../../assets/brand/fulllogo_transparent_nobuffer.png",
  () => 1,
  { virtual: true },
);

const register = jest.fn(async () => {});
const login = jest.fn(async () => {});
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ register, login }),
}));

jest.mock("@/src/lib/analytics", () => ({
  trackEvent: jest.fn(),
  logFbEvent: jest.fn(),
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  __resetRouter,
  __getRouter,
  __setSearchParams,
} from "@/src/__test-mocks__/expo-router";

import AuthScreen from "../auth";

beforeEach(() => {
  __resetRouter();
  __setSearchParams({});
  register.mockClear();
  login.mockClear();
});

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AuthScreen — redirectTo on success", () => {
  it("calls router.replace(redirectTo) after a successful register when a redirectTo param is present", async () => {
    const redirectTo = "/(tabs)/(home)/worksheets/ws_financial_cushion";
    __setSearchParams({ mode: "register", redirectTo });

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AuthScreen />);
    });

    const email = renderer.root.findByProps({ testID: "auth-email" });
    const password = renderer.root.findByProps({ testID: "auth-password" });
    const confirm = renderer.root.findByProps({
      testID: "auth-confirm-password",
    });
    act(() => {
      email.props.onChangeText("ada@example.com");
      password.props.onChangeText("hunter2");
      confirm.props.onChangeText("hunter2");
    });

    const submit = renderer.root.findByProps({ testID: "auth-submit" });
    await act(async () => {
      await submit.props.onPress();
    });
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(1);
    const router = __getRouter();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(redirectTo);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("falls back to router.back() after a successful register when no redirectTo param is present", async () => {
    __setSearchParams({ mode: "register" });
    const router: any = __getRouter();
    router.canGoBack = jest.fn(() => true);

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AuthScreen />);
    });

    const email = renderer.root.findByProps({ testID: "auth-email" });
    const password = renderer.root.findByProps({ testID: "auth-password" });
    const confirm = renderer.root.findByProps({
      testID: "auth-confirm-password",
    });
    act(() => {
      email.props.onChangeText("ada@example.com");
      password.props.onChangeText("hunter2");
      confirm.props.onChangeText("hunter2");
    });

    const submit = renderer.root.findByProps({ testID: "auth-submit" });
    await act(async () => {
      await submit.props.onPress();
    });
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
