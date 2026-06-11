# ExpatHub — Replit Agent Guide

## Overview

ExpatHub is a mobile-first app helping people plan and execute international relocation: country-specific guides, visa pathway analysis, official resources, vendor directories, and community connections across 11 decision-ready countries. It is intentionally curated — not a global encyclopedia — with a calm, advisory tone throughout.

**Company:** MagicElfDigital LLC · **Support:** support@expathub.website · **Version:** 1.5.1

---

## User Preferences

Preferred communication style: Simple, everyday language.

Git sync workflow: The user builds with `eas build` from a local Windows checkout and syncs code via git. The main agent cannot perform git fetch/push directly (blocked). Whenever there are committed changes to bring over — especially iOS version/build bumps in `app.json` — automatically push them to GitHub `origin/main` via a background task (do not ask first), so the user can `git pull` locally and rebuild. Do not make the user hand-edit files or run manual git steps.

---

## Critical Constraints for Replit Agents

Always observe these when writing or modifying code:

1. **Do not touch entitlement or billing logic** unless the task explicitly requires it. Protected files: `src/contexts/EntitlementContext.tsx`, `src/contexts/entitlementDerivation.ts`, `src/billing/entitlementGate.ts`, `src/config/subscription.ts`, `src/subscriptions/revenuecat.ts`, `src/subscriptions/stripeWeb.ts`, `contexts/SubscriptionContext.tsx`.
2. **Monetization model:** two subscriptions only — Monthly Explorer and Annual Pathfinder (details under [Monetization](#monetization)). Single entitlement ID `full_access_subscription`. No Decision Pass, no Country Lifetime Unlock, no 48h reverse trial, no exit/win-back offer — do not add, reference, or restore any retired product.
3. **Country count is 11.** Canonical list is `LAUNCH_COUNTRIES` in `src/config/subscription.ts`. Do not hardcode a different list anywhere.
4. **Planner progress is server-backed** via the PostgreSQL `user_progress` table. Do not move it to AsyncStorage or add a local-only storage path.
5. **Tone:** no exclamation marks, no urgency language. Calm, advisory register.
6. **Design tokens:** use `theme/tokens.ts` values. No hardcoded colours, spacing, or font sizes.
7. **Legal URLs:** Privacy `https://www.expathub.website/privacy`, Terms `https://www.expathub.website/terms`. Do not use any other URLs for these.

---

## System Architecture

### Frontend

- **Stack:** Expo SDK 54 / React Native 0.81 / React 19.1; `expo-router` v6 (file-based routing).
- **State:** React Context for global state, React Query for server data. Persistence via `@react-native-async-storage/async-storage`; secure storage via `expo-secure-store` (native only).
- **UI:** Custom component library on a design-token system — no external UI libraries, all `StyleSheet.create`. Fonts: Lora (headlines), DM Sans (UI). Icons: Ionicons from `@expo/vector-icons` (no emojis).
- **Navigation:** Tabs (Home, Explore, Community, Countries) with stack navigators; subscription flow is a modal.
- **Auth:** JWT via `AuthContext`; token in `expo-secure-store` (native) or `AsyncStorage` (web).

### Key Features

- **Planner:** see [Planner Architecture](#planner-architecture). Surfaced from the home tab and country dashboard; switch/reset the active plan from the account screen.
- **Country bookmarks & shortlist:** bookmark countries (1 limit for free users), with per-country freeform **move notes** on the shortlist (Pro-only).
- **Relocation Readiness Assessment:** onboarding quiz with weighted country-matching scores, in-flow account creation, and country-interest notification. Result screen uses tap-to-reveal pills (critical/moderate/explore); each blocker opens in a bottom-sheet modal linking to the matching worksheet.
- **Worksheets (Pro):** 8 self-assessment worksheets (one per quiz dimension) at `/(tabs)/(home)/worksheets`. Submitting replaces that dimension's blocker score and recomputes readiness. Public list with completion status; paywall on submission. Tables: `worksheet_definitions`, `user_worksheet_responses`.
- **Country comparison matrix:** 14 rows, 4 free.
- **Resources:** tagged OFFICIAL / AUTHORITATIVE / COMMUNITY; bookmarkable per country.
- **ProPaywall:** modal with contextual value props, plan options, FAQ tab, sticky CTA; pricing from RevenueCat; personalized with the user's top country and name from AsyncStorage.
- **Web LockedSection:** masked blur preview of Pro content with lock-overlay card and CTA.
- **Other:** Coming Soon + waitlist (backend-integrated), eligibility snapshot (bracket-based, local), LifetimeOfferBanner (after 2+ planner steps), Continue / Last Viewed, About page, Reset Password, account deletion.
- **Growth:** A/B pricing variants; Meta SDK + Pixel funnel events.

### Backend

- **Runtime:** Node.js + TypeScript, Express v5 (port 5000). Routes under `/api`.
- **Data storage:** `IStorage` interface (in-memory or PostgreSQL, Neon-backed via Drizzle ORM).
- **Web hosting:** Express serves the static built React+Vite SPA in production; proxies to the Vite dev server in development.
- **Admin tooling** (Basic-Auth via `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`):
  - `/admin` — index of internal tools.
  - `/admin/planner-analytics` (+ JSON) — planner funnel from `user_progress`: completion per step, % reaching 100%, median days to complete, drop-off by stage, per-country, weekly trends. Note: dwell-time on `planner_step_collapsed` must filter `bounced = false`.
  - `/admin/quiz-save-analytics` (+ JSON) — save-modal impressions/submissions/dismissals/recovery by surface (web vs mobile), 8-week chart; `?days=N` (default 30, clamped 1–365).
  - `/admin/brief-freshness` (+ JSON) — per-brief `lastReviewedAt` age, stale (>90d) / approaching (>60d) badges. Backed by `server/briefFreshness.ts` (parses `src/data/decisionBriefs.ts` statically).
  - `/api/admin/ab-results` (JSON) — A/B variant performance.
- **Ops health probes:** unauthenticated `/api/_internal/*-health` (200 healthy / 503 unhealthy), polled by scheduled GitHub Actions that open one standing GitHub issue per outage.
  - `/api/_internal/analytics-health` — in-process count of `$identify` events missing `$anon_distinct_id` (PostHog stitching); every 15 min.
  - `/api/_internal/quiz-save-prompt-health` — DB-backed guard on the result-screen save modal; 503 when the most recent complete day's `quiz_save_shown` count drops to zero or below the trailing 7-day median floor; hourly. Logic + thresholds (`QUIZ_SAVE_PROMPT_HEALTH_CONFIG`) in `server/quizSavePromptHealth.ts`.

### Web Frontend (`web/`)

- **Stack:** React 19, Vite 6, TypeScript, Tailwind v4; `react-router-dom` v7. Hosted at expathub.website. Brand palette/fonts exposed as Tailwind `@theme` tokens.
- **Quiz funnel** (`web/src/pages/Start.tsx`): 5-question quiz mirroring the mobile readiness check, persisted to localStorage. After Q5, if 3+ "no" answers, surfaces `QuizSaveModal` — a soft email capture writing to `quiz_leads` (`source: "web_funnel_save"`) and firing `quiz_save_shown` / `_submitted` / `_dismissed`.
- **Legal pages:** Privacy and Terms (URLs in Constraints).
- **API client:** `web/src/lib/api.ts` for `/api/auth/*`, `/api/stripe/*`.

### Database

- **ORM:** Drizzle ORM for PostgreSQL (Neon). Schema in `shared/schema.ts` (users, leads, country interest, waitlist, planner progress).
- **`user_progress` table:** per-user, per-country step completion state.

---

## Production Deployment Topology

Production is **not a single deployment.** There are two independent Replit projects, and the custom domain points at the one that does **not** contain this repo's backend.

- **This repo** (`magicelfdigital/expathub-mobile`) — the Expo app + a minimal `web/` SPA + the full Express backend (`server/`). Deploys to `git-finish.replit.app`. Its `server/routes.ts` implements the complete API, including the planner progress endpoints.
- **`expat-hub-web` project** — a *separate codebase, not in this repo*. Serves the public site and has its **own** Express backend (separate from this repo's `git-finish` backend) and its **own** production Postgres database. The custom domains **`www.expathub.website` and `expathub.website` are attached to THIS project**, not `git-finish`.

**Shared production database and entitlements:** the `expat-hub-web` project is the single shared production authority for **both** the iOS app and the public website. They all point at `https://www.expathub.website`, so they share one set of user accounts, authentication, **entitlements** (subscription / Pro access), and the production **database** (users plus planner progress in `user_progress`). "Own database" above means separate from this repo's `git-finish` database — not separate per client. There is one production data + entitlement source of truth, and it lives in `expat-hub-web`.

**Where clients go:** the mobile app's production backend is `https://www.expathub.website` (`PROD_BACKEND_URL` in `src/billing/backendClient.ts`, mirrored in `eas.json`). So every production API call from iOS hits the **`expat-hub-web`** backend.

**Auth & entitlement authority:** this repo's server proxies auth, account, entitlements, analytics, and password flows to `https://www.expathub.website` (`AUTH_API_URL` / `PASSWORD_API_URL`, hardcoded in `server/routes.ts`). Entitlements are backend-authoritative and resolve against that shared backend, so Pro access is consistent across iOS and web. Progress rows are keyed by the `user.id` that backend returns (`getUserIdFromToken`).

**Resolved save bug (2026-06-06):** the `expat-hub-web` backend implemented auth but was **missing** `/api/progress` and `/api/progress/percent` — they fell through to the SPA catch-all and returned HTML 200, so iOS planner saves silently no-opped. The endpoints were added there (own DB, keyed on its authenticated `user.id`) and deployed; verification against `www.expathub.website` confirms all three return JSON `401` unauthenticated while a control bogus `/api/*` route still returns HTML 200. No iOS rebuild was needed. Spec: `.local/handoff/web-save-service-spec.md`.

**Hosting note:** Replit Autoscale sits behind Google Cloud, so a `server: Google` response header is just Replit's hosting — not a separate Google App Engine backend.

**Doc drift:** `PRD.md`, `docs/architecture.md`, and `docs/web-auth-purchase-spec.md` still describe the auth API as `expathub.world`. Live code points at `www.expathub.website`; treat `expathub.world` references as historical unless re-verified.

---

## Monetization

**Billing is handled by two services, split by platform:** **RevenueCat** processes in-app purchases on iOS, and **Stripe** processes payments on the web. Both feed the same backend-authoritative entitlement (`full_access_subscription`), so Pro access is consistent regardless of where the user subscribed.

Two paid subscription tiers (values confirmed from `src/config/subscription.ts`). Country Lifetime Unlock, Decision Pass, the 48h reverse trial, and the exit/win-back offer are fully retired and removed.

| Tier | Price | Trial | iOS Product ID | Android Product ID |
|------|-------|-------|----------------|--------------------|
| Monthly Explorer | $14.99/mo | 14 days | `monthly_subscription_all_access` | `expathub_pro_monthly:monthly` |
| Annual Pathfinder | $89/yr | 14 days | `ExpatHub_pathfinder` | `expathub_pathfinder:pathfinder` |

- **Entitlement:** `full_access_subscription` (constant `ENTITLEMENT_FULL_ACCESS`) — active subscription, either tier.
- **Access logic (`EntitlementContext`):** `hasFullAccess` (active subscription), `hasProAccess` (any paid access); `accessType` ∈ {`subscription`, `sandbox`, `none`}; `source` ∈ {`revenuecat`, `stripe`, `sandbox`, `none`}.
- **Payments:** iOS via RevenueCat (`EXPO_PUBLIC_RC_IOS_KEY`); web via Stripe Checkout / Customer Portal (`STRIPE_SECRET_KEY`). Stripe checkout: `createCheckoutSession(plan: "monthly" | "annual")` in `src/subscriptions/stripeWeb.ts`, using `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID`.
- **Restore Purchases:** waits for backend confirmation before declaring success.

---

## Supported Countries

Confirmed from `LAUNCH_COUNTRIES` in `src/config/subscription.ts`.

**Decision-Ready (11):** Portugal, Spain, Malta, United Kingdom, Germany, Ireland (Europe); Canada (North America); Costa Rica, Panama (Central America); Ecuador (South America); Australia (Oceania). Slugs are the lowercase hyphenated names (e.g. `costa-rica`, `united-kingdom`).

**Coming Soon (5, with waitlist):** France, Italy, Thailand, Mexico, New Zealand.

---

## Planner Architecture

Both layers are defined in `src/data/planSteps.ts`. Progress is stored in the server-backed `user_progress` table and shown on the account screen, where users can switch or reset their active plan.

**1. Structured 6-step planner (`PLAN_STEPS`)** — the detailed guided flow per country:

1. `confirm_pathway` — Confirm Your Legal Pathway
2. `validate_finances` — Validate Financial Requirements
3. `prepare_docs` — Prepare Core Documentation
4. `execute_residency` — Execute the Residency Process
5. `register_local` — Register and Activate Local Systems
6. `post_arrival` — Post-Arrival Compliance

Step 3 has per-country checklists for all 11 countries, split into "For your visa application" and "For your arrival", with `DEFAULT_STEP3_CHECKLIST` as fallback.

**2. Generic progress tracker (`GENERIC_PLAN_STEPS`)** — 10 milestones across 4 stages:

- **Research:** take the readiness quiz, build your shortlist
- **Visa & Legal:** identify a visa pathway, submit your visa application
- **Money & Tax:** review your finances, plan your tax strategy
- **Logistics & Move:** research housing, research schools, book your flight, set your move date

---

## Data Layer

Core content is static TypeScript, not database records.

| File | Content |
|------|---------|
| `data/countries.ts` | All countries across regions |
| `data/pathways.ts` | Visa routes per country |
| `data/resources.ts` | Official government links |
| `data/vendors.ts` | Service provider listings |
| `data/community.ts` | Expat group links |
| `data/glossary.ts` | Immigration terminology |
| `data/passportNotes.ts` | Nationality notes (7 passport types: US, UK, CA, AU, EU, JP, CR) |
| `src/data/decisionBriefs.ts` | Premium Decision Briefs |
| `src/data/compareMatrix.ts` | Country comparison data |
| `src/data/coverage.ts` | Coverage status per country/section |
| `src/data/planSteps.ts` | Planner steps, checklists, generic progress steps |
| `src/data/pro-offer.ts` | Upsell messaging and value props |
| `src/config/subscription.ts` | Product/entitlement IDs, prices, trial, launch countries |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat iOS API key |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat Android key (present, but Android billing not active) |
| `EXPO_PUBLIC_RC_MONTHLY_PRODUCT` | Override for monthly product ID (default iOS: `monthly_subscription_all_access`) |
| `EXPO_PUBLIC_RC_ANNUAL_PRODUCT` | Override for annual product ID (default iOS: `ExpatHub_pathfinder`) |
| `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Stripe price ID, monthly |
| `EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID` | Stripe price ID, annual |
| `SESSION_SECRET` | Express session signing key |
| `STRIPE_SECRET_KEY` | Stripe API key (web payments) |
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `PASSWORD_API_URL` | Password-reset API base (`www.expathub.website`) |
| `EXPO_PUBLIC_AUTH_API_URL` | Historical auth API base (`www.expathub.world`). Not referenced by current `app/` or `src/` code — the server proxies auth/password to `www.expathub.website` via `AUTH_API_URL` / `PASSWORD_API_URL`, hardcoded in `server/routes.ts`. |
| `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS` | Admin dashboard credentials |

---

## Build & Development

| Command | Purpose | Port |
|---------|---------|------|
| `npm run expo:dev` | Expo dev server with HMR | 8081 |
| `npm run server:dev` | Express backend | 5000 |

**Build pipeline:** EAS Build + EAS Submit. **Current build:** 108 (v1.5.1). **iOS:** live in the App Store.

---

## Automated Testing

- **Mobile (Jest):** real screen-mount tests (account, planner, quiz, result), `useProgress` hook tests, and pure entitlement-derivation tests (`src/contexts/__tests__/entitlementDerivation.test.ts`).
- **One-command runner:** `npm run test:all` runs Jest first, then the two Playwright phases concurrently — the web-SPA phase (`vite build` + Express on :5000, `locked-section`) and the Expo-web worksheet phase (`expo start --web` on :8081, `worksheet-signup-submit`). Phase logs go to `server.log` / `expo.log`; a non-zero exit from either phase fails the run. Mirrors the `jest.yml` + `playwright.yml` CI jobs.
- **Web e2e (Playwright):** `tests/e2e/locked-section.spec.ts` against the SPA at :5000 (`PLAYWRIGHT_BASE_URL`); `tests/e2e/worksheet-signup-submit.spec.ts` covers anonymous → register → fill → submit against Expo web at :8081 (`PLAYWRIGHT_EXPO_BASE_URL`). Config: `playwright.config.ts`.
- **CI gates** (`.github/workflows/`):
  - `jest.yml` — `npx jest --ci` then `npm run test:scripts` (the `node:test` suite for the `.mjs` monitoring scripts, covering the release-gate helpers in `scripts/monitoring/freshness-check.mjs`).
  - `brief-freshness-gate.yml` — `freshness-check.mjs --gate`; hard-fails when any Decision Brief's `lastReviewedAt` exceeds the release threshold (default 180 days, configurable via `BRIEF_FRESHNESS_GATE_DAYS`). The soft 60/90-day tiers (weekly standing issue from `freshness-check.yml`) stay non-blocking.
  - `playwright.yml` — `conversion-lifts` (SPA on :5000, `locked-section`) and `worksheet-signup` (Expo web on :8081, `worksheet-signup-submit`). Failures upload logs + reports as artifacts.
- Meta Pixel event verification checklist is enforced as a CI check.

---

## External Dependencies

- **Core:** Expo SDK 54, React Native 0.81, React 19.1; Express v5, Node.js, TypeScript.
- **Database:** PostgreSQL (Neon), Drizzle ORM.
- **State/data:** `@tanstack/react-query`, `@react-native-async-storage/async-storage`.
- **Navigation/UI:** `expo-router`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, `@expo/vector-icons`, `expo-web-browser`, `@expo-google-fonts/lora`, `@expo-google-fonts/dm-sans`.
- **Payments:** `react-native-purchases` (RevenueCat, iOS only), Stripe API (web only).
- **Analytics:** `posthog-react-native`, Meta SDK + Pixel.
