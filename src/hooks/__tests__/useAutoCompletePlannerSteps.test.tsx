import React from "react";
import { act, render, waitFor } from "@testing-library/react";

import AsyncStorage from "@react-native-async-storage/async-storage";

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

beforeEach(() => {
  (AsyncStorage as any).__reset();
});

describe("useAutoCompletePlannerSteps", () => {
  it("auto-completes research_quiz exactly once when quizResult is present", async () => {
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

    await waitFor(() => {
      expect(
        setStep.mock.calls.filter(([id]) => id === "research_quiz"),
      ).toHaveLength(1);
    });
    const quizCalls = setStep.mock.calls.filter(
      ([id]) => id === "research_quiz",
    );
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

  it("auto-completes shortlist_built exactly once when bookmarkCount >= 2", async () => {
    const setStep = jest.fn<
      void,
      Parameters<AutoCompleteSetStep>
    >((_id, _completed, opts) => {
      opts?.onSuccess?.();
    });
    const props = baseProps({ bookmarkCount: 2, setStep });
    const { rerender } = render(<HookHarness {...props} />);

    await waitFor(() => {
      expect(
        setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
      ).toHaveLength(1);
    });
    const shortlistCalls = setStep.mock.calls.filter(
      ([id]) => id === "shortlist_built",
    );
    expect(shortlistCalls[0][1]).toBe(true);

    // Re-render with a higher bookmarkCount — must not re-fire.
    act(() => {
      rerender(<HookHarness {...baseProps({ ...props, bookmarkCount: 5 })} />);
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
    ).toHaveLength(1);
  });

  it("does not auto-complete shortlist_built when bookmarkCount is below the threshold", async () => {
    const setStep = jest.fn();
    render(<HookHarness {...baseProps({ bookmarkCount: 1, setStep })} />);
    // Let any pending hydration / effects flush.
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "shortlist_built"),
    ).toHaveLength(0);
  });

  it("does not auto-complete research_quiz when no quizResult is available", async () => {
    const setStep = jest.fn();
    render(<HookHarness {...baseProps({ quizResult: null, setStep })} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      setStep.mock.calls.filter(([id]) => id === "research_quiz"),
    ).toHaveLength(0);
  });

  it("skips already-completed steps", async () => {
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
    await act(async () => {
      await Promise.resolve();
    });
    expect(setStep).not.toHaveBeenCalled();
  });

  it("does nothing when the user is unpaid, the data is loading, or the plan is for a different country", async () => {
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
    await act(async () => {
      await Promise.resolve();
    });
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
    await act(async () => {
      await Promise.resolve();
    });
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
    await act(async () => {
      await Promise.resolve();
    });
    expect(setStepWrongCountry).not.toHaveBeenCalled();
  });

  it("auto-completes both steps after hydration when both conditions are met", async () => {
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

    await waitFor(() => {
      expect(setStep).toHaveBeenCalledTimes(2);
    });
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

  it("does NOT re-auto-complete a step on remount after the user has unchecked it (persisted across mounts)", async () => {
    // First mount: auto-complete fires and persists flag to AsyncStorage.
    const firstSetStep = jest.fn<
      void,
      Parameters<AutoCompleteSetStep>
    >((_id, _completed, opts) => {
      opts?.onSuccess?.();
    });
    const { unmount } = render(
      <HookHarness
        {...baseProps({ quizResult: { score: 1 }, setStep: firstSetStep })}
      />,
    );
    await waitFor(() => {
      expect(firstSetStep).toHaveBeenCalledWith(
        "research_quiz",
        true,
        expect.anything(),
      );
    });
    unmount();

    // Simulate user having later unchecked the step manually: isStepComplete
    // returns false, but the per-(country, step) flag is set in AsyncStorage.
    const secondSetStep = jest.fn();
    render(
      <HookHarness
        {...baseProps({
          quizResult: { score: 1 },
          isStepComplete: () => false,
          setStep: secondSetStep,
        })}
      />,
    );
    // Allow hydration + effects to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(secondSetStep).not.toHaveBeenCalled();
  });
});
