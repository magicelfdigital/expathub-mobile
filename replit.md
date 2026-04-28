# ExpatHub - Replit Agent Guide

## Overview
ExpatHub is a mobile-first application assisting expats with international relocation. It provides country-specific guides, resources, vendor directories, and community connections, aiming to be the definitive platform for informed international relocation. The project offers comprehensive, opinionated advice via a freemium model, with detailed guides available through a "Pro" subscription.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native for iOS, Android, and Web.
- **Routing**: `expo-router` for file-based and typed routing.
- **State Management**: React Context for global state, React Query for server data.
- **UI Design**: Custom component library with a defined design token system, specific color palette (blue, teal, gold, navy, cream, surface), and fonts (Lora for headlines, DM Sans for UI text). Consistent styling includes rounded corners.
- **Navigation**: Tab-based layout (Home, Explore, Shortlist, Community) with stack navigators. Subscription flow is a modal.
- **Authentication**: JWT-based using `AuthContext` and `expo-secure-store` or `AsyncStorage`. Web authentication is proxied via an Express backend.
- **Key Features**:
    - **Subscription Model**: Two-tier freemium (Monthly Explorer, Annual Pathfinder) with a 14-day free trial, integrated with RevenueCat (mobile) and Stripe Checkout (web). Entitlements are backend-authoritative.
    - **Continue / Last Viewed**: Persists user's last viewed content.
    - **Saved Resources**: Bookmark resources per country.
    - **Paywall Navigation**: `ProPaywall` component with "What you get", "Plans", "FAQ" tabs, and a sticky CTA.
    - **Internationalization**: Neutral language and passport-specific notes.
    - **Relocation Readiness Assessment**: Onboarding quiz with weighted scoring for country matching and lead capture.
    - **Expanding Soon / Waitlist**: Feature for upcoming countries with backend integration.
    - **Source Badge Classification**: Categorizes resources as official, authoritative, or community.
    - **Planner Layer**: A 10-step generic relocation planner per country for paid users. Steps are managed via `src/data/planSteps.ts` and user progress is stored in a PostgreSQL `user_progress` table.
    - **Country Bookmarks & Shortlist**: Users can bookmark countries, with a limit of 1 for free users.
    - **Move Notes**: Per-country freeform notes on the shortlist screen (Pro-only).
    - **Enhanced Compare Matrix**: 14 comparison rows, with 4 accessible to free users.
    - **Cancellation Modal**: Intercepts subscription management for paid users, showing potential losses (bookmarks, notes) before proceeding.
    - **Tablet Support**: Responsive design for 2-column layouts on tablets.
    - **Conversion Lifts**:
        - **Web LockedSection blur previews**: Shows a masked preview of Pro content with a lock-overlay card and CTA.
        - **48h reverse trial (mobile)**: Grants temporary full access, managed via `EntitlementContext` and `AsyncStorage`. Expiry triggers a modal.
        - **Personalized paywall**: Prices from RevenueCat, user top country and name from AsyncStorage.
        - **Exit offer (50% off × 3 months)**: Backend eligibility check, applied via Stripe. Presented in web and mobile cancellation flows.

### Backend
- **Runtime**: Node.js with TypeScript and Express.
- **API Structure**: Routes under `/api` prefix for data and authentication.
- **Data Storage**: `IStorage` interface, currently supporting in-memory and PostgreSQL.
- **Web frontend hosting**: Express serves static built React+Vite SPA for production; proxies to Vite dev server for development.
- **Internal admin tooling**: Basic-Auth-protected dashboards (set `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS`):
    - `/admin` — index page linking to all internal tools.
    - `/admin/planner-analytics` (HTML) and `/api/admin/planner-analytics` (JSON) — planner completion rate per step, % of plans reaching 100%, median days from start to completion, and drop-off by stage. **Note**: metrics are derived from the `user_progress` table (proxy for `plan_focus_started` / `planner_step_completed` / `planner_completed` analytics events) rather than from PostHog event rollups, so they reflect authoritative DB state but won't match raw event counts exactly. The `created_at` column is added via an idempotent lazy migration; `ensureUserProgressCreatedAt` in `server/plannerAnalytics.ts` is the single source of truth and is also called from the progress-seed path in `server/routes.ts`. After the column is added, `backfillUserProgressMigrationCreatedAt` runs once per process to rewrite rows still pinned to the migration-time NOW() (any timestamp shared by more rows than one seed batch) — it sets them to the earliest `completed_at` for the (user, country) plan, or NULL if the plan has no completion. The median calc filters NULL `started_at` so historical plans don't skew the time-to-100% metric. Implemented in `server/plannerAnalytics.ts`.
    - `/api/admin/ab-results` (JSON) — A/B test variant performance.

### Web Frontend (`web/`)
- **Framework**: React 19, Vite 6, TypeScript, Tailwind v4.
- **Routing**: `react-router-dom` v7 with a shared layout.
- **Design tokens**: Brand palette and fonts are exposed as Tailwind `@theme` tokens.
- **Home page**: React port of the legacy landing page, providing Expo Go download and QR scan options.
- **API client**: `web/src/lib/api.ts` for interacting with `/api/auth/*`, `/api/stripe/*`, etc.
- **Legal pages**: React pages for Privacy and Terms.

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` for user data, leads, country interest, and waitlist.

### Automated Testing
- **Mobile harness (Jest)**: `src/billing/__tests__/conversionLifts.test.ts` exercises the pure predicates in `src/lib/conversionLifts.ts` (`shouldGrantReverseTrialOnDismiss`, `getInitialCancellationStep`). Both `ProPaywall` and `CancellationModal` import these helpers, so the harness verifies the production code path.
- **Web e2e (Playwright)**: `tests/e2e/locked-section.spec.ts` and `tests/e2e/cancellation-exit-offer.spec.ts`. Config in `playwright.config.ts`. Run with `PLAYWRIGHT_BASE_URL=http://localhost:5000 npx playwright test` once the backend workflow is up.

### Data Layer
- **Access**: Centralized access point.
- **Content Storage**: Core content (countries, pathways, etc.) stored in static TypeScript files.

## External Dependencies

### Core Runtime
- Expo SDK
- React / React Native
- Express

### Database & ORM
- PostgreSQL
- Drizzle ORM

### State & Data Fetching
- @tanstack/react-query
- @react-native-async-storage/async-storage

### Navigation & UI
- expo-router
- react-native-gesture-handler
- react-native-reanimated
- react-native-screens
- @expo/vector-icons
- expo-web-browser
- @expo-google-fonts/lora
- @expo-google-fonts/dm-sans

### Subscription & Payments
- react-native-purchases (RevenueCat SDK)
- Stripe API

### Analytics
- posthog-react-native (for event tracking)