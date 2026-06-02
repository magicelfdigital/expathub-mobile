// Single source of truth for Decision Brief freshness thresholds (in days).
//
// This is intentionally a plain ESM module with no React Native / Expo
// imports, so the Node monitoring scripts (scripts/monitoring/freshness-check.mjs)
// can import it directly without pulling in the RN module graph, while the
// in-app validator (src/data/briefValidation.ts) consumes the exact same values.
//
// Change a threshold here once and both the CI checker and the in-app validator
// stay in lockstep. Do not redefine these literals anywhere else.

// Approaching-stale: briefs older than this should be scheduled for a review.
export const WARN_THRESHOLD_DAYS = 60;

// Stale: briefs older than this should be refreshed before the next release.
export const STALE_THRESHOLD_DAYS = 90;

// Release-blocking: briefs older than this hard-fail the freshness gate
// ("over 6 months"). This is the default; it remains overridable at runtime
// via the BRIEF_FRESHNESS_GATE_DAYS environment variable in the CI gate.
export const RELEASE_BLOCK_THRESHOLD_DAYS = 180;
