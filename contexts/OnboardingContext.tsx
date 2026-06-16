import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeLogout } from "@/src/lib/logoutBus";
import type { QuizResult } from "@/src/data/quiz";
import type { WorksheetDelta } from "@/src/onboarding/worksheetDelta";

const ONBOARDING_KEY = "hasSeenOnboarding";
const QUIZ_RESULT_KEY = "quizResult";
const QUIZ_ANSWERS_KEY = "quizAnswers";
const SKIP_BANNER_KEY = "skipBannerCount";
const SKIPPED_ACCOUNT_KEY = "skippedAccount";
// Quiz-derived attributes written from the result screen. They are part of the
// quiz footprint, so clearForRetake must remove them too — otherwise a stale
// top country / first name / completed flag lingers after a "start fresh".
const USER_TOP_COUNTRY_KEY = "user_top_country";
const USER_FIRST_NAME_KEY = "user_first_name";
const USER_QUIZ_COMPLETED_KEY = "user_quiz_completed";

export type PersistedQuizAnswers = Record<number, string>;

interface OnboardingContextValue {
  hasSeenOnboarding: boolean | null;
  quizResult: QuizResult | null;
  quizAnswers: PersistedQuizAnswers | null;
  skippedAccount: boolean;
  skipBannerCount: number;
  completeOnboarding: (
    result: QuizResult,
    skippedAccount?: boolean,
    answers?: PersistedQuizAnswers,
  ) => Promise<void>;
  skipOnboarding: () => Promise<void>;
  saveQuizResult: (result: QuizResult, answers?: PersistedQuizAnswers) => Promise<void>;
  dismissBanner: () => Promise<void>;
  clearForRetake: () => Promise<void>;
  markAccountCreated: () => Promise<void>;
  shouldShowBanner: boolean;
  pendingWorksheetDelta: WorksheetDelta | null;
  setPendingWorksheetDelta: (d: WorksheetDelta | null) => void;
  clearPendingWorksheetDelta: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<PersistedQuizAnswers | null>(null);
  const [skippedAccount, setSkippedAccount] = useState(false);
  const [skipBannerCount, setSkipBannerCount] = useState(0);
  const [pendingWorksheetDelta, setPendingWorksheetDeltaState] =
    useState<WorksheetDelta | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [seen, resultStr, answersStr, skipped, bannerCount] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(QUIZ_RESULT_KEY),
          AsyncStorage.getItem(QUIZ_ANSWERS_KEY),
          AsyncStorage.getItem(SKIPPED_ACCOUNT_KEY),
          AsyncStorage.getItem(SKIP_BANNER_KEY),
        ]);
        setHasSeenOnboarding(seen === "true");
        if (resultStr) {
          try { setQuizResult(JSON.parse(resultStr)); } catch {}
        }
        if (answersStr) {
          try { setQuizAnswers(JSON.parse(answersStr)); } catch {}
        }
        setSkippedAccount(skipped === "true");
        setSkipBannerCount(bannerCount ? parseInt(bannerCount, 10) : 0);
      } catch {
        setHasSeenOnboarding(false);
      }
    })();
  }, []);

  const completeOnboarding = useCallback(
    async (result: QuizResult, skipped = false, answers?: PersistedQuizAnswers) => {
      await AsyncStorage.setItem(ONBOARDING_KEY, "true");
      await AsyncStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
      if (answers) {
        await AsyncStorage.setItem(QUIZ_ANSWERS_KEY, JSON.stringify(answers));
        setQuizAnswers(answers);
      }
      if (skipped) {
        await AsyncStorage.setItem(SKIPPED_ACCOUNT_KEY, "true");
      }
      setHasSeenOnboarding(true);
      setQuizResult(result);
      setSkippedAccount(skipped);
    },
    [],
  );

  const skipOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    setHasSeenOnboarding(true);
  }, []);

  const saveQuizResult = useCallback(
    async (result: QuizResult, answers?: PersistedQuizAnswers) => {
      await AsyncStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
      if (answers) {
        await AsyncStorage.setItem(QUIZ_ANSWERS_KEY, JSON.stringify(answers));
        setQuizAnswers(answers);
      }
      setQuizResult(result);
    },
    [],
  );

  const dismissBanner = useCallback(async () => {
    const next = skipBannerCount + 1;
    await AsyncStorage.setItem(SKIP_BANNER_KEY, String(next));
    setSkipBannerCount(next);
  }, [skipBannerCount]);

  // Reset in-memory onboarding/quiz state when the user signs out.
  // AsyncStorage for these keys is wiped separately by AuthContext via
  // clearLocalDataIfSignedOut.
  useEffect(() => {
    return subscribeLogout(() => {
      setHasSeenOnboarding(false);
      setQuizResult(null);
      setQuizAnswers(null);
      setSkippedAccount(false);
      setSkipBannerCount(0);
      setPendingWorksheetDeltaState(null);
    });
  }, []);

  const clearForRetake = useCallback(async () => {
    // Clear the COMPLETE quiz footprint so a retake starts truly fresh:
    // quizResult, quizAnswers, hasSeenOnboarding, plus the three quiz-derived
    // attribute keys written by the result screen.
    await AsyncStorage.multiRemove([
      QUIZ_RESULT_KEY,
      QUIZ_ANSWERS_KEY,
      ONBOARDING_KEY,
      USER_TOP_COUNTRY_KEY,
      USER_FIRST_NAME_KEY,
      USER_QUIZ_COMPLETED_KEY,
    ]);
    setQuizResult(null);
    setQuizAnswers(null);
    setHasSeenOnboarding(false);
  }, []);

  const markAccountCreated = useCallback(async () => {
    await AsyncStorage.removeItem(SKIPPED_ACCOUNT_KEY);
    setSkippedAccount(false);
  }, []);

  const shouldShowBanner = skippedAccount && skipBannerCount < 3;

  const setPendingWorksheetDelta = useCallback((d: WorksheetDelta | null) => {
    setPendingWorksheetDeltaState(d);
  }, []);
  const clearPendingWorksheetDelta = useCallback(() => {
    setPendingWorksheetDeltaState(null);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      hasSeenOnboarding,
      quizResult,
      quizAnswers,
      skippedAccount,
      skipBannerCount,
      completeOnboarding,
      skipOnboarding,
      saveQuizResult,
      dismissBanner,
      clearForRetake,
      markAccountCreated,
      shouldShowBanner,
      pendingWorksheetDelta,
      setPendingWorksheetDelta,
      clearPendingWorksheetDelta,
    }),
    [hasSeenOnboarding, quizResult, quizAnswers, skippedAccount, skipBannerCount, completeOnboarding, skipOnboarding, saveQuizResult, dismissBanner, clearForRetake, markAccountCreated, shouldShowBanner, pendingWorksheetDelta, setPendingWorksheetDelta, clearPendingWorksheetDelta]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
