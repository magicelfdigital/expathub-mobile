import type { DecisionBriefMeta, ChangeLogEntry } from "@/src/data/briefHelpers";
import type { DetectedChange, UpdateProposal } from "./types";

function severityToConfidence(
  severity: "P0" | "P1" | "P2"
): "low" | "medium" | undefined {
  if (severity === "P0") return "low";
  if (severity === "P1") return "medium";
  return undefined;
}

function worstSeverity(
  changes: DetectedChange[]
): "P0" | "P1" | "P2" {
  if (changes.some((c) => c.severity === "P0")) return "P0";
  if (changes.some((c) => c.severity === "P1")) return "P1";
  return "P2";
}

export function buildProposal(
  changes: DetectedChange[]
): UpdateProposal | null {
  if (changes.length === 0) return null;

  const target = changes[0].target;
  const now = new Date().toISOString();
  const worst = worstSeverity(changes);

  const newLogEntries: ChangeLogEntry[] = changes.map((c) => ({
    date: now,
    severity: c.severity,
    summary: c.summary,
    source: c.sourceUrl,
  }));

  const patch: Partial<DecisionBriefMeta> = {
    updatedAt: now,
    changeLog: newLogEntries,
  };

  const downgrade = severityToConfidence(worst);
  if (downgrade) {
    patch.confidenceLevel = downgrade;
  }

  const rationale = changes.map(
    (c) =>
      `[${c.severity}] ${c.summary}${c.sourceUrl ? ` (${c.sourceUrl})` : ""}`
  );

  return {
    target,
    proposedMetaPatch: patch,
    rationale,
  };
}
