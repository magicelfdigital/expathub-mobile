export type Severity = "P0" | "P1" | "P2";

export const SEVERITY_DEFINITIONS: Record<
  Severity,
  { label: string; description: string; examples: string[] }
> = {
  P0: {
    label: "Critical",
    description:
      "Changes that directly affect whether someone qualifies, can work, or faces program termination. Requires immediate review.",
    examples: [
      "Eligibility criteria changed",
      "Income thresholds updated",
      "Work rights or sponsorship requirements modified",
      "Program suspended or terminated",
    ],
  },
  P1: {
    label: "Material",
    description:
      "Changes that affect planning, documentation, or financial expectations but do not change eligibility.",
    examples: [
      "Processing times changed significantly",
      "Documentation requirements updated",
      "Tax treatment clarified or revised",
    ],
  },
  P2: {
    label: "Informational",
    description:
      "Minor changes that do not affect eligibility, rights, or financial planning.",
    examples: [
      "Wording or formatting changes on official portals",
      "FAQ updates",
      "Minor fee adjustments (under 15%)",
    ],
  },
};

export const MANDATORY_REVIEW_FIELDS = [
  "eligibility_criteria",
  "work_rights",
  "income_thresholds",
  "proof_formats",
  "application_portals",
  "issuing_authorities",
  "first_year_tax_residency",
] as const;

export type MandatoryReviewField = (typeof MANDATORY_REVIEW_FIELDS)[number];

export const PROCESSING_TIME_CHANGE_THRESHOLD = 0.3;
export const FEE_CHANGE_THRESHOLD = 0.15;
