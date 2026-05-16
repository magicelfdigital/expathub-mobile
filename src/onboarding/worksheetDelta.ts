import type { Blocker, BlockerLevel, ReadinessLevel } from "@/src/data/quiz";
import { groupBlockersByLevel } from "./resultFlow";

/**
 * Snapshot of the user's readiness state taken before a worksheet
 * submission, paired with the recomputed state after, so the result and
 * worksheets-list screens can surface a "your score moved" moment.
 *
 * Stored in OnboardingContext, set by `useSubmitWorksheet`, and cleared
 * by whichever screen displays the banner first.
 */
export type LevelCounts = Record<BlockerLevel, number>;

export interface WorksheetDelta {
  worksheetId: string;
  dimension: string;
  previousScore: number;
  previousMax: number;
  previousReadinessLevel: ReadinessLevel;
  previousCounts: LevelCounts;
  nextScore: number;
  nextMax: number;
  nextReadinessLevel: ReadinessLevel;
  nextCounts: LevelCounts;
}

export function countsFromBlockers(blockers: Blocker[]): LevelCounts {
  const g = groupBlockersByLevel(blockers);
  return {
    critical: g.critical.length,
    moderate: g.moderate.length,
    explore: g.explore.length,
  };
}

export type DeltaTone = "up" | "down" | "neutral";

export interface DeltaSummary {
  tone: DeltaTone;
  previousPct: number;
  nextPct: number;
  pctDelta: number;
  blockersCleared: LevelCounts;
  title: string;
  body: string | null;
}

function pctFrom(score: number, max: number): number {
  const safeMax = Math.max(1, max);
  const raw = Math.max(0, Math.min(100, (score / safeMax) * 100));
  return Math.round(raw);
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function summarizeDelta(d: WorksheetDelta): DeltaSummary {
  const previousPct = pctFrom(d.previousScore, d.previousMax);
  const nextPct = pctFrom(d.nextScore, d.nextMax);
  const pctDelta = nextPct - previousPct;

  const blockersCleared: LevelCounts = {
    critical: Math.max(0, d.previousCounts.critical - d.nextCounts.critical),
    moderate: Math.max(0, d.previousCounts.moderate - d.nextCounts.moderate),
    explore: Math.max(0, d.previousCounts.explore - d.nextCounts.explore),
  };

  const clearedParts: string[] = [];
  if (blockersCleared.critical > 0) {
    clearedParts.push(`${pluralize(blockersCleared.critical, "critical blocker", "critical blockers")} cleared`);
  }
  if (blockersCleared.moderate > 0) {
    clearedParts.push(`${pluralize(blockersCleared.moderate, "moderate blocker", "moderate blockers")} cleared`);
  }
  if (blockersCleared.explore > 0) {
    clearedParts.push(`${pluralize(blockersCleared.explore, "explore item", "explore items")} cleared`);
  }
  const clearedBody = clearedParts.length > 0 ? clearedParts.join(" · ") : null;

  if (pctDelta > 0) {
    return {
      tone: "up",
      previousPct,
      nextPct,
      pctDelta,
      blockersCleared,
      title: `Your readiness moved from ${previousPct}% to ${nextPct}%`,
      body: clearedBody,
    };
  }

  if (pctDelta < 0) {
    return {
      tone: "down",
      previousPct,
      nextPct,
      pctDelta,
      blockersCleared,
      title: `Your readiness shifted from ${previousPct}% to ${nextPct}%`,
      body: "An honest update sometimes lowers the score. That's a clearer picture, not a setback.",
    };
  }

  return {
    tone: "neutral",
    previousPct,
    nextPct,
    pctDelta,
    blockersCleared,
    title: "Worksheet saved",
    body: clearedBody ?? "Your readiness picture didn't shift this time. The added detail still sharpens your plan.",
  };
}
