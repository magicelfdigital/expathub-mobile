import React from "react";
import { act, render, waitFor } from "@testing-library/react";

import { OnboardingProvider, useOnboarding } from "../OnboardingContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QuizResult } from "@/src/data/quiz";

const baseResult: QuizResult = {
  score: 8,
  maxScore: 16,
  regionPreference: "southern_europe",
  risks: [],
  blockers: [],
  readiness: {
    level: "curious_explorer",
    label: "Curious explorer",
    description: "desc",
  },
};

function captureOnboarding() {
  const ref: { current: ReturnType<typeof useOnboarding> | null } = { current: null };
  function Probe() {
    ref.current = useOnboarding();
    return null;
  }
  return { ref, Probe };
}

beforeEach(() => {
  (AsyncStorage as any).__reset();
});

describe("OnboardingContext — initial hydration", () => {
  it("starts with hasSeenOnboarding=null until the AsyncStorage read resolves, then false on a fresh device", async () => {
    const { ref, Probe } = captureOnboarding();
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    );

    expect(ref.current?.hasSeenOnboarding).toBeNull();
    expect(ref.current?.quizResult).toBeNull();
    expect(ref.current?.skippedAccount).toBe(false);
    expect(ref.current?.skipBannerCount).toBe(0);

    await waitFor(() => expect(ref.current?.hasSeenOnboarding).toBe(false));
  });

  it("restores previously persisted quiz result, onboarding-seen flag, and skip-banner count", async () => {
    (AsyncStorage as any).__seed("hasSeenOnboarding", "true");
    (AsyncStorage as any).__seed("quizResult", JSON.stringify(baseResult));
    (AsyncStorage as any).__seed("skippedAccount", "true");
    (AsyncStorage as any).__seed("skipBannerCount", "2");

    const { ref, Probe } = captureOnboarding();
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    );

    await waitFor(() => expect(ref.current?.hasSeenOnboarding).toBe(true));
    expect(ref.current?.quizResult).toEqual(baseResult);
    expect(ref.current?.skippedAccount).toBe(true);
    expect(ref.current?.skipBannerCount).toBe(2);
    expect(ref.current?.shouldShowBanner).toBe(true);
  });

  it("recovers gracefully when persisted quizResult is malformed JSON", async () => {
    (AsyncStorage as any).__seed("hasSeenOnboarding", "true");
    (AsyncStorage as any).__seed("quizResult", "not-json{{{");

    const { ref, Probe } = captureOnboarding();
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    );

    await waitFor(() => expect(ref.current?.hasSeenOnboarding).toBe(true));
    expect(ref.current?.quizResult).toBeNull();
  });
});

describe("OnboardingContext — mutations", () => {
  async function mounted() {
    const { ref, Probe } = captureOnboarding();
    render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    );
    await waitFor(() => expect(ref.current?.hasSeenOnboarding).toBe(false));
    return ref;
  }

  it("completeOnboarding(skip=false) persists onboarding-seen + quizResult and does not flag skippedAccount", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult);
    });
    expect(ref.current?.hasSeenOnboarding).toBe(true);
    expect(ref.current?.quizResult).toEqual(baseResult);
    expect(ref.current?.skippedAccount).toBe(false);
    expect(await AsyncStorage.getItem("hasSeenOnboarding")).toBe("true");
    expect(await AsyncStorage.getItem("quizResult")).toBe(JSON.stringify(baseResult));
    expect(await AsyncStorage.getItem("skippedAccount")).toBeNull();
  });

  it("completeOnboarding(skip=true) flags skippedAccount and surfaces shouldShowBanner=true", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult, true);
    });
    expect(ref.current?.skippedAccount).toBe(true);
    expect(ref.current?.shouldShowBanner).toBe(true);
    expect(await AsyncStorage.getItem("skippedAccount")).toBe("true");
  });

  it("dismissBanner increments skipBannerCount and hides banner once it crosses 3", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult, true);
    });
    expect(ref.current?.shouldShowBanner).toBe(true);

    await act(async () => { await ref.current!.dismissBanner(); });
    await act(async () => { await ref.current!.dismissBanner(); });
    expect(ref.current?.skipBannerCount).toBe(2);
    expect(ref.current?.shouldShowBanner).toBe(true);

    await act(async () => { await ref.current!.dismissBanner(); });
    expect(ref.current?.skipBannerCount).toBe(3);
    expect(ref.current?.shouldShowBanner).toBe(false);
    expect(await AsyncStorage.getItem("skipBannerCount")).toBe("3");
  });

  it("clearForRetake wipes the complete quiz footprint so the user re-enters the funnel", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult);
    });
    // Seed the three result-screen attribute keys alongside the quiz state to
    // prove clearForRetake also removes them (not just quizResult/answers).
    await AsyncStorage.setItem("user_top_country", "portugal");
    await AsyncStorage.setItem("user_first_name", "Ada");
    await AsyncStorage.setItem("user_quiz_completed", "true");
    expect(ref.current?.hasSeenOnboarding).toBe(true);
    expect(ref.current?.quizResult).toBeTruthy();

    await act(async () => {
      await ref.current!.clearForRetake();
    });
    expect(ref.current?.hasSeenOnboarding).toBe(false);
    expect(ref.current?.quizResult).toBeNull();
    expect(ref.current?.quizAnswers).toBeNull();
    expect(await AsyncStorage.getItem("quizResult")).toBeNull();
    expect(await AsyncStorage.getItem("quizAnswers")).toBeNull();
    expect(await AsyncStorage.getItem("hasSeenOnboarding")).toBeNull();
    expect(await AsyncStorage.getItem("user_top_country")).toBeNull();
    expect(await AsyncStorage.getItem("user_first_name")).toBeNull();
    expect(await AsyncStorage.getItem("user_quiz_completed")).toBeNull();
  });

  it("markAccountCreated clears skippedAccount but preserves the quiz result and banner count", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult, true);
      await ref.current!.dismissBanner();
    });
    await act(async () => {
      await ref.current!.markAccountCreated();
    });
    expect(ref.current?.skippedAccount).toBe(false);
    expect(ref.current?.shouldShowBanner).toBe(false);
    expect(ref.current?.quizResult).toEqual(baseResult);
    expect(ref.current?.skipBannerCount).toBe(1);
    expect(await AsyncStorage.getItem("skippedAccount")).toBeNull();
  });

  it("saveQuizResult overwrites the persisted quiz result without touching onboarding flags", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.completeOnboarding(baseResult);
    });

    const updated: QuizResult = { ...baseResult, score: 14 };
    await act(async () => {
      await ref.current!.saveQuizResult(updated);
    });
    expect(ref.current?.quizResult).toEqual(updated);
    expect(ref.current?.hasSeenOnboarding).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem("quizResult"))!)).toEqual(updated);
  });

  it("skipOnboarding marks hasSeenOnboarding=true without recording a quiz result", async () => {
    const ref = await mounted();
    await act(async () => {
      await ref.current!.skipOnboarding();
    });
    expect(ref.current?.hasSeenOnboarding).toBe(true);
    expect(ref.current?.quizResult).toBeNull();
  });
});

describe("useOnboarding outside the provider", () => {
  it("throws so callers can't accidentally read undefined context", () => {
    function Probe() {
      useOnboarding();
      return null;
    }
    // Suppress React's expected-error console output for this assertion.
    const orig = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(
        /useOnboarding must be used within OnboardingProvider/,
      );
    } finally {
      console.error = orig;
    }
  });
});
