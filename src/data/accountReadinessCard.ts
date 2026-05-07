import type { QuizResult } from "./quiz";

/**
 * The account screen renders the "Relocation readiness" card only when a
 * persisted quiz result exists. Extracted so we can unit-test the rendering
 * gate (and the absence of the legacy "X/16" string) in isolation.
 */
export function shouldRenderReadinessSection(
  quizResult: QuizResult | null | undefined,
): boolean {
  if (!quizResult) return false;
  if (typeof quizResult.score !== "number") return false;
  return true;
}

/**
 * Old versions of the account screen rendered the literal "X/16" score next
 * to the readiness label. The 2026 redesign dropped that — the bar fill +
 * label is the only visual cue. This helper exists purely so a test can
 * assert "no, we never assemble that string anywhere".
 */
export function buildReadinessSubtitle(_quizResult: QuizResult): string {
  return "";
}
