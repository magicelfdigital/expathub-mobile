import { useEffect, useRef } from "react";

export type AutoCompleteSetStep = (
  stepId: string,
  completed: boolean,
  options?: { onSuccess?: () => void; onError?: () => void },
) => void;

export type UseAutoCompletePlannerStepsOptions = {
  countrySlug: string;
  isPaidUser: boolean;
  isReady: boolean;
  progressLoading: boolean;
  hasPlanForThisCountry: boolean;
  quizResult: unknown;
  bookmarkCount: number;
  isStepComplete: (stepId: string) => boolean;
  setStep: AutoCompleteSetStep;
};

export function useAutoCompletePlannerSteps({
  countrySlug,
  isPaidUser,
  isReady,
  progressLoading,
  hasPlanForThisCountry,
  quizResult,
  bookmarkCount,
  isStepComplete,
  setStep,
}: UseAutoCompletePlannerStepsOptions): void {
  const autoMarkingQuiz = useRef(false);
  const autoMarkedQuiz = useRef(false);
  const autoMarkingShortlist = useRef(false);
  const autoMarkedShortlist = useRef(false);
  const lastAutoCountry = useRef<string | null>(null);

  useEffect(() => {
    if (lastAutoCountry.current !== countrySlug) {
      lastAutoCountry.current = countrySlug;
      autoMarkingQuiz.current = false;
      autoMarkedQuiz.current = false;
      autoMarkingShortlist.current = false;
      autoMarkedShortlist.current = false;
    }
  }, [countrySlug]);

  useEffect(() => {
    if (!isPaidUser || !isReady || progressLoading || !hasPlanForThisCountry) {
      return;
    }
    if (
      !autoMarkedQuiz.current &&
      !autoMarkingQuiz.current &&
      quizResult &&
      !isStepComplete("research_quiz")
    ) {
      autoMarkingQuiz.current = true;
      setStep("research_quiz", true, {
        onSuccess: () => {
          autoMarkedQuiz.current = true;
          autoMarkingQuiz.current = false;
        },
        onError: () => {
          autoMarkingQuiz.current = false;
        },
      });
    }
    if (
      !autoMarkedShortlist.current &&
      !autoMarkingShortlist.current &&
      bookmarkCount >= 2 &&
      !isStepComplete("shortlist_built")
    ) {
      autoMarkingShortlist.current = true;
      setStep("shortlist_built", true, {
        onSuccess: () => {
          autoMarkedShortlist.current = true;
          autoMarkingShortlist.current = false;
        },
        onError: () => {
          autoMarkingShortlist.current = false;
        },
      });
    }
  }, [
    isPaidUser,
    isReady,
    progressLoading,
    hasPlanForThisCountry,
    quizResult,
    bookmarkCount,
    isStepComplete,
    setStep,
  ]);
}
