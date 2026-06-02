---
name: Expo-web Playwright e2e in this dev container
description: Why the Expo-web e2e specs are hard to run locally and how to run/interpret them
---

# Running the Expo-web Playwright specs locally

The repo has two Playwright targets sharing one `playwright.config.ts` (single chromium
project, no `webServer` block, baseURL from `PLAYWRIGHT_BASE_URL` default `:5000`):

- **Web SPA specs** run against the React+Vite SPA served by `Start Backend` on `:5000`
  (Express proxies Vite in dev). These are fast and stable here.
- **Expo-web specs** (`worksheet-signup-submit`, `delete-account-dialog`,
  `switch-plan-dialog`) need an Expo web server. CI boots `npx expo start --web --port 8081`.
  Run them with `PLAYWRIGHT_EXPO_BASE_URL=http://localhost:8081` (the specs read that env var).
  Do NOT start expo via raw shell — use a workflow so PORT/env are injected.

**Why they are painful to run in this container:**
- These specs set a very large per-assertion timeout (`TEST_TIMEOUT_MS = 180000ms` / 3 min),
  so a single failing visibility check can hang for 3 minutes. A whole run can take many
  minutes — it will blow past the 120s bash cap. Run them in a workflow writing to a
  `/tmp/*.log` file and poll the file, rather than foreground bash.
- The first browser navigation triggers a cold Metro web-bundle compile; once warm,
  `Web Bundled` lines show ~50-60ms.

**Why they fail here even when green in CI:**
- All three are authenticated flows (register → navigate to the account/worksheets screen,
  then assert on `account-active-plan-switch`, `worksheet-row-*`, delete button, etc.).
- Concurrent isolated task-agent merges continuously restart `Start Backend` mid-test, so
  the auth/registration API calls fail intermittently and the authenticated screens never
  render → `toBeVisible` times out, or the element detaches mid-click. This is environment
  churn, not necessarily a product regression. Trust CI's `playwright.yml` for a clean signal.

**How to apply:** When asked to run "all e2e" here, run the web-SPA specs against `:5000`
(reliable) and the Expo-web specs via a dedicated workflow against `:8081`, but report
Expo-web visibility/detach failures as likely environment-churn-induced unless they
reproduce in a quiet window. Confirm any suspected real regression in CI.
