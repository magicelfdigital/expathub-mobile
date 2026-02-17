export type {
  MonitorTarget,
  SourceType,
  SourceSpec,
  Signal,
  DetectedChange,
  UpdateProposal,
} from "./types";

export { runManualCheck, detectChanges } from "./runManualCheck";
export type { ManualCheckResult } from "./runManualCheck";

export {
  isHighVolatility,
  recommendedCheckFrequency,
} from "./volatility";
export type { CheckFrequency } from "./volatility";

export { requiresApproval, shouldAutoApply } from "./approvalPolicy";

export { buildProposal } from "./buildProposal";

export { inferSeverity, inferSeverityWithReason } from "./severityHeuristics";

export { buildMetaPatch } from "./mapProposalToBriefPatch";
export type { BriefMetaPatch, MonitoringProposal, PatchResult } from "./mapProposalToBriefPatch";

export { applyApprovedPatch } from "./applyApprovedPatch";
