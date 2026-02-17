export type BriefSeverity = "P0" | "P1" | "P2";

export type SeverityDefinition = {
  level: BriefSeverity;
  label: string;
  description: string;
  slaHours: number;
  slaLabel: string;
};

export const BRIEF_SEVERITY_DEFINITIONS: Record<BriefSeverity, SeverityDefinition> = {
  P0: {
    level: "P0",
    label: "Critical",
    description:
      "User-facing legality, eligibility, or rights changed. Includes visa suspensions, income threshold changes, work authorization modifications, and sponsorship requirement alterations.",
    slaHours: 48,
    slaLabel: "Review within 48 hours",
  },
  P1: {
    level: "P1",
    label: "Material",
    description:
      "Material process, threshold, or timeline change. Includes significant processing time shifts, fee changes above 15%, new documentation requirements, and tax treatment revisions.",
    slaHours: 168,
    slaLabel: "Review within 7 days",
  },
  P2: {
    level: "P2",
    label: "Informational",
    description:
      "Non-decision-impacting changes. Includes portal wording updates, FAQ changes, minor fee adjustments under 15%, and link changes without content changes.",
    slaHours: 720,
    slaLabel: "Review within 30 days",
  },
};

export function getSLAForSeverity(severity: BriefSeverity): {
  hours: number;
  label: string;
} {
  const def = BRIEF_SEVERITY_DEFINITIONS[severity];
  return { hours: def.slaHours, label: def.slaLabel };
}

export function isSLABreached(
  severity: BriefSeverity,
  detectedAt: string
): boolean {
  const detectedTime = new Date(detectedAt).getTime();
  const now = Date.now();
  const elapsedHours = (now - detectedTime) / (1000 * 60 * 60);
  const { hours } = getSLAForSeverity(severity);
  return elapsedHours > hours;
}
