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

## Restore pre-check failure alert

`billing-precheck-check.mjs` watches the production rate of the
`billing_pre_check_failed` analytics event. That event fires from
`BillingOrchestrator.restore()` (`src/billing/orchestrator.ts`) when **both**
backend entitlement pre-check attempts throw. A sustained rise means the
backend entitlements endpoint is failing and every restore is silently
falling through to the slower RevenueCat path — nobody notices until users
complain that their purchases won't restore.

**Pipeline:**

1. `.github/workflows/monitor-billing-precheck.yml` runs every 15 minutes
   (and on manual dispatch).
2. It executes `scripts/monitoring/billing-precheck-check.mjs`, which queries
   PostHog (HogQL) for the count of `billing_pre_check_failed` events and the
   count of `restore_tapped` events (restore attempts) over the trailing
   window, then evaluates the thresholds.
3. On breach the workflow opens (or comments on) a single standing GitHub
   issue labelled `billing-precheck` and `alert`, so the on-call sees one
   persistent thread per incident.
4. On the next healthy run the workflow auto-closes the standing issue.

**Thresholds** (configured in `monitoring/billing-precheck-alert.json`). The
probe alerts when **either** condition holds over the trailing
`windowMinutes` (default 15):

| Setting | Default | Meaning |
|---------|---------|---------|
| `absoluteThreshold` | `10` | Alert if more than this many `billing_pre_check_failed` events occur in the window. |
| `ratioThreshold` | `0.02` | Alert if failures / restore attempts exceeds this (2%). |
| `ratioMinAttempts` | `20` | The ratio check is only evaluated once at least this many `restore_tapped` events occurred, so a single failure in a quiet window doesn't page anyone. |

**Credentials:** the probe requires the `POSTHOG_PROJECT_ID` and
`POSTHOG_PERSONAL_API_KEY` repository secrets (the same personal API key the
server-side PostHog backfills use). `POSTHOG_HOST` defaults to
`https://us.posthog.com`. If the credentials are absent the probe **skips**
(exits 0) instead of failing, so a fork without PostHog access never opens a
spurious alert. A PostHog query error (unreachable / auth failure) is treated
as a probe failure so the on-call knows the alert itself has gone blind.

**Run locally** (needs PostHog credentials in the environment):

```bash
POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
  node scripts/monitoring/billing-precheck-check.mjs
```

**Billing pre-check files:**

| File | Purpose |
|------|---------|
| `monitoring/billing-precheck-alert.json` | Threshold config (window, absolute + ratio thresholds) |
| `monitoring/billing-precheck-alert-state.json` | Snapshot of the most recent probe run (written by the script) |
| `scripts/monitoring/billing-precheck-check.mjs` | The probe runner |
| `scripts/monitoring/__tests__/billing-precheck-check.test.mjs` | Unit tests for the alert thresholds + PostHog response parsing (network mocked) |
| `.github/workflows/monitor-billing-precheck.yml` | Scheduled probe + issue-management workflow |
| `.github/workflows/monitoring-tests.yml` | Runs the monitoring unit tests on every push / PR |

**Run the tests** (no PostHog credentials needed — the network is mocked):

```bash
node --test scripts/monitoring/__tests__/*.test.mjs
```

## Save-Progress Prompt Health Probe

A second uptime check guards the post-result "save your progress" modal —
the `quiz_save_shown` event with `placement: result_screen` fired from
`app/onboarding/result.tsx` via `src/components/QuizSaveModal.tsx`.

The Jest suite guards the trigger *logic*, but it can't catch a real-world
regression: an analytics misconfiguration, a deploy that breaks the result
screen mount, or a sudden drop in low-readiness traffic. Without this probe
nobody is paged when the prompt goes dark — we'd only notice weeks later in
the dashboard.

The probe (`/api/_internal/quiz-save-prompt-health`, defined in
`server/routes.ts`) reads the locally-persisted `quiz_save_events` table and
compares the most recent *complete* day's `result_screen` impressions against
the trailing 7-day median. It returns HTTP 503 when that day dropped to zero
(`reason: zero_today`) or fell below the median floor
(`reason: below_median_floor`). Evaluating the last complete day (not the
in-progress one) avoids false alarms from a partial day near midnight; a
zero day is only flagged when the trailing median is non-zero, so fresh
installs / no-traffic environments stay healthy (`insufficient_baseline`).

**Pipeline:**

1. `.github/workflows/monitor-quiz-save-prompt.yml` runs hourly (and on
   manual dispatch).
2. It executes `scripts/monitoring/quiz-save-prompt-health-check.mjs`, which
   reads `monitoring/quiz-save-prompt-health.json` for the endpoint URL,
   fetches it, and exits non-zero on anything other than HTTP 200.
3. On failure the workflow opens (or comments on) a single standing GitHub
   issue labelled `quiz-save-prompt` and `alert`.
4. On the next successful run the workflow auto-closes the standing issue.

**Tuning the alert:** all thresholds (the trailing window and the median
floor ratio) live in one place — `QUIZ_SAVE_PROMPT_HEALTH_CONFIG` in
`server/quizSavePromptHealth.ts`.

**Run locally** (against any environment):

```bash
QUIZ_SAVE_PROMPT_HEALTH_URL=http://localhost:5000/api/_internal/quiz-save-prompt-health \
  node scripts/monitoring/quiz-save-prompt-health-check.mjs
```

**Save-progress prompt health files:**

| File | Purpose |
|------|---------|
| `monitoring/quiz-save-prompt-health.json` | Probe config (endpoint URL, expected status, timeout) |
| `monitoring/quiz-save-prompt-health-state.json` | Snapshot of the most recent probe run (written by the script) |
| `scripts/monitoring/quiz-save-prompt-health-check.mjs` | The probe runner |
| `.github/workflows/monitor-quiz-save-prompt.yml` | Scheduled probe + issue-management workflow |
| `server/quizSavePromptHealth.ts` | Health computation + tunable thresholds |

## Weekly freshness check

`freshness-check.mjs` is a separate scheduled job that inspects every entry
in `src/data/decisionBriefs.ts` and flags briefs whose `lastReviewedAt` is
older than 90 days (with a 60-day "approaching" tier). It runs **every Monday
at 14:00 UTC** via `.github/workflows/freshness-check.yml`. The weekly cadence
(rather than quarterly) means a brief that crosses the 90-day line is surfaced
within days, so the periodic manual re-verification sweeps are never silently
missed.

When stale briefs are found the job opens — or updates and comments on — a
single standing GitHub issue labelled `freshness`, titled "Decision Brief
freshness review — stale briefs need re-verification". The issue body lists
each stale brief and how many days overdue it is. When nothing is stale, the
next run auto-closes the standing issue. This keeps one persistent thread per
backlog rather than a new issue every week.

When the repository (or org) secret `FRESHNESS_SLACK_WEBHOOK_URL` is set, the
job also posts the same stale / approaching-stale summary to that Slack
incoming webhook (the workflow passes it to the script as `SLACK_WEBHOOK_URL`).
This uses the identical 90-day stale / 60-day approaching thresholds and fires
whenever either tier has briefs. A Slack outage is logged but never fails the
job, and the webhook is optional — without it the script just skips the
notification. To notify by email instead, point the secret at an email-to-Slack
or inbound-webhook bridge that accepts a `{ "text": "..." }` JSON payload.

Run it locally with:

```
node scripts/monitoring/freshness-check.mjs

# To also exercise the Slack notification path locally:
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/…" \
  node scripts/monitoring/freshness-check.mjs
```

The same report is also surfaced live at `/admin/brief-freshness` (HTML) and
`/api/admin/brief-freshness` (JSON) in the internal admin dashboard.

### Release gate (blocking)

The weekly check above is **advisory only** — it opens an issue but never
fails CI. A separate, stricter **release gate** hard-fails CI when any brief is
older than the gate threshold, so no App Store release ships with badly stale
visa figures.

Run the gate locally with:

```
node scripts/monitoring/freshness-check.mjs --gate
```

It scans every brief and exits non-zero if any `lastReviewedAt` is older than
the threshold (or unparseable). Otherwise it exits 0.

| Tier | Threshold | Behaviour |
|------|-----------|-----------|
| Approaching | > 60 days | Soft warning (weekly standing issue) — never blocks |
| Stale | > 90 days | Soft warning (weekly standing issue) — never blocks |
| **Release gate** | **> 180 days (default)** | **Hard-fails CI on push/PR** |

**Configuring the threshold:** the default is `180` days ("over 6 months",
matching the warning in `src/data/briefValidation.ts`). Override it with the
`BRIEF_FRESHNESS_GATE_DAYS` environment variable (a positive integer number of
days):

```
BRIEF_FRESHNESS_GATE_DAYS=120 node scripts/monitoring/freshness-check.mjs --gate
```

To change the CI threshold, set `BRIEF_FRESHNESS_GATE_DAYS` in the job `env`
block of `.github/workflows/brief-freshness-gate.yml`.

**CI:** `.github/workflows/brief-freshness-gate.yml` runs the gate on every
push and pull request. The 60/90-day soft tiers are printed for context but do
not affect the exit code.
