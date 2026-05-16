import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// Per-(country, step) flag set the FIRST time we auto-complete a step.
// Once set, the step will never be auto-completed again for that country,
// even on remount — so a user's manual uncheck is not overwritten.
function autoCompletedKey(country: string, stepId: string): string {
  return `planner:autoCompletedOnce:${country}:${stepId}`;
}

async function readAutoCompletedFlag(
  country: string,
  stepId: string,
): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(autoCompletedKey(country, stepId));
    return v === "1";
  } catch {
    return false;
  }
}

async function writeAutoCompletedFlag(
  country: string,
  stepId: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(autoCompletedKey(country, stepId), "1");
  } catch {
    /* best effort */
  }
}

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
  // Country token so stale in-flight mutation callbacks from a previous
  // country cannot mutate refs / write storage for the new active country.
  const activeCountryRef = useRef<string>(countrySlug);
  // hydratedFor is the country whose flags have been loaded from AsyncStorage.
  // Auto-complete is gated until hydratedFor === countrySlug.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Reset per-mount refs whenever the active country changes, and re-hydrate.
  useEffect(() => {
    activeCountryRef.current = countrySlug;
    autoMarkingQuiz.current = false;
    autoMarkedQuiz.current = false;
    autoMarkingShortlist.current = false;
    autoMarkedShortlist.current = false;
    setHydratedFor(null);

    if (!countrySlug) return;
    let cancelled = false;
    (async () => {
      const [quizDone, shortlistDone] = await Promise.all([
        readAutoCompletedFlag(countrySlug, "research_quiz"),
        readAutoCompletedFlag(countrySlug, "shortlist_built"),
      ]);
      // Discard stale hydration results if the active country has changed
      // while we were awaiting AsyncStorage.
      if (cancelled || activeCountryRef.current !== countrySlug) return;
      if (quizDone) autoMarkedQuiz.current = true;
      if (shortlistDone) autoMarkedShortlist.current = true;
      setHydratedFor(countrySlug);
    })();
    return () => {
      cancelled = true;
    };
  }, [countrySlug]);

  useEffect(() => {
    if (!isPaidUser || !isReady || progressLoading || !hasPlanForThisCountry) {
      return;
    }
    // Gate behind AsyncStorage hydration so we cannot re-auto-mark before
    // we know whether this step has been auto-completed before.
    if (hydratedFor !== countrySlug) return;

    const country = countrySlug;

    if (
      !autoMarkedQuiz.current &&
      !autoMarkingQuiz.current &&
      quizResult &&
      !isStepComplete("research_quiz")
    ) {
      autoMarkingQuiz.current = true;
      setStep("research_quiz", true, {
        onSuccess: () => {
          // Ignore success if the user has switched country mid-flight.
          if (activeCountryRef.current !== country) return;
          autoMarkedQuiz.current = true;
          autoMarkingQuiz.current = false;
          void writeAutoCompletedFlag(country, "research_quiz");
        },
        onError: () => {
          if (activeCountryRef.current !== country) return;
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
          if (activeCountryRef.current !== country) return;
          autoMarkedShortlist.current = true;
          autoMarkingShortlist.current = false;
          void writeAutoCompletedFlag(country, "shortlist_built");
        },
        onError: () => {
          if (activeCountryRef.current !== country) return;
          autoMarkingShortlist.current = false;
        },
      });
    }
  }, [
    countrySlug,
    hydratedFor,
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
