---
name: Planner step saves require a backend user, not just paid status
description: Why a paid user can see the planner tracker but tapping steps does nothing
---

# Planner saves need a backend session, paid status is not enough

Two independent gates govern the "Your Plan" tracker:

- **Paid/visible**: `isPaidUser = hasActiveSubscription || hasFullAccess` from the
  entitlement/RevenueCat layer. On iOS this is RevenueCat-backed and persists
  independently of any backend login. When true, step checkboxes render
  interactive (no lock) and tapping calls `toggleStep`.
- **Saveable**: `useProgress` gates both the GET query and `setStep`/`toggleStep`
  on `enabled = !!user && !!countrySlug`, where `user` comes from `AuthContext`
  (a valid JWT validated against the backend at app start via `/api/auth/me`).

## The gotcha
A user can be paid (RevenueCat) but have **no backend `user`** (skipped account,
or the stored JWT failed `/api/auth/me`). Then: the tracker is visible and
checkboxes look tappable, but `setStep` hits `if (!enabled) return` and silently
no-ops — "nothing happens" with no error. If `user` IS present, taps fire a POST
to `/api/progress` and optimistically check; a failing POST reverts (a brief
check then uncheck).

## Diagnosis tips
- If the tracker shows a non-zero "N of 10" from real server data, the GET ran,
  so `user` WAS valid at load (enabled true) → suspect the POST/backend, not the
  no-op path.
- TestFlight talks to the **production** backend baked into `eas.json`
  (`EXPO_PUBLIC_BACKEND_URL` / `EXPO_PUBLIC_DOMAIN` = `https://www.expathub.website`),
  which is NOT the Replit dev server and has no Replit deployment logs.

## Verified failure mode: stale prod deploy missing newer /api routes
The live `expathub.website` host (served via Google Frontend; GoDaddy is only the
domain registrar) runs an **older** backend build that predates the planner
feature. A `curl` shows the parity gap clearly:
- `/api/auth/me` → 401 **JSON** (auth routes exist) ✓
- `/api/progress` (GET and POST) → **200 text/html** — the request falls through
  to the SPA `index.html` because the route isn't registered ✗
- `/api/_internal/analytics-health` → 200 text/html (also missing) ✗

Because POST returns `200 text/html`, the client's `if (!res.ok)` check passes,
then `res.json()` throws on HTML → `onError` reverts the optimistic check →
"tapping the checkbox does nothing." The app/server code in this repo is correct
(`localhost:5000/api/progress` returns 401 JSON); the fix is purely
**redeploying the current backend to whatever hosts `expathub.website`** — not an
app-code change, and not doable from Replit.

**Quick parity probe:** curl a known-newer route on prod; JSON = current code,
HTML/404 = stale deploy. (A second host, `expathub.world` on Vercel, also lacks
`/api/progress` → 404.)
