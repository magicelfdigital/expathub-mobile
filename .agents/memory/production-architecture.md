---
name: ExpatHub production architecture (two separate projects)
description: Why planner saves fail in production — domain points at a different project whose backend lacks /api/progress
---

# ExpatHub production = two separate Replit projects, two backends, two databases

The live setup is NOT a single app. There are (at least) two independent Replit projects:

1. **This repo (`expathub-mobile`, deploys to `git-finish.replit.app`)** — Expo mobile app + a minimal `web/` SPA (title just "ExpatHub") + the FULL Express backend. Its `/api/progress` (GET/POST in `server/routes.ts`) works (returns 401 JSON unauthenticated). GitHub: `magicelfdigital/expathub-mobile`.
2. **`expat-hub-web` project (deploys to `expat-hub-web.replit.app`)** — the PUBLIC marketing website (title "ExpatHub — Decision-Ready Emigration Guides for 11 Countries", a different codebase NOT in this repo) + its OWN backend + its OWN production database. The custom domains **`expathub.website` + `www.expathub.website` are attached to THIS project**, not to `git-finish`.

**Why saves fail in production:** the mobile app's `PROD_BACKEND_URL` = `expathub.website` (baked into the iOS build via `eas.json`). That resolves to the `expat-hub-web` project, whose backend has **auth** (`/api/auth/me` → 401 JSON) but is **missing `/api/progress`** (and `/api/_internal/*-health`, `/api/stripe/config`) — those paths fall through to the SPA and return the HTML page with 200. So login works but checkbox saves silently no-op.

**`server: Google` on Replit deployments is just Replit's hosting (Google Cloud), NOT a separate Google App Engine.** An earlier session mis-read this as App Engine.

**Implications for fixing the save bug:**
- Cannot fix it by editing this repo alone — the route already exists here. The fix must land in the `expat-hub-web` project (add `/api/progress` + planner save + `user_progress` table, using that project's own DB so progress ties to the users who log in there) and republish it. That project is a separate codebase this agent cannot reach from `git-finish`.
- Pointing `expathub.website` at `git-finish` would restore the API but REPLACE the marketing site with the minimal frontend — not acceptable.
- Repointing the mobile app to `git-finish.replit.app` would need a `PROD_BACKEND_URL` change + a new iOS build, and would split user identity/data across two databases.
