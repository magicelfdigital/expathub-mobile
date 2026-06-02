export type ExtractedBrief = {
  id: string;
  countrySlug: string | null;
  pathwayKey: string | null;
  lastReviewedAt: string;
};

export function extractBriefs(source: string): ExtractedBrief[];
