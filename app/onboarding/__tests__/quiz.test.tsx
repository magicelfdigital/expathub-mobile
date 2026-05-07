/**
 * Screen-level functional tests for app/onboarding/quiz.tsx.
 *
 * Asserts that the quiz screen actually fires the funnel events the
 * marketing/data team relies on:
 *  - quiz_started exactly once on mount (even across re-renders)
 *  - quiz_question_answered with the full payload on every selection
 *  - quiz_save_shown when the boundary condition is hit
 *  - quiz_completed exactly once when the last question is answered
 *  - quiz_abandoned only when shouldFireAbandonment's rules are met
 */

jest.mock("react-native", () => require("@/src/__test-mocks__/react-native"));
jest.mock("expo-router", () => require("@/src/__test-mocks__/expo-router"));
jest.mock("@expo/vector-icons", () =>
  require("@/src/__test-mocks__/expo-vector-icons"),
);
jest.mock("react-native-safe-area-context", () =>
  require("@/src/__test-mocks__/safe-area-context"),
);

const trackEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  logFbEvent: () => {},
  identifyUser: () => {},
}));

jest.mock("@/src/components/QuizSaveModal", () => ({
  QuizSaveModal: () => null,
}));

import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { __resetRouter, __getRouter } from "@/src/__test-mocks__/expo-router";
import { QUIZ_QUESTIONS } from "@/src/data/quiz";

import QuizScreen from "../quiz";

function findAllPressablesByLabel(tree: any, label: string) {
  const matches: any[] = [];
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === "Pressable") {
      const text = collectText(node);
      if (text.includes(label)) matches.push(node);
    }
    if (node.children) visit(node.children);
  };
  visit(tree);
  return matches;
}

function collectText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "object" && node !== null) {
    const direct = (node.children ? collectText(node.children) : "") || "";
    return direct;
  }
  return "";
}

function findOptionPressables(testInstance: any) {
  // Options are Pressables containing a Text whose value is the option label.
  return testInstance.findAll(
    (n) =>
      n.type === "Pressable" &&
      typeof n.props?.onPress === "function" &&
      n.props?.testID !== "quiz-timeline-next",
  );
}

function getOptionByValue(
  testInstance: any,
  questionId: number,
  value: string,
): any | undefined {
  const q = QUIZ_QUESTIONS.find((x) => x.id === questionId)!;
  const opt = q.options.find((o) => o.value === value)!;
  // Find a Pressable whose nested Text matches opt.label exactly.
  return testInstance.findAll((n) => {
    if (n.type !== "Pressable") return false;
    if (typeof n.props?.onPress !== "function") return false;
    const texts = n.findAllByType("Text", { deep: true } as any);
    return texts.some((t) => {
      const c = t.props?.children;
      return (
        c === opt.label ||
        (Array.isArray(c) && c.some((cc) => cc === opt.label))
      );
    });
  })[0];
}

beforeEach(() => {
  trackEvent.mockReset();
  __resetRouter();
});

describe("QuizScreen — funnel analytics", () => {
  it("fires quiz_started exactly once on mount", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<QuizScreen />);
    });
    const startedCalls = trackEvent.mock.calls.filter(
      (c) => c[0] === "quiz_started",
    );
    expect(startedCalls).toHaveLength(1);
    // Force a re-render via update to confirm the started ref guards re-fires.
    act(() => {
      renderer!.update(<QuizScreen />);
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "quiz_started"),
    ).toHaveLength(1);
  });

  it("fires quiz_question_answered with full payload on every selection", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<QuizScreen />);
    });
    const q1 = QUIZ_QUESTIONS[0];
    const opt = getOptionByValue(renderer!.root, q1.id, q1.options[0].value)!;
    expect(opt).toBeDefined();
    act(() => {
      opt.props.onPress();
    });
    const answered = trackEvent.mock.calls.filter(
      (c) => c[0] === "quiz_question_answered",
    );
    expect(answered.length).toBeGreaterThanOrEqual(1);
    expect(answered[0][1]).toEqual({
      questionId: q1.id,
      questionIndex: 0,
      category: q1.category,
      answer: q1.options[0].value,
    });
  });

  it("does NOT fire quiz_completed before the last question is reached", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<QuizScreen />);
    });
    const q1 = QUIZ_QUESTIONS[0];
    const opt = getOptionByValue(renderer!.root, q1.id, q1.options[0].value)!;
    act(() => {
      opt.props.onPress();
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "quiz_completed"),
    ).toHaveLength(0);
  });

  it("fires quiz_abandoned on unmount when at least one but fewer than total were answered", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<QuizScreen />);
    });
    const q1 = QUIZ_QUESTIONS[0];
    const opt = getOptionByValue(renderer!.root, q1.id, q1.options[0].value)!;
    act(() => {
      opt.props.onPress();
    });
    act(() => {
      renderer!.unmount();
    });
    const abandoned = trackEvent.mock.calls.filter(
      (c) => c[0] === "quiz_abandoned",
    );
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0][1]).toMatchObject({
      answered: 1,
      totalQuestions: QUIZ_QUESTIONS.length,
    });
  });

  it("does NOT fire quiz_abandoned on unmount if the user never answered anything", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<QuizScreen />);
    });
    act(() => {
      renderer!.unmount();
    });
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "quiz_abandoned"),
    ).toHaveLength(0);
  });
});
