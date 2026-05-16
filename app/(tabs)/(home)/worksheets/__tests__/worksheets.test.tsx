/**
 * Screen-level tests for the worksheets free-tier gate (task #80):
 *
 *  - List screen: a free user with 0 responses sees no Pro pills and can
 *    open any row directly (no /subscribe redirect).
 *  - List screen: a free user with 1 response sees Pro pills on the OTHER
 *    rows; tapping a locked row routes to /subscribe with the
 *    worksheet_list entry-point parameters.
 *  - Detail screen: a free user with 1 prior response on a DIFFERENT
 *    worksheet is redirected at open time (router.replace → /subscribe).
 *  - Detail screen: a free user can still open AND re-submit their
 *    already-completed worksheet (no redirect; mutation invoked on submit).
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);

// ── Subscription / Auth mocks ─────────────────────────────────────────────
let mockHasFullAccess = false;
jest.mock("@/contexts/SubscriptionContext", () => ({
  useSubscription: () => ({ hasFullAccess: mockHasFullAccess }),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, email: "ada@example.com" }, token: "tok" }),
}));

// ── Worksheet hook mocks ─────────────────────────────────────────────────
type Resp = { worksheetId: string; questionId: number; answers: any; dimensionScore: number };
let mockWorksheets: Array<{ id: string; questionId: number; dimension: string; title: string; description: string }> = [];
let mockResponses: Resp[] = [];
const mockMutateAsync = jest.fn(async () => ({ ok: true }));

jest.mock("@/src/hooks/usePendingWorksheetDelta", () => ({
  usePendingWorksheetDelta: () => ({ activeDelta: null, dismiss: jest.fn() }),
}));

jest.mock("@/src/components/WorksheetDeltaBanner", () => ({
  WorksheetDeltaBanner: () => null,
}));

jest.mock("@/src/hooks/useWorksheets", () => ({
  useWorksheetList: () => ({ data: mockWorksheets, isLoading: false }),
  useWorksheetResponses: () => ({ data: mockResponses }),
  useWorksheetResponse: (id: string | null | undefined) => {
    return mockResponses.find((r) => r.worksheetId === id) ?? null;
  },
  useSubmitWorksheet: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  __resetRouter,
  __getRouter,
  __setSearchParams,
} from "@/src/__test-mocks__/expo-router";
import { WORKSHEETS } from "@/src/data/worksheets";

import WorksheetsListScreen from "../index";
import WorksheetDetailScreen from "../[id]";

function findByTestID(root: any, testID: string) {
  return root.findAll(
    (n: any) => n.props?.testID === testID,
  );
}

function collectText(root: any): string {
  return root
    .findAllByType("Text")
    .map((t: any) => {
      const c = t.props?.children;
      if (c == null) return "";
      if (Array.isArray(c)) return c.map((x: any) => (x == null ? "" : String(x))).join("");
      return String(c);
    })
    .join(" | ");
}

beforeEach(() => {
  __resetRouter();
  mockHasFullAccess = false;
  // The list screen reads metadata only — use the canonical 8 worksheets.
  mockWorksheets = WORKSHEETS.map(({ questions, ...rest }) => rest);
  mockResponses = [];
  mockMutateAsync.mockClear();
  mockMutateAsync.mockResolvedValue({ ok: true });
});

describe("WorksheetsListScreen — free-tier gate", () => {
  it("free user with 0 responses: every row is openable, no Pro pills, no redirect", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });
    // No "Pro" pills on any row.
    for (const w of mockWorksheets) {
      expect(findByTestID(renderer.root, `worksheet-pro-${w.id}`)).toHaveLength(0);
    }
    // Tapping the first row navigates straight to the detail screen.
    const first = mockWorksheets[0];
    const row = findByTestID(renderer.root, `worksheet-row-${first.id}`)[0];
    act(() => {
      row.props.onPress();
    });
    const router = __getRouter();
    expect(router.push).toHaveBeenCalledTimes(1);
    const call = router.push.mock.calls[0][0];
    expect(call.pathname).toBe("/(tabs)/(home)/worksheets/[id]");
    expect(call.params).toEqual({ id: first.id });
  });

  it("free user with 1 response: OTHER rows show Pro pills and route to /subscribe with the worksheet_list entry point", () => {
    const completed = mockWorksheets[0];
    const otherRow = mockWorksheets[1];
    mockResponses = [
      { worksheetId: completed.id, questionId: completed.questionId, answers: {}, dimensionScore: 2 },
    ];

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });

    // Completed row: no Pro pill (it's done).
    expect(findByTestID(renderer.root, `worksheet-pro-${completed.id}`)).toHaveLength(0);
    // Other rows: Pro pill present.
    expect(findByTestID(renderer.root, `worksheet-pro-${otherRow.id}`).length).toBeGreaterThan(0);

    // Tapping a locked row redirects to /subscribe with the expected
    // entryPoint + redirectTo so the paywall surface is attributable.
    const row = findByTestID(renderer.root, `worksheet-row-${otherRow.id}`)[0];
    act(() => {
      row.props.onPress();
    });
    const router = __getRouter();
    expect(router.push).toHaveBeenCalledTimes(1);
    const call = router.push.mock.calls[0][0];
    expect(call.pathname).toBe("/subscribe");
    expect(call.params.entryPoint).toBe("worksheet_list");
    expect(call.params.redirectTo).toBe(
      `/(tabs)/(home)/worksheets/${otherRow.id}`,
    );
    expect(typeof call.params.unlockLabel).toBe("string");
  });

  it("free user with 1 response: tapping the COMPLETED row opens it directly (editing path)", () => {
    const completed = mockWorksheets[0];
    mockResponses = [
      { worksheetId: completed.id, questionId: completed.questionId, answers: {}, dimensionScore: 2 },
    ];
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });
    const row = findByTestID(renderer.root, `worksheet-row-${completed.id}`)[0];
    act(() => {
      row.props.onPress();
    });
    const router = __getRouter();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push.mock.calls[0][0].pathname).toBe(
      "/(tabs)/(home)/worksheets/[id]",
    );
  });

  it("entitled user: NO row is locked regardless of completion count", () => {
    mockHasFullAccess = true;
    mockResponses = [
      {
        worksheetId: mockWorksheets[0].id,
        questionId: mockWorksheets[0].questionId,
        answers: {},
        dimensionScore: 2,
      },
    ];
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetsListScreen />);
    });
    for (const w of mockWorksheets) {
      expect(findByTestID(renderer.root, `worksheet-pro-${w.id}`)).toHaveLength(0);
    }
  });
});

describe("WorksheetDetailScreen — free-tier gate", () => {
  it("free user with 1 prior response on a DIFFERENT worksheet is redirected to /subscribe on open", () => {
    const target = WORKSHEETS[0];
    const other = WORKSHEETS[1];
    mockResponses = [
      { worksheetId: other.id, questionId: other.questionId, answers: {}, dimensionScore: 2 },
    ];
    __setSearchParams({ id: target.id });

    act(() => {
      TestRenderer.create(<WorksheetDetailScreen />);
    });

    const router = __getRouter();
    expect(router.replace).toHaveBeenCalledTimes(1);
    const call = router.replace.mock.calls[0][0];
    expect(call.pathname).toBe("/subscribe");
    expect(call.params.entryPoint).toBe("worksheet_detail");
    expect(call.params.redirectTo).toBe(
      `/(tabs)/(home)/worksheets/${target.id}`,
    );
  });

  it("free user with 0 responses can open any worksheet (no redirect)", () => {
    const target = WORKSHEETS[0];
    mockResponses = [];
    __setSearchParams({ id: target.id });

    act(() => {
      TestRenderer.create(<WorksheetDetailScreen />);
    });

    const router = __getRouter();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("free user editing their already-completed worksheet: no redirect, submit goes through", async () => {
    const target = WORKSHEETS[0];
    mockResponses = [
      {
        worksheetId: target.id,
        questionId: target.questionId,
        // Pre-fill answers so the submit button is enabled without
        // simulating taps on every question.
        answers: Object.fromEntries(
          target.questions.map((q) => [
            q.id,
            q.type === "scale" ? 3 : (q.options?.[0].value ?? ""),
          ]),
        ),
        dimensionScore: 2,
      },
    ];
    __setSearchParams({ id: target.id });

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<WorksheetDetailScreen />);
    });

    const router = __getRouter();
    expect(router.replace).not.toHaveBeenCalled();

    // Submit button is rendered with testID="worksheet-submit". Tap it
    // and verify the submit mutation was invoked with our worksheet id.
    const submitBtn = findByTestID(renderer.root, "worksheet-submit")[0];
    expect(submitBtn).toBeDefined();
    await act(async () => {
      await submitBtn.props.onPress();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const calls = mockMutateAsync.mock.calls as any[];
    expect((calls[0] as any[])[0].worksheetId).toBe(target.id);
  });

  it("entitled user with 1 prior response on a different worksheet: NO redirect", () => {
    mockHasFullAccess = true;
    const target = WORKSHEETS[0];
    const other = WORKSHEETS[1];
    mockResponses = [
      { worksheetId: other.id, questionId: other.questionId, answers: {}, dimensionScore: 2 },
    ];
    __setSearchParams({ id: target.id });

    act(() => {
      TestRenderer.create(<WorksheetDetailScreen />);
    });

    const router = __getRouter();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
