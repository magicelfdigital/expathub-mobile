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
