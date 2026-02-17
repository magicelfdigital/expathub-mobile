import type {
  MonitorTarget,
  Signal,
  DetectedChange,
  UpdateProposal,
} from "./types";
import { buildProposal } from "./buildProposal";
import { requiresApproval } from "./approvalPolicy";

export type ManualCheckResult = {
  changes: DetectedChange[];
  proposals: UpdateProposal[];
};

export function detectChanges(
  signals: Signal[],
  _previousSignals?: Signal[]
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  for (const signal of signals) {
    const titleLower = signal.title.toLowerCase();
    const excerptLower = (signal.excerpt ?? "").toLowerCase();
    const combined = `${titleLower} ${excerptLower}`;

    let severity: "P0" | "P1" | "P2" = "P2";
    let fieldsImpacted: string[] = [];

    const p0Keywords = [
      "suspended",
      "terminated",
      "closed",
      "eligibility changed",
      "no longer eligible",
      "program ended",
      "work rights",
      "income threshold",
    ];

    const p1Keywords = [
      "processing time",
      "fee increase",
      "fee change",
      "new requirement",
      "documentation update",
      "deadline change",
    ];

    if (p0Keywords.some((kw) => combined.includes(kw))) {
      severity = "P0";
      fieldsImpacted = p0Keywords.filter((kw) => combined.includes(kw));
    } else if (p1Keywords.some((kw) => combined.includes(kw))) {
      severity = "P1";
      fieldsImpacted = p1Keywords.filter((kw) => combined.includes(kw));
    } else {
      fieldsImpacted = ["general"];
    }

    changes.push({
      target: signal.target,
      severity,
      summary: signal.title,
      sourceUrl: signal.url,
      fieldsImpacted,
    });
  }

  return changes;
}

function groupByTarget(
  changes: DetectedChange[]
): Map<string, DetectedChange[]> {
  const groups = new Map<string, DetectedChange[]>();
  for (const c of changes) {
    const key = `${c.target.countrySlug}::${c.target.pathwayKey ?? "country"}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return groups;
}

export function runManualCheck(
  _targets: MonitorTarget[],
  signals: Signal[],
  previousSignals?: Signal[]
): ManualCheckResult {
  const changes = detectChanges(signals, previousSignals);
  const grouped = groupByTarget(changes);

  const proposals: UpdateProposal[] = [];
  for (const [, group] of grouped) {
    const proposal = buildProposal(group);
    if (proposal) {
      const worstSeverity = group.some((c) => c.severity === "P0")
        ? "P0"
        : group.some((c) => c.severity === "P1")
          ? "P1"
          : "P2";

      const needsApproval = requiresApproval(worstSeverity);
      if (needsApproval) {
        proposal.rationale.push("Requires manual approval before applying.");
      }

      proposals.push(proposal);
    }
  }

  return { changes, proposals };
}
