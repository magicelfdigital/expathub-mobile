/**
 * Pure predicates for the planner's "completed" lifecycle.
 *
 * Used by app/(tabs)/(home)/country/[slug]/planner.tsx to decide when to
 * fire the `planner_completed` analytics event, show the confetti, and
 * when to reset the "already fired" guard so the celebration can re-fire
 * if the user un-checks a step and re-checks it later.
 *
 * Kept as a pure module so we can pin every branch in tests without
 * mounting the full planner screen and its context tree.
 */

export type PlannerCompletionInput = {
  percent: number;
  hasPlanForThisCountry: boolean;
  isPaidUser: boolean;
  alreadyFired: boolean;
};

/**
 * Returns true ONLY when:
 *  - percent reaches the 100% boundary exactly
 *  - this country actually has an active plan (so we don't celebrate a
 *    country the user merely browsed)
 *  - the user is on a paid tier (planner is a Pro-only feature)
 *  - we have NOT already fired this celebration since the last reset
 *
 * Boundary semantics: percent must be exactly 100. 99 is "almost done"
 * and 101 (defensive) does NOT count — the data layer should never go
 * over 100 but we treat overshoot as "not at the boundary".
 */
export function shouldFirePlannerCompleted(
  input: PlannerCompletionInput,
): boolean {
  if (input.percent !== 100) return false;
  if (!input.hasPlanForThisCountry) return false;
  if (!input.isPaidUser) return false;
  if (input.alreadyFired) return false;
  return true;
}

/**
 * Returns true when the "already fired" guard should be released so a
 * later 100% can fire the celebration again. This happens any time the
 * user drops below 100% — typically by un-checking a step.
 */
export function shouldResetPlannerCompletionGuard(percent: number): boolean {
  return percent < 100;
}
