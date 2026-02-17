import type { DecisionBrief, ConfidenceLevel } from "./decisionBriefs";

type DecisionBriefInput = {
  countrySlug: string;
  pathwayKey?: string;

  headline: string;
  decisionSummary: string;

  recommendedFor: string[];
  notRecommendedFor: string[];

  keyRequirements: string[];
  financialReality: string[];
  timelineReality: string[];
  riskFlags: string[];

  commonMistakes: string[];
  betterAlternatives?: string[];

  workReality?: string[];
  familyAndDependents?: string[];
  lifestyleAndCulture?: string[];

  confidenceLevel?: ConfidenceLevel;
  lastReviewedAt?: string;
};

export function buildDecisionBrief(input: DecisionBriefInput): DecisionBrief {
  const idParts = [input.countrySlug];
  if (input.pathwayKey) idParts.push(input.pathwayKey);
  else idParts.push("overview");

  return {
    id: idParts.join("-"),
    countrySlug: input.countrySlug,
    pathwayKey: input.pathwayKey,

    headline: input.headline,
    decisionSummary: input.decisionSummary,

    recommendedFor: input.recommendedFor,
    notRecommendedFor: input.notRecommendedFor,

    keyRequirements: input.keyRequirements,
    financialReality: input.financialReality,
    timelineReality: input.timelineReality,
    riskFlags: input.riskFlags,

    commonMistakes: input.commonMistakes,
    betterAlternatives: input.betterAlternatives,

    workReality: input.workReality ?? [],
    familyAndDependents: input.familyAndDependents ?? [],
    lifestyleAndCulture: input.lifestyleAndCulture ?? [],

    confidenceLevel: input.confidenceLevel ?? "Medium",
    lastReviewedAt: input.lastReviewedAt ?? "2025-02",
  };
}
