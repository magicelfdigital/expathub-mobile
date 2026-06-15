import {
  MIN_RATING_SESSION_MS,
  shouldShowRatingPrompt,
  shouldSetupQuizReminders,
} from "@/src/lib/reengagementGates";

describe("shouldShowRatingPrompt", () => {
  const eligible = {
    isAvailable: true,
    elapsedMs: MIN_RATING_SESSION_MS,
    alreadyShown: false,
    isFirstSession: false,
  };

  it("allows the prompt once every gate passes", () => {
    expect(shouldShowRatingPrompt(eligible)).toBe(true);
  });

  it("suppresses the prompt on the user's first session (never on first open)", () => {
    expect(shouldShowRatingPrompt({ ...eligible, isFirstSession: true })).toBe(
      false
    );
  });

  it("suppresses the prompt when it has already been shown", () => {
    expect(shouldShowRatingPrompt({ ...eligible, alreadyShown: true })).toBe(
      false
    );
  });

  it("suppresses the prompt before the minimum dwell time", () => {
    expect(
      shouldShowRatingPrompt({ ...eligible, elapsedMs: MIN_RATING_SESSION_MS - 1 })
    ).toBe(false);
  });

  it("suppresses the prompt when store review is unavailable", () => {
    expect(shouldShowRatingPrompt({ ...eligible, isAvailable: false })).toBe(
      false
    );
  });
});

describe("shouldSetupQuizReminders", () => {
  it("sets up reminders for users who have not completed the quiz", () => {
    expect(shouldSetupQuizReminders(false)).toBe(true);
  });

  it("skips reminders (and the permission prompt) for completed quizzes", () => {
    expect(shouldSetupQuizReminders(true)).toBe(false);
  });
});
