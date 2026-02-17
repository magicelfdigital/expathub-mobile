import type { Severity } from "@/src/data/severity";
import type {
  DecisionBrief,
  ConfidenceLevel,
  BriefChangeLogEntry,
  SourceLink,
} from "@/src/data/decisionBriefs";

export type BriefMetaPatch = Pick<
  DecisionBrief,
  "updatedAt" | "confidenceLevel" | "changeLog"
> &
  Partial<Pick<DecisionBrief, "sourceLinks">>;

export type MonitoringProposal = {
  id: string;
  countrySlug: string;
  pathwayKey?: string | null;
  url: string;
  detectedAt: string;
  severity: Severity;
  summary: string;
};

export type PatchResult = {
  patch: Partial<DecisionBrief>;
  requiresApproval: boolean;
};

function downgradeConfidence(
  severity: Severity,
  existing: ConfidenceLevel
): ConfidenceLevel {
  if (severity === "P0") return "Conditional" as ConfidenceLevel;
  if (severity === "P1") {
    if (existing === "High") return "Medium";
    return existing;
  }
  return existing;
}

export function buildMetaPatch(
  existingBrief: DecisionBrief,
  proposal: MonitoringProposal
): PatchResult {
  const newEntry: BriefChangeLogEntry = {
    date: proposal.detectedAt || new Date().toISOString(),
    summary: proposal.summary,
    severity: proposal.severity,
  };

  const existingLog = existingBrief.changeLog ?? [];

  const patch: Partial<DecisionBrief> = {
    updatedAt: proposal.detectedAt || new Date().toISOString(),
    confidenceLevel: downgradeConfidence(
      proposal.severity,
      existingBrief.confidenceLevel
    ),
    changeLog: [...existingLog, newEntry],
  };

  if (proposal.url) {
    const existingSources = existingBrief.sourceLinks ?? [];
    const alreadyLinked = existingSources.some((s) => s.url === proposal.url);
    if (!alreadyLinked) {
      const newSource: SourceLink = {
        label: `Monitoring: ${proposal.id}`,
        url: proposal.url,
        type: "official",
      };
      patch.sourceLinks = [...existingSources, newSource];
    }
  }

  const requiresApproval =
    proposal.severity === "P0" || proposal.severity === "P1";

  return { patch, requiresApproval };
}
