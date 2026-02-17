import type { DecisionBrief } from "./decisionBriefs";

export type ValidationResult = {
  valid: boolean;
  warnings: string[];
};

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function validateBrief(brief: DecisionBrief): ValidationResult {
  const warnings: string[] = [];

  const sources = brief.sourceLinks ?? brief.meta?.sourceLinks ?? [];

  if (sources.length === 0) {
    warnings.push("No source links provided. Briefs should cite authoritative sources.");
  } else {
    const officialSources =
      Array.isArray(sources) && sources.length > 0 && typeof sources[0] === "object"
        ? (sources as { type?: string }[]).filter((s) => s.type === "official")
        : (sources as string[]).filter((url) =>
            /\.gov\.|\.gob\.|\.gc\.ca|\.gov\.uk|\.europa\.eu|\.gouv\./i.test(
              typeof url === "string" ? url : ""
            )
          );

    if (officialSources.length === 0) {
      warnings.push(
        "No official government sources found. At least one .gov or ministry source is recommended."
      );
    }
  }

  const metaConfidence = brief.meta?.confidenceLevel;
  if (metaConfidence === "low") {
    warnings.push(
      "Confidence level is low. This brief may contain outdated or inaccurate information."
    );
  }

  const reviewDays = daysSince(brief.lastReviewedAt);
  if (reviewDays > 180) {
    warnings.push(
      `Last reviewed ${reviewDays} days ago (over 6 months). Content may be stale.`
    );
  } else if (reviewDays > 90) {
    warnings.push(
      `Last reviewed ${reviewDays} days ago (over 90 days). Consider scheduling a review.`
    );
  }

  if (!brief.lastReviewedAt || brief.lastReviewedAt.trim() === "") {
    warnings.push("No lastReviewedAt date set. Review date is required.");
  }

  if (!brief.headline || brief.headline.trim() === "") {
    warnings.push("Missing headline.");
  }

  if (!brief.decisionSummary || brief.decisionSummary.trim() === "") {
    warnings.push("Missing decision summary.");
  }

  if (!brief.keyRequirements || brief.keyRequirements.length === 0) {
    warnings.push("No key requirements listed.");
  }

  if (!brief.riskFlags || brief.riskFlags.length === 0) {
    warnings.push("No risk flags listed. Every brief should surface risks.");
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

export function validateAllBriefs(
  briefs: DecisionBrief[]
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();
  for (const brief of briefs) {
    results.set(brief.id, validateBrief(brief));
  }
  return results;
}
