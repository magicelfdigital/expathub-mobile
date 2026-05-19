# ExpatHub — Replit Agent Guide

## Overview

ExpatHub is a mobile-first application helping people plan and execute international relocation. It provides country-specific guides, visa pathway analysis, official resources, vendor directories, and community connections across 11 decision-ready countries. The platform is intentionally curated — not a global encyclopedia — with a calm, advisory tone throughout.

**Company:** MagicElfDigital LLC
**Support:** support@expathub.website
**Current version:** 1.4.1.1

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend

- **Framework:** Expo SDK 54 / React Native 0.81 / React 19.1
- **Routing:** `expo-router` v6 (file-based routing)
- **State management:** React Context for global state, React Query for server data
- **Persistence:** `@react-native-async-storage/async-storage`
- **Secure storage:** `expo-secure-store` (native only)
- **UI:** Custom component library using a defined design token system. No external UI libraries. All components use `StyleSheet.create`.
- **Fonts:** Lora (headlines), DM Sans (UI text)
- **Icons:** Ionicons from `@expo/vector-icons` — no emojis
- **Navigation:** Tab-based layout (Home, Explore, Community, Countries) with stack navigators. Subscription flow is a modal.
- **Authentication:** JWT-based via `AuthContext`. Token stored in `expo-secure-store` (native) or `AsyncStorage` (web).

### Key Features

- **Subscription model:** Two paid tiers — Monthly Explorer and Annual Pathfinder — managed via RevenueCat (iOS) and Stripe (web). Entitlements are backend-authoritative. Country Lifetime and Decision Pass products have been retired and removed from the codebase.
- **Planner layer:** A 10-step generic relocation planner per country for paid users. Steps are managed via `src/data/planSteps.ts` and user progress is stored in a PostgreSQL `user_progress` table. Planner is surfaced from the home tab and country dashboard. Users can switch or reset their active plan from the account screen.
- **Country bookmarks and shortlist:** Users can bookmark countries (1 limit for free users).
- **Move notes:** Per-country freeform notes on the shortlist screen (Pro-only).
- **Source badge classification:** Resources are tagged as OFFICIAL, AUTHORITATIVE, or COMMUNITY.
- **Coming Soon + waitlist:** Feature for upcoming countries with backend integration.
- **Relocation Readiness Assessment:** Onboarding quiz with weighted scoring for country matching, account creation in flow, tailored country results, and country-interest notification. Result screen uses tap-to-reveal pills (critical/moderate/explore) and opens individual blockers in a bottom-sheet modal with a direct link to the matching worksheet.
- **Worksheets (Pro):** 8 self-assessment worksheets (one per quiz dimension) at `/(tabs)/(home)/worksheets`. Submitting a worksheet replaces that dimension's blocker score and recomputes the user's readiness. Public list with completion status; paywall on individual worksheet submission. Backed by `worksheet_definitions` and `user_worksheet_responses` Postgres tables.
- **Country comparison matrix:** 14 comparison rows, with 4 accessible to free users.
- **Eligibility snapshot:** Bracket-based, stored locally.
- **LifetimeOfferBanner:** Shown after 2+ planner steps completed.
- **About page, Reset Password flow, Account deletion.**
- **Continue / Last Viewed:** Persists user's last viewed content.
- **Saved Resources:** Bookmark resources per country.
- **ProPaywall:** Modal with contextual value propositions, plan options, FAQ tab, and sticky CTA. Pricing from RevenueCat. Personalized with user's top country and name from AsyncStorage.
- **Web LockedSection blur previews:** Masked preview of Pro content with lock-overlay card and CTA.
- **48h reverse trial (mobile):** Grants temporary full access on paywall dismissal, managed via `EntitlementContext` and `AsyncStorage`. Expiry triggers a modal. Controlled by `REVERSE_TRIAL_DURATION_MS = 48 * 60 * 60 * 1000` in `EntitlementContext`.
- **Exit offer (50% off × 3 months):** Backend eligibility check, applied via Stripe. Presented in web and mobile cancellation flows.
- **A/B testing:** Pricing variants.
- **Meta tracking:** SDK + Pixel funnel events.

### Backend

- **Runtime:** Node.js with TypeScript and Express v5 (port 5000)
- **API structure:** Routes under `/api` prefix for data and authentication
- **Data storage:** `IStorage` interface, supporting in-memory and PostgreSQL (Neon-backed via Drizzle ORM)
- **Web frontend hosting:** Express serves static built React+Vite SPA for production; proxies to Vite dev server for development
- **Internal admin tooling:** Basic-Auth-protected dashboards (`ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`):
  - `/admin` — index page linking to all internal tools
  - `/admin/planner-analytics` (HTML) and `/api/admin/planner-analytics` (JSON) — planner completion rate per step, % of plans reaching 100%, median days from start to completion, drop-off by stage, per-country breakdown, weekly trends. Metrics derived from `user_progress` table. The HTML view includes a "Data quality notes" section reminding analysts that dwell-time insights on `planner_step_collapsed` must filter `bounced = false` (see bounce flag note below).
  - `/admin/quiz-save-analytics` (HTML) and `/api/admin/quiz-save-analytics` (JSON) — impressions / submissions / dismissals / recovery rate for the save-your-progress modal, split by surface (web vs mobile), with 8-week chart. Configurable via `?days=N` (default 30, clamped 1–365).
  - `/admin/brief-freshness` (HTML) and `/api/admin/brief-freshness` (JSON) — per-brief `lastReviewedAt` age with stale (>90 days) and approaching-stale (>60 days) badges. Backed by `server/briefFreshness.ts`, which parses `src/data/decisionBriefs.ts` statically.
  - `/api/admin/ab-results` (JSON) — A/B test variant performance

### Web Frontend (`web/`)

- **Framework:** React 19, Vite 6, TypeScript, Tailwind v4
- **Routing:** `react-router-dom` v7 with shared layout
- **Hosted at:** expathub.website
- **Design tokens:** Brand palette and fonts exposed as Tailwind `@theme` tokens
- **Quiz funnel** (`web/src/pages/Start.tsx`): 5-question quiz mirroring the mobile readiness check. Persists to localStorage so refresh resumes. After Q5, if 3+ "no" answers were given, surfaces `QuizSaveModal` — a soft email-capture prompt that writes to `quiz_leads` with `source: "web_funnel_save"` and fires `quiz_save_shown` / `quiz_save_submitted` / `quiz_save_dismissed` analytics.
- **Legal pages:** React pages for Privacy (`https://www.expathub.website/privacy`) and Terms (`https://www.expathub.website/terms`).
- **API client:** `web/src/lib/api.ts` for interacting with `/api/auth/*`, `/api/stripe/*`.

### Database

- **ORM:** Drizzle ORM configured for PostgreSQL (Neon)
- **Schema:** `shared/schema.ts` for user data, leads, country interest, waitlist, and planner progress
- **Planner progress table:** `user_progress` — stores per-user, per-country step completion state

---

## Monetization

Two paid subscription tiers. Country Lifetime Unlock and Decision Pass have been fully retired and removed from the codebase. All values below are confirmed from `src/config/subscription.ts`.

| Tier | Price | Trial | RevenueCat Product ID (iOS) | RevenueCat Product ID (Android) |
|------|-------|-------|-----------------------------|---------------------------------|
| Monthly Explorer | $14.99/mo | 14 days | `monthly_subscription_all_access` | `expathub_pro_monthly:monthly` |
| Annual Pathfinder | $89/yr | 14 days | `ExpatHub_pathfinder` | `expathub_pathfinder:pathfinder` |

**RevenueCat entitlement:**

| Entitlement ID | Constant | Meaning |
|----------------|----------|---------|
| `full_access_subscription` | `ENTITLEMENT_FULL_ACCESS` | Active subscription (either tier) |

**Access logic (from `EntitlementContext`):**
- `hasFullAccess` — active subscription OR active 48h reverse trial
- `hasProAccess` — any paid access
- `accessType` values: `subscription`, `sandbox`, `none`, `reverse_trial`
- `source` values: `revenuecat`, `stripe`, `sandbox`, `none`, `reverse_trial`

**Stripe (web):**
- Monthly: `STRIPE_MONTHLY_PRICE_ID` (env: `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID`)
- Annual: `STRIPE_ANNUAL_PRICE_ID` (env: `EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID`)
- Checkout: `createCheckoutSession(plan: "monthly" | "annual")` in `src/subscriptions/stripeWeb.ts`

**Payment processing:**

| Platform | Provider | Key |
|----------|----------|-----|
| iOS | RevenueCat | `EXPO_PUBLIC_RC_IOS_KEY` |
| Web | Stripe Checkout / Customer Portal | `STRIPE_SECRET_KEY` |

**Restore Purchases:** Waits for backend confirmation before declaring success.

---

## Supported Countries

Confirmed from `LAUNCH_COUNTRIES` in `src/config/subscription.ts`.

### Decision-Ready (11)

| Country | Slug | Region |
|---------|------|--------|
| Portugal | `portugal` | Europe |
| Spain | `spain` | Europe |
| Canada | `canada` | North America |
| Costa Rica | `costa-rica` | Central America |
| Panama | `panama` | Central America |
| Ecuador | `ecuador` | South America |
| Malta | `malta` | Europe |
| United Kingdom | `united-kingdom` | Europe |
| Germany | `germany` | Europe |
| Ireland | `ireland` | Europe |
| Australia | `australia` | Oceania |

### Coming Soon (5, with waitlist)

France, Italy, Thailand, Mexico, New Zealand

---

## Planner Architecture

The planner uses two layers, both defined in `src/data/planSteps.ts`:

**1. Structured 6-step planner (`PLAN_STEPS`)** — the detailed guided flow per country:

| # | ID | Title |
|---|----|-------|
| 1 | `confirm_pathway` | Confirm Your Legal Pathway |
| 2 | `validate_finances` | Validate Financial Requirements |
| 3 | `prepare_docs` | Prepare Core Documentation |
| 4 | `execute_residency` | Execute the Residency Process |
| 5 | `register_local` | Register and Activate Local Systems |
| 6 | `post_arrival` | Post-Arrival Compliance |

Step 3 has per-country checklists for all 11 countries, with items split into two groups: "For your visa application" and "For your arrival". A `DEFAULT_STEP3_CHECKLIST` is used as fallback.

**2. Generic progress tracker (`GENERIC_PLAN_STEPS`)** — broader milestone tracking across 4 stages:

| Stage | Steps |
|-------|-------|
| Research | Take the readiness quiz, Build your shortlist |
| Visa & Legal | Identify a visa pathway, Submit your visa application |
| Money & Tax | Review your finances, Plan your tax strategy |
| Logistics & Move | Research housing, Research schools, Book your flight, Set your move date |

**Progress storage:** PostgreSQL `user_progress` table (server-backed). Users can switch or reset their active plan from the account screen. Plan progress is also visible on the account screen.

---

## Data Layer

Core content is stored as static TypeScript files — not database records.

| File | Content |
|------|---------|
| `data/countries.ts` | All countries across regions |
| `data/pathways.ts` | Visa routes per country |
| `data/resources.ts` | Official government links |
| `data/vendors.ts` | Service provider listings |
| `data/community.ts` | Expat group links |
| `data/glossary.ts` | Immigration terminology |
| `data/passportNotes.ts` | Nationality-specific notes (7 passport types: US, UK, CA, AU, EU, JP, CR) |
| `src/data/decisionBriefs.ts` | Premium Decision Briefs |
| `src/data/compareMatrix.ts` | Country comparison data |
| `src/data/coverage.ts` | Coverage status per country/section |
| `src/data/planSteps.ts` | Planner steps, checklists, and generic progress steps |
| `src/data/pro-offer.ts` | Upsell messaging and value props |
| `src/config/subscription.ts` | Product IDs, entitlement IDs, prices, trial duration, launch countries |

---

## Critical Constraints for Replit Agents

When writing or modifying code, always observe these constraints:

1. **Do not touch entitlement or billing logic** unless the task explicitly requires it. Files to treat as protected: `src/contexts/EntitlementContext.tsx`, `src/contexts/entitlementDerivation.ts`, `src/billing/entitlementGate.ts`, `src/config/subscription.ts`, `src/subscriptions/revenuecat.ts`, `src/subscriptions/stripeWeb.ts`, `contexts/SubscriptionContext.tsx`.

2. **Monetization model:** Two subscriptions only — Monthly Explorer (iOS `monthly_subscription_all_access`, $14.99/mo, 14-day trial) and Annual Pathfinder (iOS `ExpatHub_pathfinder`, $89/yr, 14-day trial). Single entitlement ID: `full_access_subscription`. No Decision Pass. No Country Lifetime Unlock. Do not add, reference, or restore any retired products.

3. **Country count is 11.** The canonical list is `LAUNCH_COUNTRIES` in `src/config/subscription.ts`. Do not hardcode a different list anywhere.

4. **Planner progress is server-backed** via the PostgreSQL `user_progress` table. Do not move planner progress to AsyncStorage or introduce a local-only storage path for it.

5. **Tone:** No exclamation marks. No urgency language. Calm, advisory register throughout.

6. **Design tokens:** Use `theme/tokens.ts` values. Do not introduce hardcoded colours, spacing, or font sizes.

7. **Legal URLs:** Privacy policy is `https://www.expathub.website/privacy`. Terms are `https://www.expathub.website/terms`. Do not use any other URLs for these.

---

## External Dependencies

### Core Runtime
- Expo SDK 54, React Native 0.81, React 19.1
- Express v5, Node.js, TypeScript

### Database & ORM
- PostgreSQL (Neon)
- Drizzle ORM

### State & Data Fetching
- `@tanstack/react-query`
- `@react-native-async-storage/async-storage`

### Navigation & UI
- `expo-router`
- `react-native-gesture-handler`
- `react-native-reanimated`
- `react-native-screens`
- `@expo/vector-icons`
- `expo-web-browser`
- `@expo-google-fonts/lora`
- `@expo-google-fonts/dm-sans`

### Subscription & Payments
- `react-native-purchases` (RevenueCat SDK — iOS only)
- Stripe API (web only)

### Analytics
- `posthog-react-native`
- Meta SDK + Pixel

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat iOS API key |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat Android API key (present in config but Android billing not active) |
| `EXPO_PUBLIC_RC_MONTHLY_PRODUCT` | Override for monthly product ID (default iOS: `monthly_subscription_all_access`) |
| `EXPO_PUBLIC_RC_ANNUAL_PRODUCT` | Override for annual product ID (default iOS: `ExpatHub_pathfinder`) |
| `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Stripe price ID for monthly plan |
| `EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID` | Stripe price ID for annual plan |
| `SESSION_SECRET` | Express session signing key |
| `STRIPE_SECRET_KEY` | Stripe API key for web payments |
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `PASSWORD_API_URL` | Base URL for password reset API (`www.expathub.website`) |
| `EXPO_PUBLIC_AUTH_API_URL` | Auth API base URL (`www.expathub.world`) |
| `ADMIN_BASIC_USER` | Admin dashboard username |
| `ADMIN_BASIC_PASS` | Admin dashboard password |

---

## Build & Development

| Command | Purpose | Port |
|---------|---------|------|
| `npm run expo:dev` | Start Expo dev server with HMR | 8081 |
| `npm run server:dev` | Start Express backend | 5000 |

**Build pipeline:** EAS Build + EAS Submit
**Current build:** 88 (v1.4.0)
**iOS:** Live in App Store

---

## Automated Testing

- **Mobile (Jest):** `src/billing/__tests__/conversionLifts.test.ts` — exercises pure predicates in `src/lib/conversionLifts.ts` (`shouldGrantReverseTrialOnDismiss`, `getInitialCancellationStep`). Real screen-mount tests for account, planner, quiz, and result screens. `useProgress` hook tests. Full suite: 391 passing tests.
- **One-command runner:** `npm run test:all` runs the full v1.4 suite end-to-end — Jest first, then the two Playwright phases concurrently: the web SPA phase (boots `npx vite build` + Express on port 5000, runs `locked-section` and `cancellation-exit-offer`, shuts the server down) and the Expo-web worksheet phase (boots `npx expo start --web --port 8081`, runs `worksheet-signup-submit`, shuts it down). Mirrors the `jest.yml` + `playwright.yml` CI jobs. Phase logs land in `server.log` and `expo.log` (kept separate so the parallel phases don't clobber each other); a non-zero exit from either parallel phase fails the overall run.
- **Web e2e (Playwright):** `tests/e2e/locked-section.spec.ts` and `tests/e2e/cancellation-exit-offer.spec.ts` target the React+Vite SPA at port 5000 — run with `PLAYWRIGHT_BASE_URL=http://localhost:5000 npx playwright test`. `tests/e2e/worksheet-signup-submit.spec.ts` covers the anonymous → register → fill in → submit worksheet flow against the Expo web build at port 8081 — run with `PLAYWRIGHT_EXPO_BASE_URL=http://localhost:8081 npx playwright test tests/e2e/worksheet-signup-submit.spec.ts`. Config in `playwright.config.ts`.
- **CI:** Meta Pixel event verification checklist with CI check.
- **CI gates (GitHub Actions, `.github/workflows/`):**
  - `jest.yml` — runs `npx jest --ci` on every push and PR. Covers `src/billing/__tests__/conversionLifts.test.ts` and the rest of the Jest suite.
  - `playwright.yml` — runs two jobs on every push and PR:
    - `conversion-lifts` — builds the web SPA, boots the Express server on port 5000, waits for `/` to respond, then runs the v1.4 conversion-lift Playwright specs (`tests/e2e/locked-section.spec.ts`, `tests/e2e/cancellation-exit-offer.spec.ts`). Failures upload `server.log` and `playwright-report` as artifacts.
    - `worksheet-signup` — boots the Expo web dev server on port 8081 (`npx expo start --web --port 8081`), waits for the bundle to be ready, then runs `tests/e2e/worksheet-signup-submit.spec.ts` with `PLAYWRIGHT_EXPO_BASE_URL=http://localhost:8081`. Failures upload `expo.log` and `playwright-report-worksheet` as artifacts.