import type { DecisionBrief, BriefChangeLogEntry } from "./decisionBriefs";

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function hasRecentChange(
  changeLog: BriefChangeLogEntry[],
  severity: "P0" | "P1" | "P2",
  withinDays: number
): boolean {
  const cutoff = daysAgo(withinDays);
  return changeLog.some(
    (entry) =>
      entry.severity === severity && new Date(entry.date) >= cutoff
  );
}

export function requiresImmediateReview(brief: DecisionBrief): boolean {
  const metaConfidence = brief.meta?.confidenceLevel;
  if (metaConfidence === "low") return true;

  if (daysSince(brief.lastReviewedAt) > 180) return true;

  const log = brief.changeLog ?? brief.meta?.changeLog ?? [];
  if (hasRecentChange(log, "P0", 90)) return true;

  return false;
}

export function requiresScheduledReview(brief: DecisionBrief): boolean {
  if (daysSince(brief.lastReviewedAt) > 90) return true;

  const log = brief.changeLog ?? brief.meta?.changeLog ?? [];
  if (hasRecentChange(log, "P1", 180)) return true;

  return false;
}

export type ReviewStatus = {
  immediate: boolean;
  scheduled: boolean;
  reason: string;
};

export function getReviewStatus(brief: DecisionBrief): ReviewStatus {
  if (requiresImmediateReview(brief)) {
    const metaConfidence = brief.meta?.confidenceLevel;
    const log = brief.changeLog ?? brief.meta?.changeLog ?? [];

    let reason = "Immediate review required";
    if (metaConfidence === "low") {
      reason = "Confidence level is low";
    } else if (daysSince(brief.lastReviewedAt) > 180) {
      reason = `Last reviewed ${daysSince(brief.lastReviewedAt)} days ago (>180 days)`;
    } else if (hasRecentChange(log, "P0", 90)) {
      reason = "P0 (critical) change detected within last 90 days";
    }

    return { immediate: true, scheduled: true, reason };
  }

  if (requiresScheduledReview(brief)) {
    const log = brief.changeLog ?? brief.meta?.changeLog ?? [];

    let reason = "Scheduled review required";
    if (daysSince(brief.lastReviewedAt) > 90) {
      reason = `Last reviewed ${daysSince(brief.lastReviewedAt)} days ago (>90 days)`;
    } else if (hasRecentChange(log, "P1", 180)) {
      reason = "P1 (material) change detected within last 6 months";
    }

    return { immediate: false, scheduled: true, reason };
  }

  return { immediate: false, scheduled: false, reason: "No review needed" };
}
