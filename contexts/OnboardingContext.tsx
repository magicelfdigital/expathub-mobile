import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QuizResult } from "@/src/data/quiz";

const ONBOARDING_KEY = "hasSeenOnboarding";
const QUIZ_RESULT_KEY = "quizResult";
const SKIP_BANNER_KEY = "skipBannerCount";
const SKIPPED_ACCOUNT_KEY = "skippedAccount";

interface OnboardingContextValue {
  hasSeenOnboarding: boolean | null;
  quizResult: QuizResult | null;
  skippedAccount: boolean;
  skipBannerCount: number;
  completeOnboarding: (result: QuizResult, skippedAccount?: boolean) => Promise<void>;
  saveQuizResult: (result: QuizResult) => Promise<void>;
  dismissBanner: () => Promise<void>;
  clearForRetake: () => Promise<void>;
  markAccountCreated: () => Promise<void>;
  shouldShowBanner: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [skippedAccount, setSkippedAccount] = useState(false);
  const [skipBannerCount, setSkipBannerCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [seen, resultStr, skipped, bannerCount] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(QUIZ_RESULT_KEY),
          AsyncStorage.getItem(SKIPPED_ACCOUNT_KEY),
          AsyncStorage.getItem(SKIP_BANNER_KEY),
        ]);
        setHasSeenOnboarding(seen === "true");
        if (resultStr) {
          try { setQuizResult(JSON.parse(resultStr)); } catch {}
        }
        setSkippedAccount(skipped === "true");
        setSkipBannerCount(bannerCount ? parseInt(bannerCount, 10) : 0);
      } catch {
        setHasSeenOnboarding(false);
      }
    })();
  }, []);

  const completeOnboarding = useCallback(async (result: QuizResult, skipped = false) => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    await AsyncStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
    if (skipped) {
      await AsyncStorage.setItem(SKIPPED_ACCOUNT_KEY, "true");
    }
    setHasSeenOnboarding(true);
    setQuizResult(result);
    setSkippedAccount(skipped);
  }, []);

  const saveQuizResult = useCallback(async (result: QuizResult) => {
    await AsyncStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
    setQuizResult(result);
  }, []);

  const dismissBanner = useCallback(async () => {
    const next = skipBannerCount + 1;
    await AsyncStorage.setItem(SKIP_BANNER_KEY, String(next));
    setSkipBannerCount(next);
  }, [skipBannerCount]);

  const clearForRetake = useCallback(async () => {
    await AsyncStorage.removeItem(QUIZ_RESULT_KEY);
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    setQuizResult(null);
    setHasSeenOnboarding(false);
  }, []);

  const markAccountCreated = useCallback(async () => {
    await AsyncStorage.removeItem(SKIPPED_ACCOUNT_KEY);
    setSkippedAccount(false);
  }, []);

  const shouldShowBanner = skippedAccount && skipBannerCount < 3;

  const value = useMemo<OnboardingContextValue>(
    () => ({
      hasSeenOnboarding,
      quizResult,
      skippedAccount,
      skipBannerCount,
      completeOnboarding,
      saveQuizResult,
      dismissBanner,
      clearForRetake,
      markAccountCreated,
      shouldShowBanner,
    }),
    [hasSeenOnboarding, quizResult, skippedAccount, skipBannerCount, completeOnboarding, saveQuizResult, dismissBanner, clearForRetake, markAccountCreated, shouldShowBanner]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
