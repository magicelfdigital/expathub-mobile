/**
 * Anonymous-flow screen tests for the worksheets feature.
 *
 *  - Worksheets list (index.tsx): tapping any row when no user is signed
 *    in must push /auth with mode=register and a redirectTo back to the
 *    specific worksheet.
 *  - Worksheet detail ([id].tsx): mounting with no user must replace to
 *    /auth (register) with redirectTo back to the same worksheet — the
 *    deep-link guard for users who arrive via a shared URL.
 *
 * These two tests guard the signup nudge that the worksheets onboarding
 * funnel depends on; a future refactor of either screen could silently
 * drop the redirect, and these would catch it.
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, token: null }),
}));

jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => ({ hasFullAccess: false }),
}));

jest.mock("@/contexts/OnboardingContext", () => ({
  useOnboarding: () => ({
    pendingWorksheetDelta: null,
    clearPendingWorksheetDelta: jest.fn(),
  }),
}));

const mockWorksheets = [
  {
    id: "ws_financial_cushion",
    title: "Financial cushion",
    dimension: "Money & runway",
    questionId: 1,
  },
  {
    id: "ws_visa_pathway",
    title: "Visa pathway",
    dimension: "Legal route",
    questionId: 3,
  },
];

jest.mock("@/src/hooks/useWorksheets", () => ({
  useWorksheetList: () => ({ data: mockWorksheets, isLoading: false }),
  useWorksheetResponses: () => ({ data: [] }),
  useWorksheetResponse: () => undefined,
  useSubmitWorksheet: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/src/components/WorksheetDeltaBanner", () => ({
  WorksheetDeltaBanner: () => null,
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  __resetRouter,
  __getRouter,
  __setSearchParams,
} from "@/src/__test-mocks__/expo-router";

import WorksheetsListScreen from "../index";
import WorksheetDetailScreen from "../[id]";

beforeEach(() => {
  __resetRouter();
  __setSearchParams({});
});

describe("Worksheets list — anonymous flow", () => {
  it("pushes to /auth with mode=register and a redirectTo when an anonymous user taps a row", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });

    const row = renderer.root.findByProps({
      testID: `worksheet-row-${mockWorksheets[0].id}`,
    });
    act(() => {
      row.props.onPress();
    });

    const router = __getRouter();
    expect(router.push).toHaveBeenCalledTimes(1);
    const arg = router.push.mock.calls[0][0];
    expect(arg.pathname).toBe("/auth");
    expect(arg.params.mode).toBe("register");
    expect(arg.params.redirectTo).toBe(
      `/(tabs)/(home)/worksheets/${mockWorksheets[0].id}`,
    );
    // Subscribe paywall must not fire for anonymous users — they have not
    // had a chance to consume their free worksheet yet.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("uses the tapped row's id in redirectTo (not a hard-coded value)", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });

    const row = renderer.root.findByProps({
      testID: `worksheet-row-${mockWorksheets[1].id}`,
    });
    act(() => {
      row.props.onPress();
    });

    const router = __getRouter();
    const arg = router.push.mock.calls[0][0];
    expect(arg.params.redirectTo).toBe(
      `/(tabs)/(home)/worksheets/${mockWorksheets[1].id}`,
    );
  });
});

describe("Worksheet detail — anonymous deep-link guard", () => {
  it("replaces to /auth with mode=register and a redirectTo when an anonymous user lands on the detail screen", () => {
    __setSearchParams({ id: mockWorksheets[0].id });

    act(() => {
      TestRenderer.create(<WorksheetDetailScreen />);
    });

    const router = __getRouter();
    expect(router.replace).toHaveBeenCalled();
    const arg = router.replace.mock.calls[0][0];
    expect(arg.pathname).toBe("/auth");
    expect(arg.params.mode).toBe("register");
    expect(arg.params.redirectTo).toBe(
      `/(tabs)/(home)/worksheets/${mockWorksheets[0].id}`,
    );
  });
});
