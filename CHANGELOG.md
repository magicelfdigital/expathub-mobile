# Changelog

All notable changes to ExpatHub product, content, and infrastructure are
recorded here. Mobile app version follows `app.json` (`expo.version`).

**Maintenance rule**: every merged change to product behaviour, content, or
public-facing infra should add a bullet to the topmost release section. New
release sections are opened when `expo.version` in `app.json` is bumped.

---

## v1.4 — 2026-04-26 → 2026-05-16

### Worksheets & onboarding result UX (May 2026)
- New **Worksheets** feature: 8 self-assessment worksheets (one per quiz
  dimension) that let paid users replace blocker dimension scores with a
  richer self-assessment and recompute their readiness score. Public list
  with completion status at `/(tabs)/(home)/worksheets`; paywall gates
  individual worksheet submission. Backed by `worksheet_definitions` and
  `user_worksheet_responses` tables with lazy migration + seed in
  `server/routes.ts`.
- Onboarding result screen refactored for clarity:
  - **Pills reveal-on-tap**: critical / moderate / explore sections are
    hidden until the matching pill is tapped (icon flips `+` → `✓`,
    section gets a thicker border, screen scrolls to it). Hint copy:
    "Tap a label above to see what's affecting that part of your score."
  - **Blocker bottom sheet**: tapping a blocker opens a Modal sheet with
    the full "what this means" + next step + "Open worksheet · N
    questions" CTA. No more inline expand/collapse.
  - Removed the redundant "Work on your readiness" teaser card — the
    worksheets feature is reachable from the home readiness card and
    blocker sheets.
  - Removed the duplicate "Create Free Account to Save Results" gold
    button from the save card; the sticky bottom CTA now handles the
    auth path. Save card primary action is now **"Email me the results"**.
- New analytics events: `result_pill_opened`,
  `result_blocker_card_tapped`, `result_blocker_worksheet_tapped`.
- Account screen footer now reads the version + build number dynamically
  from `app.json` via `Constants.expoConfig` instead of being hardcoded.

### Original v1.4 freemium relaunch (April 2026)


The freemium relaunch: 2-tier subscription, web frontend, planner v2, web
quiz funnel, conversion lifts, and the analytics + admin-dashboard backbone
to measure all of it.

### Subscription model
- Collapsed Decision Pass + per-country Lifetime SKUs into a 2-tier model:
  **Monthly Explorer ($14.99)** and **Annual Pathfinder ($89)**, both with a
  14-day free trial.
- Backend-authoritative entitlements (iOS `monthly_subscription_all_access`
  / `ExpatHub_pathfinder` → `full_access_subscription`).
- Restore Purchases now waits for the backend before declaring success.
- Android billing path removed — iOS + Web only going forward.

### Web frontend (`web/`)
- Stood up a React 19 + Vite 6 + Tailwind v4 app at **expathub.website**.
- React-router v7 with shared layout; brand palette + fonts exposed as
  Tailwind `@theme` tokens.
- Pages: Home (Expo Go download + QR), Pricing, Start (5-question quiz
  funnel), Account, Privacy, Terms.
- Express serves the built SPA in production and proxies to the Vite dev
  server in development.

### Tracking & analytics
- Meta SDK + Pixel integrated with the full funnel (PageView, ViewContent,
  Lead, InitiateCheckout, CompleteRegistration, Subscribe).
- Meta event verification checklist + CI guard added.
- PostHog `distinct_id` shared across mobile and web; visitor-ids
  stitched from the web quiz funnel through to accounts created later.
- Identify warns when `$anon_distinct_id` is missing.
- Mobile analytics events tagged with the user identifier.
- Planner events: `plan_focus_started`, `planner_step_expanded`,
  `planner_step_collapsed`, `planner_step_completed`, `planner_completed`.
- Quiz save events: `quiz_save_shown`, `quiz_save_submitted`,
  `quiz_save_dismissed`.

### Conversion lifts
- **Web LockedSection blur previews** — masked Pro content with a lock
  overlay and CTA.
- **Personalized paywall** — pulls prices from RevenueCat + the user's top
  country and name from AsyncStorage.

### Planner layer
- 10-step generic relocation planner per launch country, paid-tier only.
- Server-backed progress in a PostgreSQL `user_progress` table.
- Surfaced from the home tab and the country dashboard.
- Per-country wiring verified end-to-end (Spain ↔ NIE/empadronamiento,
  Portugal ↔ NIF/NISS, no cross-leak).
- Account screen shows live plan progress and lets users switch or reset
  the active plan in place.

### Onboarding & quiz UX
- 5 user-testing fixes shipped to the mobile readiness quiz.
- Web quiz funnel persists to localStorage so refresh resumes the funnel.
- **Save-your-progress modal** (web) at Q5 if the user gave 3+ "no"
  answers, writing to `quiz_leads` with `source: "web_funnel_save"`.

### Admin dashboards (Basic-Auth protected)
- `/admin` index linking to all internal tools.
- `/admin/planner-analytics` — completion rate per step, % reaching 100%,
  median days from start to completion, drop-off by stage, weekly trends,
  per-country breakdown with country filter, exclusion-count for the
  median to flag low-confidence windows.
- `/admin/quiz-save-analytics` — impressions / submissions / dismissals /
  recovery rate split by surface, email-gate cannibalisation view, 8-week
  trend chart with stacked bars + recovery-rate line.
- JSON twins under `/api/admin/*`.

### Visa content (App-Store re-verification, Task #76)
- 8 high-risk briefs re-verified against 2026 official sources:
  `portugal-overview`, `portugal-d7`, `portugal-d8`, `spain-dnv`,
  `italy-overview`, `italy-elective-residency`,
  `mexico-temporary-resident`, `ecuador-rentista`, `ecuador-jubilado`,
  `thailand-ltr`.
- `compareMatrix.ts` reconciled to match the updated briefs.
- New `FreshnessBanner` component on every Pro `DecisionBriefCard`
  (mobile) and on the web country-detail page.
- Baseline government-portal links added to remaining briefs without
  bumping unverified `lastReviewedAt`.
- Quarterly freshness check tracked as follow-up #78.

### Test coverage
- New jest "screens" project (jsdom, host-component mocks for RN /
  expo-router / vector-icons / safe-area / async-storage).
- Real screen-mount tests for `account`, `planner`, `quiz`,
  `result`; direct hook tests for `useProgress`; pure-helper tests for
  `plannerCompletion`, `quiz` readiness labels, analytics listener.
- Server-side tests for planner analytics, quiz-save analytics,
  analytics route persistence.
- Web e2e Playwright specs for LockedSection, quiz save modal,
  visitor-id join.
- Total: **391 tests / 33 suites** green.

### Infra
- Metro config blocks `.local` and `web/dist` to prevent stale skill
  directories from crashing the bundler.
- `scripts/post-merge.sh` runs `npm install`, `db:push --force`, and the
  web vite build on every task merge.

### Removed
- "Guide me" buttons removed from the results screen (pre-v1.4 cleanup).
- Promo-code redemption + dev bypasses (App Store compliance).
- Decision Pass and Country Lifetime SKUs.
- Android-specific billing recovery code and docs.

---

## v1.2 — 2026-03-24

Onboarding quiz launch.

- New relocation-readiness assessment quiz with weighted scoring and
  tailored country results.
- Account creation embedded in the onboarding flow.
- Welcome screen with a skip-quiz option.
- Country-interest notification after the result screen.
- Landing-page subtitle updated to prompt users to take the quiz.
- Web orientation updated to support large-screen devices.

---

## v1.1 — 2026-02-17 → 2026-03-09

Stabilization, monetization hardening, and content rollout.

### Auth & accounts
- Sign-in flow consolidated for both login and registration; default
  flipped to registration.
- Forgot-password flow added.
- Account deletion added and made progressively more prominent.

### Billing v2 (backend-authoritative)
- Backend entitlement system; refresh-on-login with cooldown.
- RevenueCat product IDs aligned with backend.
- Lifetime upgrade-from-monthly path on the country detail page.
- Debug screen for billing diagnostics.

### Compliance
- Privacy + Terms links added.
- Promo-code bypasses removed.
- App Store guideline cleanup pass.

### Domain & branding
- All links migrated to **expathub.website** (then to `www.`).
- New sun-style app icon across all platforms.
- Logo + assistant images refreshed; Pathfinder badge styling fixed on iOS.

### Navigation
- Country routing rewritten: dedicated country view screen, dynamic
  routes, focus effects, tab-stack reset, fix iOS tab screen reuse, fix
  stale data on native iOS, restructured into the home tab navigator.

### Content
- Vendors added across multiple launch countries.
- Country status flipped to "ready" for the launch set.

### Layout
- iPad / large-screen centering and content-width fixes.

### App Store assets
- Marketing screenshots resized for landscape and portrait orientation.

---

## v1.0 — 2026-02-16 → 2026-02-17

Initial PRD and import of v1 mobile app.
- 8 launch countries: Portugal, Spain, Canada, Costa Rica, Panama,
  Ecuador, Malta, United Kingdom.
- Country hub, decision briefs, pathway details, comparison matrix,
  resources directory, vendor directory, community links.
- 4-tier monetization (Decision Pass + per-country Lifetime SKUs).
- Mobile-only.

---

## Detailed entries

### 2026-05-07 — Pre-App-Store visa-content re-verification (Task #76)

Re-verified high-risk visa figures across `src/data/decisionBriefs.ts`
against official 2026 sources before the App Store release. Updated
content, refreshed `lastReviewedAt` on the briefs that were re-verified,
added official source links, and reconciled `src/data/compareMatrix.ts` so
the comparison view stays in sync with the briefs. Added a small
"Information current as of …" freshness banner on the mobile Pro Decision
Brief card and on the web country-detail page.

#### Briefs updated

- **portugal-overview** — Citizenship line now flags the May 2026
  nationality-law reform signed by President Marcelo Rebelo de Sousa
  (10 years general / 7 years CPLP, awaiting publication in the Diário da
  República). Source: portugal.gov.pt 2026 minimum-wage release; AIMA
  portal.
- **portugal-d7** — Minimum income updated from ~€870/month to
  **~€920/month** (2026 Portuguese minimum wage per Decreto-Lei 139/2025).
  Per-dependent figure updated from ~€435 to ~€460.
- **portugal-d8** — 4× minimum-wage threshold updated from ~€3,480 to
  **~€3,680/month** in five places (recommendedFor, keyRequirements,
  financialReality, commonMistakes, familyAndDependents).
- **spain-dnv** — 200% SMI threshold updated from €2,763/month to
  **~€2,849/month** in four places, with explicit note that this reflects
  the 2026 SMI of €1,221/mo annualised over 14 payments (Real Decreto
  126/2026). Beckham Law risk flag clarified (24%, 6 yrs, €600k cap
  unchanged in 2026). Confidence raised from Medium to High and source
  links added.
- **italy-overview** — Jure-sanguinis bullet rewritten to reflect Law
  74/2025 (the Tajani Decree, in force since May 2025) restricting
  eligibility to applicants with a parent or grandparent born in Italy.
- **italy-elective-residency** — "Better alternatives" Portugal D7 figure
  updated from €870/mo to **~€920/mo**, plus citizenship-timeline caveat.
- **mexico-temporary-resident** — Added explicit reference to the **2026
  UMA** (effective Feb 1 2026: $117.31 MXN/day, $3,566.22 MXN/month per
  INEGI) as the authoritative basis for consulate threshold calculations.
  Confidence kept at Medium because consulate interpretations still vary
  widely.
- **ecuador-rentista** & **ecuador-jubilado** — Threshold updated from
  $1,410/mo to **$1,446/mo** (3× the 2026 Ecuadorian unified basic salary
  of $482, set by Acuerdo Ministerial MDT-2025-195). Updated in eight
  places across the two briefs.
- **thailand-ltr** — Foreign-income tax risk flag rewritten to reference
  Departmental Order **Por.161/2566** (in force since Jan 1 2024) and
  Royal Decree 743 LTR exemption, instead of the vague "actively being
  revised" wording. Confidence kept at High; source links added.

#### `compareMatrix.ts` reconciled

- `path-to-pr` → Portugal row updated to flag the 2026 citizenship-timeline
  reform.
- `income-thresholds` → Portugal D7 (€760 → €920), Portugal D8 (€3,500 →
  €3,680), Spain DNV (€3,300 → €2,849), Ecuador Rentista ($1,375 →
  $1,446).

#### UI

- New `src/components/FreshnessBanner.tsx` shown at the top of every
  mobile `DecisionBriefCard`, reading "Information current as of {Month
  Year} — verify with official sources before acting."
- Web `web/src/pages/CountryDetail.tsx` now shows the same banner under
  the country header (`data-testid="country-freshness-banner"`).

#### Constraints honoured

- No invented numbers. Every updated figure is traceable to an official
  source link added to the brief's `sourceLinks` array.
- Briefs that were not re-verified retained their original
  `lastReviewedAt` date and confidence level.
