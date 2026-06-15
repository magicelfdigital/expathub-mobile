// Pure decision logic for the re-engagement prompts (quiz reminders and the
// App Store rating request). These functions hold no platform or storage
// dependencies so they can be unit tested in isolation, away from the native
// modules the surrounding helpers call.

export const MIN_RATING_SESSION_MS = 60 * 1000;

export type RatingPromptGate = {
  isAvailable: boolean;
  elapsedMs: number;
  alreadyShown: boolean;
  isFirstSession: boolean;
};

// The rating prompt may only fire when the device supports it, the user has
// spent a minimum dwell time in the session, it has never been shown before,
// and this is not the user's first session (never on first open).
export function shouldShowRatingPrompt(gate: RatingPromptGate): boolean {
  if (!gate.isAvailable) return false;
  if (gate.isFirstSession) return false;
  if (gate.alreadyShown) return false;
  return gate.elapsedMs >= MIN_RATING_SESSION_MS;
}

// Quiz reminders are only set up for users who have not already completed the
// readiness quiz. This guards the permission request too, so people revisiting
// or editing a finished quiz are never prompted.
export function shouldSetupQuizReminders(quizCompleted: boolean): boolean {
  return !quizCompleted;
}
