import type { Blocker, BlockerLevel, ReadinessLevel } from "@/src/data/quiz";

/**
 * Pure helpers extracted from `app/onboarding/result.tsx`. These let us
 * unit-test the funnel behaviour (paywall gating, lead-save email guard,
 * CTA-specific quiz_completed payloads, fill-bar math, name derivation)
 * without spinning up the full screen.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidResultEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_RE.test(email.trim());
}

export function getResultFillPercent(score: number, maxScore: number): number {
  const safeMax = Math.max(1, maxScore);
  return Math.max(0, Math.min(100, (score / safeMax) * 100));
}

export function groupBlockersByLevel(
  blockers: Blocker[],
): Record<BlockerLevel, Blocker[]> {
  const g: Record<BlockerLevel, Blocker[]> = {
    critical: [],
    moderate: [],
    explore: [],
  };
  for (const b of blockers) g[b.level].push(b);
  return g;
}

/**
 * The paywall CTA only renders BETWEEN the urgent (critical/moderate) section
 * and the "explore" section — i.e. only when there's at least one urgent
 * blocker. With zero urgent blockers, the CTA is suppressed (the user sees
 * the success card instead).
 */
export function shouldShowPaywallAfterUrgent(blockers: Blocker[]): boolean {
  const g = groupBlockersByLevel(blockers);
  return g.critical.length > 0 || g.moderate.length > 0;
}

export type ResultCtaAction = "create_account" | "continue";

export function buildResultCtaPayload(input: {
  action: ResultCtaAction;
  readinessLevel: ReadinessLevel;
  score: number;
}): {
  readiness_level: ReadinessLevel;
  score: number;
  action: ResultCtaAction;
} {
  return {
    readiness_level: input.readinessLevel,
    score: input.score,
    action: input.action,
  };
}

export function buildLeadSavePayload(input: {
  readinessLevel: ReadinessLevel;
  score: number;
}): { readiness_level: ReadinessLevel; score: number } {
  return {
    readiness_level: input.readinessLevel,
    score: input.score,
  };
}

/**
 * Derive a first name for the personalized paywall:
 *  1. Prefer the explicit `firstName` answer (or legacy `first_name`).
 *  2. Fall back to the local-part of the user's email.
 *  3. Otherwise return null (paywall renders without a name).
 *
 * Empty / whitespace-only strings are treated as missing.
 */
export function deriveResultFirstName(input: {
  answers: { firstName?: unknown; first_name?: unknown };
  userEmail: string | null | undefined;
}): string | null {
  const raw = input.answers.firstName ?? input.answers.first_name ?? null;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  if (input.userEmail && typeof input.userEmail === "string") {
    const local = input.userEmail.split("@")[0];
    if (local && local.length > 0) return local;
  }
  return null;
}
