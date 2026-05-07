/**
 * Pure decision helpers for the onboarding quiz screen.
 *
 * These are extracted from `app/onboarding/quiz.tsx` so the funnel logic
 * (advance vs save-prompt vs finish, abandonment firing rules, per-question
 * event payload shape) can be unit-tested without rendering the full
 * Animated/router stack.
 */

export const SAVE_PROMPT_TRIGGER_INDEX = 4; // After Q5 (0-indexed)
export const SAVE_PROMPT_NO_THRESHOLD = 3;
export const TIMELINE_QUESTION_ID = 8;

export type QuizAdvanceDecision =
  | { kind: "save_prompt"; noCount: number }
  | { kind: "next" }
  | { kind: "finish" };

export interface DecideQuizAdvanceInput {
  currentIndex: number;
  total: number;
  answers: Record<number, string>;
  /** Whether the save modal has already been shown for this run. */
  savePromptAlreadyShown: boolean;
}

/**
 * Decide what should happen after a user submits an answer for the current
 * question. Used to drive both screen state and analytics on the quiz screen.
 *
 * The branches mirror the original screen logic exactly:
 *  - If we're at the trigger index AND `noCount >= threshold` AND we haven't
 *    already shown the prompt → show the save prompt (advance is suspended).
 *  - Otherwise, if we're not at the last question → advance to the next.
 *  - Otherwise → finish the quiz and route to results.
 */
export function decideQuizAdvance(input: DecideQuizAdvanceInput): QuizAdvanceDecision {
  const { currentIndex, total, answers, savePromptAlreadyShown } = input;
  if (currentIndex < total - 1) {
    const noCount = Object.values(answers).filter((v) => v === "no").length;
    if (
      currentIndex === SAVE_PROMPT_TRIGGER_INDEX &&
      noCount >= SAVE_PROMPT_NO_THRESHOLD &&
      !savePromptAlreadyShown
    ) {
      return { kind: "save_prompt", noCount };
    }
    return { kind: "next" };
  }
  return { kind: "finish" };
}

/**
 * Decide whether to fire the `quiz_abandoned` analytics event when the
 * quiz screen unmounts. Only fires when the user answered at least one
 * question but did not finish, AND the completion event has not yet been
 * fired (duplicate-suppression).
 */
export function shouldFireAbandonment(input: {
  answeredCount: number;
  total: number;
  completed: boolean;
}): boolean {
  const { answeredCount, total, completed } = input;
  if (completed) return false;
  if (answeredCount <= 0) return false;
  if (answeredCount >= total) return false;
  return true;
}

/**
 * Build the analytics payload for `quiz_question_answered`. Centralized so
 * the property names and shape are tested in one place.
 */
export function buildQuizAnsweredPayload(input: {
  questionId: number;
  questionIndex: number;
  category: string;
  answer: string;
}): { questionId: number; questionIndex: number; category: string; answer: string } {
  return {
    questionId: input.questionId,
    questionIndex: input.questionIndex,
    category: input.category,
    answer: input.answer,
  };
}

/**
 * Whether the timeline question (Q8) should suppress auto-advance and
 * require an explicit "See your results" tap.
 */
export function shouldDeferAdvanceForTimeline(questionId: number): boolean {
  return questionId === TIMELINE_QUESTION_ID;
}
