# ExpatHub Source Monitoring

## How It Works

A lightweight Node.js script (`hash-monitor.mjs`) monitors official government immigration and tax authority websites for content changes.

**Process:**
1. Reads the curated source list from `monitoring/sources.json`
2. Fetches each URL (skipping any with empty URLs)
3. Strips HTML tags, scripts, and styles; normalizes whitespace
4. Computes a SHA-256 hash of the cleaned text
5. Compares against the previous hash stored in `monitoring/state.json`
6. If the hash differs, writes a proposal entry to `monitoring/proposals.json`
7. Updates `state.json` with the new hashes and run timestamp

## GitHub Actions Schedule

The workflow runs automatically:
- **Monday 14:00 UTC** — weekly baseline for all sources
- **Wednesday 14:00 UTC** — mid-week check (covers high-volatility sources)
- **Friday 14:00 UTC** — end-of-week check

Manual runs are also supported via `workflow_dispatch` in the Actions tab.

When changes are detected, the action opens a Pull Request titled **"Monitoring: source changes detected"** containing the updated `state.json` and `proposals.json`.

## What a PR Means

A monitoring PR means one or more official source pages have changed their content since the last run. This does **not** necessarily mean visa rules changed — it could be a cosmetic update, translation change, or site restructuring.

## How to Triage

All detected changes start as **P2 (Informational)** by default. Manually review each proposal:

| Severity | Action |
|----------|--------|
| **P0 (Critical)** | Eligibility, work rights, or income thresholds changed. Update the Decision Brief immediately. |
| **P1 (Material)** | Processing times, fees, or documentation requirements changed. Update within the week. |
| **P2 (Informational)** | Cosmetic or minor changes. Acknowledge and close if no impact. |

**Steps:**
1. Open the PR and review `monitoring/proposals.json`
2. Visit each flagged URL and check what actually changed
3. If decision-impacting: update the relevant Decision Brief data, upgrade the severity in the proposal, and merge
4. If cosmetic: merge the PR to accept the new baseline hashes (so they don't re-trigger)

## Running Locally

```bash
node scripts/monitoring/hash-monitor.mjs
```

No dependencies beyond Node 20's built-in `fetch`, `crypto`, and `fs`.

## Files

| File | Purpose |
|------|---------|
| `monitoring/sources.json` | Curated list of official URLs to monitor |
| `monitoring/state.json` | Last-known SHA-256 hashes per source |
| `monitoring/proposals.json` | Change entries from the most recent run |
| `scripts/monitoring/hash-monitor.mjs` | The monitoring runner script |
| `.github/workflows/monitor-briefs.yml` | GitHub Actions workflow definition |

---

## Analytics Health Probe

In addition to source-content monitoring, this directory also runs an
uptime check against the deployed analytics health endpoint
(`/api/_internal/analytics-health`, defined in `server/routes.ts`).

The probe returns HTTP 503 once the in-process counter of `$identify`
events received without `$anon_distinct_id` is non-zero. A non-zero
count means PostHog can no longer stitch pre-account events to the
post-account user on at least one surface (web, mobile, or a future
entry point), which silently breaks every conversion funnel that
crosses the signup boundary.

**Pipeline:**

1. `.github/workflows/monitor-analytics-health.yml` runs every 15
   minutes (and on manual dispatch).
2. It executes `scripts/monitoring/analytics-health-check.mjs`, which
   reads `monitoring/analytics-health.json` for the endpoint URL,
   fetches it, and exits non-zero on anything other than HTTP 200.
3. On failure the workflow opens (or comments on) a single standing
   GitHub issue labelled `analytics-health` and `alert` so the on-call
   sees one persistent thread per outage rather than a noisy stream.
4. On the next successful run the workflow auto-closes the standing
   issue.

**Run locally** (against any environment):

```bash
ANALYTICS_HEALTH_URL=http://localhost:5000/api/_internal/analytics-health \
  node scripts/monitoring/analytics-health-check.mjs
```

**Clearing the counter:** the counter lives in process memory.
Restarting the backend workflow resets it; the next probe run will
auto-close the alert issue.

**Analytics health files:**

| File | Purpose |
|------|---------|
| `monitoring/analytics-health.json` | Probe config (endpoint URL, expected status, timeout) |
| `monitoring/analytics-health-state.json` | Snapshot of the most recent probe run (written by the script) |
| `scripts/monitoring/analytics-health-check.mjs` | The probe runner |
| `.github/workflows/monitor-analytics-health.yml` | Scheduled probe + issue-management workflow |

## Quarterly freshness check

`freshness-check.mjs` is a separate scheduled job that inspects every entry
in `src/data/decisionBriefs.ts` and flags briefs whose `lastReviewedAt` is
older than 90 days (with a 60-day "approaching" tier). It runs on the 1st of
January, April, July and October at 14:00 UTC via
`.github/workflows/freshness-check.yml`, and opens (or appends to) a tracking
GitHub issue when stale briefs are found.

Run it locally with:

```
node scripts/monitoring/freshness-check.mjs
```

The same report is also surfaced live at `/admin/brief-freshness` (HTML) and
`/api/admin/brief-freshness` (JSON) in the internal admin dashboard.
