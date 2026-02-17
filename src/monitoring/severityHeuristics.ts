import type { Severity } from "@/src/data/severity";

const P0_KEYWORDS = [
  "suspend",
  "paused",
  "terminated",
  "ban",
  "no longer",
  "ineligible",
  "eligibility",
  "income requirement",
  "threshold",
  "work permit",
  "work authorization",
  "sponsorship",
  "skilled worker",
  "digital nomad visa requirements",
  "minimum income",
  "new law",
  "decree",
  "regulation",
];

const P1_KEYWORDS = [
  "processing time",
  "appointments",
  "fees updated",
  "documentation",
  "proof",
  "insurance requirement",
  "tax guidance",
  "renewal",
  "forms",
];

const DATE_PATTERN = /effective\s+(?:\w+\s+\d{1,2}[,.]?\s*\d{4}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}|\d{4}-\d{2}-\d{2})/i;

function bumpSeverity(severity: Severity): Severity {
  if (severity === "P2") return "P1";
  if (severity === "P1") return "P0";
  return "P0";
}

export function inferSeverity(input: {
  title: string;
  excerpt?: string;
  url?: string;
}): Severity {
  const combined = `${input.title} ${input.excerpt ?? ""}`.toLowerCase();

  let severity: Severity = "P2";

  if (P0_KEYWORDS.some((kw) => combined.includes(kw))) {
    severity = "P0";
  } else if (P1_KEYWORDS.some((kw) => combined.includes(kw))) {
    severity = "P1";
  }

  if (DATE_PATTERN.test(combined)) {
    severity = bumpSeverity(severity);
  }

  return severity;
}

export function inferSeverityWithReason(input: {
  title: string;
  excerpt?: string;
  url?: string;
}): { severity: Severity; matchedKeywords: string[]; bumped: boolean } {
  const combined = `${input.title} ${input.excerpt ?? ""}`.toLowerCase();

  let baseSeverity: Severity = "P2";
  const matchedKeywords: string[] = [];

  for (const kw of P0_KEYWORDS) {
    if (combined.includes(kw)) {
      baseSeverity = "P0";
      matchedKeywords.push(kw);
    }
  }

  if (baseSeverity === "P2") {
    for (const kw of P1_KEYWORDS) {
      if (combined.includes(kw)) {
        baseSeverity = "P1";
        matchedKeywords.push(kw);
      }
    }
  }

  const bumped = DATE_PATTERN.test(combined);
  const finalSeverity = bumped ? bumpSeverity(baseSeverity) : baseSeverity;

  return { severity: finalSeverity, matchedKeywords, bumped };
}
