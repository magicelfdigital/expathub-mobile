import type { ExtractedBrief } from "../../src/data/extractBriefs.d.mts";

// Re-exported from the shared parser (src/data/extractBriefs.mjs) so the cron
// job and the admin freshness dashboard parse the BRIEFS array identically.
export function extractBriefs(source: string): ExtractedBrief[];
