import type { Severity } from "./severity";
import {
  PROCESSING_TIME_CHANGE_THRESHOLD,
  FEE_CHANGE_THRESHOLD,
} from "./severity";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ChangeLogEntry = {
  date: string;
  severity: Severity;
  summary: string;
  source?: string;
};

export type DecisionBriefMeta = {
  lastReviewedAt: string;
  updatedAt: string;
  confidenceLevel: ConfidenceLevel;
  sourceLinks: string[];
  changeLog: ChangeLogEntry[];
};

const REVIEW_WINDOW_DAYS = 60;

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function computeConfidenceLevel(
  meta: DecisionBriefMeta
): ConfidenceLevel {
  const hasOpenP0 = meta.changeLog.some((e) => e.severity === "P0");
  const reviewOverdue = daysSince(meta.lastReviewedAt) > REVIEW_WINDOW_DAYS;

  if (hasOpenP0 || reviewOverdue) {
    return "low";
  }

  const hasOpenP1 = meta.changeLog.some((e) => e.severity === "P1");
  if (hasOpenP1) {
    return "medium";
  }

  return "high";
}

export type ReviewTriggerResult = {
  reviewRequired: boolean;
  severity: Severity;
  reason: string;
};

export function checkMandatoryReviewTrigger(
  fieldChanged:
    | "eligibility_criteria"
    | "work_rights"
    | "income_thresholds"
    | "proof_formats"
    | "application_portals"
    | "issuing_authorities"
    | "first_year_tax_residency"
    | "processing_time"
    | "fee"
    | string,
  changeRatio?: number
): ReviewTriggerResult {
  const criticalFields = [
    "eligibility_criteria",
    "work_rights",
    "income_thresholds",
    "proof_formats",
    "application_portals",
    "issuing_authorities",
    "first_year_tax_residency",
  ];

  if (criticalFields.includes(fieldChanged)) {
    return {
      reviewRequired: true,
      severity: "P0",
      reason: `Critical field "${fieldChanged}" was changed`,
    };
  }

  if (
    fieldChanged === "processing_time" &&
    changeRatio !== undefined &&
    Math.abs(changeRatio) > PROCESSING_TIME_CHANGE_THRESHOLD
  ) {
    return {
      reviewRequired: true,
      severity: "P1",
      reason: `Processing time changed by ${(changeRatio * 100).toFixed(0)}% (threshold: ±${PROCESSING_TIME_CHANGE_THRESHOLD * 100}%)`,
    };
  }

  if (
    fieldChanged === "fee" &&
    changeRatio !== undefined &&
    Math.abs(changeRatio) > FEE_CHANGE_THRESHOLD
  ) {
    return {
      reviewRequired: true,
      severity: "P1",
      reason: `Fee changed by ${(changeRatio * 100).toFixed(0)}% (threshold: ±${FEE_CHANGE_THRESHOLD * 100}%)`,
    };
  }

  return {
    reviewRequired: false,
    severity: "P2",
    reason: "No mandatory review trigger",
  };
}

export type SourceWarning = {
  url: string;
  warning: string;
};

const ACCEPTED_SOURCE_PATTERNS = [
  /\.gov\./i,
  /\.gob\./i,
  /\.gc\.ca/i,
  /\.gov\.uk/i,
  /\.europa\.eu/i,
  /\.gouv\./i,
  /government\./i,
  /immigration\./i,
  /sef\.pt/i,
  /aima\.pt/i,
  /dgme\.go\.cr/i,
  /migracion\./i,
  /mdi\.gov/i,
  /identitymalta/i,
  /extranjeros\.inclusion/i,
  /inclusio\.gob/i,
  /ircc\.canada/i,
  /home\.affairs/i,
  /embassy\./i,
  /consulate\./i,
  /consulado\./i,
  /irs\.gov/i,
  /hmrc\.gov/i,
  /sat\.gob/i,
  /portaldasfinancas/i,
  /agenciatributaria/i,
  /cfr\.gov\.mt/i,
  /sri\.gob\.ec/i,
  /dgi\.gob\.pa/i,
  /hacienda\.go\.cr/i,
  /cra-arc\.gc\.ca/i,
  /canada\.ca/i,
  /ministerio/i,
  /ministry/i,
];

const PROFESSIONAL_BODY_PATTERNS = [
  /bar\.org/i,
  /law\.society/i,
  /colegio.*abogados/i,
  /aba\.org/i,
  /ilo\.org/i,
  /oecd\.org/i,
];

export function validateSourceLinks(urls: string[]): SourceWarning[] {
  const warnings: SourceWarning[] = [];
  let professionalBodyCount = 0;

  for (const url of urls) {
    const isOfficial = ACCEPTED_SOURCE_PATTERNS.some((p) => p.test(url));
    const isProfessionalBody = PROFESSIONAL_BODY_PATTERNS.some((p) =>
      p.test(url)
    );

    if (isProfessionalBody) {
      professionalBodyCount++;
      if (professionalBodyCount > 2) {
        warnings.push({
          url,
          warning:
            "Maximum 2 professional body sources allowed. Consider replacing with an official authority source.",
        });
      }
      continue;
    }

    if (!isOfficial) {
      warnings.push({
        url,
        warning:
          "Source does not match a recognized official immigration, tax, or labor authority pattern. Prefer .gov, .gob, or official ministry domains.",
      });
    }
  }

  return warnings;
}

export function validateChangeLogEntry(
  entry: Partial<ChangeLogEntry>
): string[] {
  const errors: string[] = [];
  if (!entry.date) errors.push("date is required");
  if (!entry.severity) errors.push("severity is required (P0, P1, or P2)");
  if (!entry.summary) errors.push("summary is required");
  return errors;
}
