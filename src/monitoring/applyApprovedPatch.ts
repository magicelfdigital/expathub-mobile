import type { DecisionBrief } from "@/src/data/decisionBriefs";

export function applyApprovedPatch(
  existingBrief: DecisionBrief,
  patch: Partial<DecisionBrief>,
  reviewedAtISO: string
): DecisionBrief {
  return {
    ...existingBrief,
    ...patch,
    lastReviewedAt: reviewedAtISO,
  };
}
