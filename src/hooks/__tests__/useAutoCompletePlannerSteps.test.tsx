import React from "react";
import { act, render } from "@testing-library/react";

import {
  useAutoCompletePlannerSteps,
  type AutoCompleteSetStep,
  type UseAutoCompletePlannerStepsOptions,
} from "../useAutoCompletePlannerSteps";

type HookProps = Omit<
  UseAutoCompletePlannerStepsOptions,
  "isStepComplete" | "setStep"
> & {
  isStepComplete: (id: string) => boolean;
  setStep: AutoCompleteSetStep;
};

function HookHarness(props: HookProps) {
  useAutoCompletePlannerSteps(props);
  return null;
}

function baseProps(
  overrides: Partial<HookProps> = {},
): HookProps {
  return {
    countrySlug: "portugal",
    isPaidUser: true,
    isReady: true,
    progressLoading: false,
    hasPlanForThisCountry: true,
    quizResult: null,
    bookmarkCount: 0,
    isStepComplete: () => false,
    setStep: jest.fn(),
    ...overrides,
  };
}

describe("useAutoCompletePlannerSteps", () => {
  it("auto-completes research_quiz exactly once when quizResult is present", () => {
    const setStep = jest.fn<
      void,
      Parameters<AutoCompleteSetStep>
    >((_id, _completed, opts) => {
      opts?.onSuccess?.();
    });
    const props = baseProps({
      quizResult: { score: 12 },
      bookmarkCount: 0,
      setStep,
    });
    const { rerender } = render(<HookHarness {...props} />);

    const quizCalls = setStep.mock.calls.filter(
      ([id]) => id === "research_quiz",
    );
    expect(quizCalls).toHaveLength(1);
    expect(quizCalls[0][1]).toBe(true);

    // Re-render with the same inputs — should NOT fire again.
    act(() => {
      rerender(<HookHarness {...props} />);
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "research_quiz"),
    ).toHaveLength(1);

    // Even an unrelated input change should not re-fire it.
    act(() => {
      rerender(<HookHarness {...baseProps({ ...props, bookmarkCount: 1 })} />);
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "research_quiz"),
    ).toHaveLength(1);
  });

  it("auto-completes shortlist_built exactly once when bookmarkCount >= 2", () => {
    const setStep = jest.fn<
      void,
      Parameters<AutoCompleteSetStep>
    >((_id, _completed, opts) => {
      opts?.onSuccess?.();
    });
    const props = baseProps({ bookmarkCount: 2, setStep });
    const { rerender } = render(<HookHarness {...props} />);

    const shortlistCalls = setStep.mock.calls.filter(
      ([id]) => id === "shortlist_built",
    );
    expect(shortlistCalls).toHaveLength(1);
    expect(shortlistCalls[0][1]).toBe(true);

    // Re-render with a higher bookmarkCount — must not re-fire.
    act(() => {
      rerender(<HookHarness {...baseProps({ ...props, bookmarkCount: 5 })} />);
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
    ).toHaveLength(1);
  });

  it("does not auto-complete shortlist_built when bookmarkCount is below the threshold", () => {
    const setStep = jest.fn();
    render(<HookHarness {...baseProps({ bookmarkCount: 1, setStep })} />);
    expect(
      setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
    ).toHaveLength(0);
  });

  it("does not auto-complete research_quiz when no quizResult is available", () => {
    const setStep = jest.fn();
    render(<HookHarness {...baseProps({ quizResult: null, setStep })} />);
    expect(
      setStep.mock.calls.filter(([id]) => id === "research_quiz"),
    ).toHaveLength(0);
  });

  it("skips already-completed steps", () => {
    const setStep = jest.fn();
    const isStepComplete = (id: string) =>
      id === "research_quiz" || id === "shortlist_built";
    render(
      <HookHarness
        {...baseProps({
          quizResult: { score: 1 },
          bookmarkCount: 4,
          isStepComplete,
          setStep,
        })}
      />,
    );
    expect(setStep).not.toHaveBeenCalled();
  });

  it("does nothing when the user is unpaid, the data is loading, or the plan is for a different country", () => {
    const setStepUnpaid = jest.fn();
    render(
      <HookHarness
        {...baseProps({
          isPaidUser: false,
          quizResult: { score: 1 },
          bookmarkCount: 5,
          setStep: setStepUnpaid,
        })}
      />,
    );
    expect(setStepUnpaid).not.toHaveBeenCalled();

    const setStepLoading = jest.fn();
    render(
      <HookHarness
        {...baseProps({
          progressLoading: true,
          quizResult: { score: 1 },
          bookmarkCount: 5,
          setStep: setStepLoading,
        })}
      />,
    );
    expect(setStepLoading).not.toHaveBeenCalled();

    const setStepWrongCountry = jest.fn();
    render(
      <HookHarness
        {...baseProps({
          hasPlanForThisCountry: false,
          quizResult: { score: 1 },
          bookmarkCount: 5,
          setStep: setStepWrongCountry,
        })}
      />,
    );
    expect(setStepWrongCountry).not.toHaveBeenCalled();
  });

  it("auto-completes both steps in a single render when both conditions are met", () => {
    const setStep = jest.fn<
      void,
      Parameters<AutoCompleteSetStep>
    >((_id, _completed, opts) => {
      opts?.onSuccess?.();
    });
    const props = baseProps({
      quizResult: { score: 1 },
      bookmarkCount: 2,
      setStep,
    });
    const { rerender } = render(<HookHarness {...props} />);

    expect(
      setStep.mock.calls.filter(([id]) => id === "research_quiz"),
    ).toHaveLength(1);
    expect(
      setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
    ).toHaveLength(1);

    // Re-rendering with the same inputs must not re-fire either step.
    act(() => {
      rerender(<HookHarness {...props} />);
    });
    expect(setStep).toHaveBeenCalledTimes(2);
  });
});
