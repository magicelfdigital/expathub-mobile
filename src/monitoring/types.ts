import type { DecisionBriefMeta } from "@/src/data/briefHelpers";

export type MonitorTarget = {
  countrySlug: string;
  pathwayKey?: string;
};

export type SourceType = "official" | "secondary";

export type SourceSpec = {
  id: string;
  label: string;
  type: SourceType;
  url: string;
  keywords: string[];
};

export type Signal = {
  target: MonitorTarget;
  sourceId: string;
  fetchedAt: string;
  title: string;
  url: string;
  excerpt?: string;
};

export type DetectedChange = {
  target: MonitorTarget;
  severity: "P0" | "P1" | "P2";
  summary: string;
  sourceUrl?: string;
  fieldsImpacted: string[];
};

export type UpdateProposal = {
  target: MonitorTarget;
  proposedMetaPatch: Partial<DecisionBriefMeta>;
  proposedContentPatch?: any;
  rationale: string[];
};
