---
name: Ops health probe pattern
description: How ExpatHub wires "alert when X stops" ops alerts — the probe + GitHub Action standing-issue convention and the gotchas.
---

# Ops health probe pattern

ExpatHub has no PagerDuty/Slack alerting. The established convention for "page
someone when X regresses" is:

1. An **unauthenticated** `/api/_internal/<thing>-health` route in
   `server/routes.ts` that returns **HTTP 200 when healthy, 503 when not**, body
   is a counts-only JSON snapshot (no PII, no Basic Auth — uptime probes can't
   carry it).
2. A poller `scripts/monitoring/<thing>-check.mjs` that reads its endpoint/timeout
   from `monitoring/<thing>.json`, fetches, writes a `*-state.json` snapshot, and
   `process.exit(1)` on anything but 200.
3. A scheduled `.github/workflows/monitor-<thing>.yml` that runs the poller and,
   on failure, opens/comments a **single standing GitHub issue** (labels:
   `<thing>` + `alert`) and auto-closes it on the next healthy run.

Examples in repo: analytics-health (in-process counters), quiz-save-prompt-health
(DB-backed). Copy one of these wholesale for a new probe.

**Why these specific choices:** the 503-on-status-code design means the GitHub
Action fires on a status rule alone — no log parsing. The single-standing-issue
design avoids a noisy stream of issues per outage.

## DB-backed probe gotchas (quiz-save-prompt-health)
- **Evaluate the last *complete* day, not the in-progress one** (`created_at <
  CURRENT_DATE`). A partial day near midnight would otherwise false-alarm.
- **Only flag a zero day when the trailing baseline is non-zero.** A zero median
  means "no traffic / fresh install" → return healthy (`insufficient_baseline`),
  not a page. Both "drop to zero" and "below median floor" alerts require a
  baseline to exist.
- **Zero-fill the daily series in SQL** (generate_series LEFT JOIN) so a fully
  silent day shows as an explicit 0 instead of dropping out of the median/zero
  checks.
- Keep the decision logic pure (`evaluate*(series, config)`) and unit-test it
  without a DB; thresholds live in one exported config constant.
