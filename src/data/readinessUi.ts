import type { ReadinessLabel, ReadinessLevel } from "./quiz";
import { tokens } from "@/theme/tokens";

/**
 * Color for the readiness badge on the account screen, derived from the
 * 4-tier readiness label level. Centralized so the rendering rule has a
 * single source of truth that can be unit-tested independently of the
 * account screen's full provider stack.
 */
export function getReadinessBadgeColor(level: ReadinessLevel): string {
  if (level === "ready_to_plan" || level === "serious_researcher") {
    return tokens.color.teal;
  }
  if (level === "curious_explorer") {
    return tokens.color.primary;
  }
  return "#9BA8C0";
}

/**
 * Progress-bar fill % for the readiness card. Clamped to [0, 100] and safe
 * for zero/negative `maxScore` (returns 0 instead of dividing by zero).
 */
export function getReadinessFillPercent(score: number, maxScore: number): number {
  const safeMax = maxScore > 0 ? maxScore : 1;
  const raw = (score / safeMax) * 100;
  return Math.max(0, Math.min(100, raw));
}

/**
 * One-shot derivation used by the account-screen readiness card so the
 * card's rendering branch can be exercised without instantiating the full
 * Expo Router + provider tree.
 */
export function deriveReadinessCard(
  score: number,
  maxScore: number,
  readiness: ReadinessLabel,
): {
  badgeColor: string;
  fillPercent: number;
  label: string;
  level: ReadinessLevel;
} {
  return {
    badgeColor: getReadinessBadgeColor(readiness.level),
    fillPercent: getReadinessFillPercent(score, maxScore),
    label: readiness.label,
    level: readiness.level,
  };
}
