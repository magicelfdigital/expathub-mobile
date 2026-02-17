# Decision Brief Trust Model

## Why Freshness Exists

Decision Briefs are the core paid product of ExpatHub. Users rely on them to make life-altering relocation decisions — which visa to pursue, how much money they need, whether they can work legally.

Immigration rules change constantly. A brief that was accurate six months ago may now contain dangerous advice: an income threshold may have doubled, a visa category may have been suspended, or work rights may have been revoked.

The freshness system exists to ensure that every brief sold to a paying user reflects reality, not history.

## Confidence Level

Each brief carries a `confidenceLevel` that reflects how trustworthy its content is right now:

| Level | Meaning |
|-------|---------|
| **high** | Reviewed within the last 90 days. No unresolved P0/P1 changes. Sources verified. |
| **medium** | Reviewed within 6 months, but one or more P1 (material) changes detected and not yet incorporated. Content is mostly reliable but may have stale details. |
| **low** | Review overdue (>6 months), or a P0 (critical) change detected. The brief may contain incorrect eligibility, rights, or financial information. Should not be served without a warning. |

Confidence level is computed from `lastReviewedAt`, the `changeLog`, and source monitoring signals. It is never set manually — it is always derived from the data.

## Severity Levels

Changes detected by the monitoring system are classified into three severity levels:

### P0 — Critical
User-facing legality, eligibility, or rights changed. Examples:
- Visa category suspended or terminated
- Income/asset thresholds changed
- Work authorization rules modified
- Sponsorship requirements altered

**SLA: Review within 48 hours.**

### P1 — Material
Material process, threshold, or timeline change. Examples:
- Processing times changed significantly (>30%)
- Fees changed substantially (>15%)
- New documentation requirements added
- Tax treatment revised

**SLA: Review within 7 days.**

### P2 — Informational
Non-decision-impacting changes. Examples:
- Portal wording or formatting changes
- FAQ updates
- Minor fee adjustments (<15%)
- Link changes without content changes

**SLA: Review within 30 days.**

## How This Protects User Trust

1. **No stale advice sold as current.** The validation system flags briefs with missing sources, low confidence, or overdue reviews before they reach users.

2. **Severity-based triage.** Not every website change matters equally. The P0/P1/P2 system ensures critical changes get immediate attention while informational changes are handled in routine cycles.

3. **Audit trail.** Every change detected and every review completed is logged in the `changeLog`. This creates an auditable history of what changed, when it was caught, and when it was addressed.

4. **Source transparency.** Each brief links to its authoritative sources (`sourceLinks`) so users and reviewers can verify claims independently. Official government sources are required; secondary sources are supplementary.

5. **Review triggers.** Automated rules (`requiresImmediateReview`, `requiresScheduledReview`) ensure no brief goes stale silently. The system flags briefs that need attention based on age, confidence, and detected changes.

## Data Flow

```
Source Monitoring (hash-monitor.mjs)
  → Detects content changes on official URLs
  → Writes proposals with default P2 severity
  → Human triages to P0/P1/P2

Severity Classification
  → P0/P1 changes trigger review rules
  → Confidence level adjusts automatically
  → SLA clock starts

Brief Validation
  → Checks source links, confidence, review dates
  → Produces warnings (not errors — advisory only)
  → Feeds into future UI trust indicators
```

## What This Does NOT Do (Yet)

- Does not auto-update brief content (requires human review)
- Does not block users from seeing stale briefs (UI gating is a future task)
- Does not send notifications when SLAs are breached
- Does not integrate with the monitoring agent framework directly (Task C/E)

These capabilities will be layered on top of this foundation.
