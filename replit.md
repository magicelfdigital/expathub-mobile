# ExpatHub - Replit Agent Guide

## Overview
ExpatHub is a mobile-first application designed to assist expats with international relocation. It provides country-specific guides, official resources, vendor directories, and community connections. The project's main purpose is to offer comprehensive, opinionated advice to facilitate informed decisions for users moving abroad. It operates on a freemium model, with detailed pathway guides available through a "Pro" subscription. The business vision is to become the go-to platform for informed international relocation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native, targeting iOS, Android, and Web.
- **Routing**: `expo-router` for file-based routing and typed routes.
- **State Management**: React Context for global state and React Query for server-side data.
- **UI Design**: Custom component library with a design token system, specific color palette (blue, teal, gold, navy, cream, surface), and fonts (Lora 600 for headlines, DM Sans for UI text). Consistent styling with rounded corners for cards and active tab pills.
- **Navigation**: Tab-based layout (Home, Explore, Shortlist, Community) with stack navigators for detail screens. Subscription flow is a modal.
- **Authentication**: JWT-based via `AuthContext`, token storage using `expo-secure-store` or `AsyncStorage`. Web authentication is proxied through an Express backend.
- **Key Features**:
    - **Subscription/Freemium Model**: 2-tier system (Monthly Explorer at $14.99/mo, Annual Pathfinder at $89/yr) — both with a 14-day free trial — integrated with RevenueCat for mobile and Stripe Checkout for web. RevenueCat product IDs: `expathub_explorer` (monthly), `expathub_pathfinder` (annual). Web checkout takes `{plan: 'monthly'|'annual'}` and adds `subscription_data.trial_period_days: 14`. Entitlements are backend-authoritative; legacy `decisionPass` / `countryUnlocks` fields from the API are ignored by the entitlement gate. Store + Stripe configuration steps live in `docs/store-config-changes.md`.
    - **Continue / Last Viewed**: Persists user's last viewed country, section, and resource for quick access.
    - **Saved Resources**: Allows users to bookmark resources per country.
    - **Paywall Segmented Navigation**: ProPaywall component with "What you get", "Plans", and "FAQ" tabs, plus a sticky CTA.
    - **Internationalization**: Content uses neutral language and passport-specific notes, with selected passport nationality stored locally.
    - **Relocation Readiness Assessment**: Onboarding quiz with weighted scoring, providing a relocation readiness tier, top country match, and lead capture for non-guide countries.
    - **Expanding Soon / Waitlist**: Section for upcoming countries with a waitlist feature integrated with the backend.
    - **Source Badge Classification**: Resources are categorized as official, authoritative, or community.
    - **Planner Layer**: A 6-step semi-linear relocation planning system for paid users, with country-specific checklists and pet requirements. It allows users to manage one active plan at a time.
    - **Country Bookmarks & Shortlist**: Users can bookmark countries from any card. Shortlist tab shows bookmarked countries with compare selection and move notes. Free users limited to 1 bookmark. Context: `contexts/BookmarkContext.tsx`, component: `src/components/BookmarkButton.tsx`, screen: `app/(tabs)/shortlist/index.tsx`.
    - **Move Notes**: Per-country freeform notes on the shortlist screen, auto-saved on blur. Pro-only feature. Data stored in `move_notes` table.
    - **Enhanced Compare Matrix**: 14 comparison rows including LGBTQ+ friendliness, healthcare quality, climate, tax treatment. Free users see 4 free rows, rest gated behind paywall.
    - **Cancellation Modal**: Intercepts "Manage Subscription" on account screen for paid users, showing bookmark/note counts before proceeding to native subscription management. Component: `src/components/CancellationModal.tsx`.
    - **Tablet Support**: Responsive design using a `useLayout` hook to adapt screen layouts for tablets with 2-column grids.

### Backend
- **Runtime**: Node.js with TypeScript and Express.
- **API Structure**: Routes under `/api` prefix, handling data access and authentication.
- **Data Storage**: Uses an `IStorage` interface, currently with in-memory storage, and a PostgreSQL database.
- **Web frontend hosting**:
    - **Production**: Express serves the built React+Vite SPA from `web/dist/` for all non-`/api` routes (SPA fallback to `index.html`).
    - **Development**: Express proxies all non-`/api` requests to the Vite dev server at `http://127.0.0.1:5173` (HMR works through the proxy). The `Start Backend` workflow boots both Express and Vite together via `concurrently`.
    - Expo Go manifest serving (mobile dev) still hooks `/` and `/manifest` when the `expo-platform` header is present; legacy `static-build/` assets are still served for backward compatibility.

### Web Frontend (`web/`)
- **Framework**: React 19 + Vite 6 + TypeScript + Tailwind v4 (via `@tailwindcss/vite`).
- **Routing**: `react-router-dom` v7 with a shared `<SiteLayout>` (Header + Footer). Routes: `/`, `/pricing`, `/start`, `/account`, `/data-delete`, `/privacy`, `/terms`, plus a 404 page.
- **Design tokens**: Brand palette and fonts are exposed as Tailwind v4 `@theme` tokens in `web/src/styles/index.css` (primary `#3E81DD`, teal `#33C4DC`, gold `#E8991A`, navy `#0F2B4D`, cream, surface, bg `#F7F6F2`). Fonts are loaded from Google Fonts (DM Sans for UI, Lora for headlines).
- **Home page (`web/src/pages/Home.tsx`)**: Faithful React port of the old `server/templates/_legacy/landing-page.html` Expo Go onboarding flow — two step cards ("Download Expo Go" with platform-aware App Store / Google Play buttons, and "Scan QR Code" with a QR rendered via the `qr-code-styling` CDN script + an `exps://<host>` deep-link button). On iOS/Android user agents the page auto-redirects to the deep link. Re-styled with the new brand tokens (DM Sans + Lora, navy/cream/primary).
- **API client**: `web/src/lib/api.ts` exposes `webApiClient` with helpers for `/api/auth/*`, `/api/stripe/*`, and `/api/readiness-lead`. `web/src/hooks/useUser.ts` provides a lightweight `useUser()` session hook (calls `/api/auth/me`, treats failures as anonymous).
- **Legal pages**: Privacy and Terms are now React pages (`web/src/pages/Privacy.tsx`, `web/src/pages/Terms.tsx`); the originals were moved to `server/templates/_legacy/` as a one-release safety net.
- **Build**: `npx vite build --config web/vite.config.ts` outputs to `web/dist/`.
- **Dev server**: `Start Backend` workflow boots Express + Vite together via `concurrently`. `web/package.json` also exposes `npm run dev:all` (run from inside `web/`) that does the same thing — useful when running the stack outside Replit's workflow runner. Root `package.json` is intentionally not edited.

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` for user data, readiness leads, country interest, quiz leads, and waitlist.

### Data Layer
- **Access**: Centralized data access point.
- **Content Storage**: Core content (countries, pathways, passport notes, quiz data, plan steps, pet requirements) stored in static TypeScript files.

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
- posthog-react-native (initialized in `app/_layout.tsx`, wired into `src/lib/analytics.ts`'s `trackEvent`). Reads `EXPO_PUBLIC_POSTHOG_KEY`; if absent, init is skipped and events still log locally + post to `/api/analytics`. Funnel events: `app_opened`, `onboarding_started`, `quiz_started`, `quiz_completed`, `result_screen_viewed`, `paywall_viewed`, `trial_tapped`, `trial_started`, plus conversion lifts: `personalized_paywall_viewed`, `reverse_trial_granted`, `reverse_trial_expired`, `locked_section_viewed`, `exit_offer_shown`, `exit_offer_accepted`, `exit_offer_declined`.

## Conversion Lifts (Task #4)
- **Web LockedSection blur previews**: `web/src/components/LockedSection.tsx` shows a ~80px CSS-masked preview of the real Pro content followed by a dedicated lock-overlay card (headline + 4–5 ✓ bullets + CTA). Headline and bullets are passed per section via `lockedHeadline` and `lockedBullets` props, with sensible defaults. Used on `web/src/pages/CountryDetail.tsx` (`/country/:slug` route) for 5 sections. The country page also surfaces a **free teaser card** with the country's match score, a short brief, and three concrete highlights drawn from the country data model. Pixel events via `web/src/lib/pixel.ts`.
- **48h reverse trial (mobile)**: `src/contexts/EntitlementContext.tsx` exposes `reverseTrialActive`, `reverseTrialUsed`, `reverseTrialExpiresAt`, `startReverseTrial`, `resetReverseTrial`. Stored in AsyncStorage. `hasFullAccess` is true while active. `src/components/ProPaywall.tsx` grants the trial on first dismiss; the confirmation toast is fired into the **global toast bus** (`src/lib/toastBus.ts` → `src/components/GlobalToast.tsx`, mounted at the app root in `app/_layout.tsx`) so it survives the paywall unmount. After the 48h preview ends, the **expiry modal is triggered on the next premium-feature access attempt** (not on app load): `src/lib/requireProAccess.ts` calls `tryShowExpiryGate(source)` from `src/lib/expiryGateBus.ts`, and `src/components/ReverseTrialExpiryGate.tsx` (mounted at the app root) handles the event by showing `ExpiryModal.tsx`. The modal copy reads "Your free preview has ended", surfaces the user's exploration count (saved countries + move notes), and offers `Continue Monthly` / `Continue Annual` CTAs that route to `/subscribe?plan=monthly|annual`.
- **Personalized paywall**: ProPaywall reads `user_top_country` and `user_first_name` from AsyncStorage (set in `app/onboarding/result.tsx`, also pushed to RC via `setUserAttributes` in `src/subscriptions/revenuecat.ts`). Plan-card prices come from RC `getOfferings()` instead of hardcoded MONTHLY_PRICE/ANNUAL_PRICE.
- **Exit offer (50% off × 3 months)**:
  - Backend: `shared/schema.ts` adds `exitOffers` table (with `period_start TIMESTAMP`); `server/routes.ts` exposes `GET /api/subscription/exit-offer/eligibility` and `POST /api/subscription/exit-offer`. Both endpoints (a) resolve the authenticated user via `getUserFromToken`, (b) reject requests where the body's `subscriptionId` does not match `user.stripeSubscriptionId` (403), (c) call Stripe to fetch the subscription's current `current_period_start` (read from `items.data[0].current_period_start` with a fallback to the legacy top-level field), and (d) reject when Stripe's customer on the subscription does not match `user.stripeCustomerId` (403). The DB enforces "show once per subscription period" via a unique index on `(user_id, subscription_id, period_start)` — any existing row for the current `period_start` makes the offer ineligible until the next billing period. `ensureExitCoupon` is idempotent on Stripe lookup_key `expathub_exit_50off_3mo`. The coupon is applied with `discounts: [{ coupon }]`.
  - Web: `web/src/components/CancellationFlow.tsx` is mounted from `web/src/pages/Account.tsx`. The flow shows the offer card; **accept** records the action and moves to a success state, **decline** records the action and immediately routes the user into the Stripe billing portal via `webApiClient.stripe.portal()` (no-arg — server derives the Stripe customer id from the authenticated session, never from a client-supplied id). Only the subscription id is read off `useUser()`; the customer id never leaves the server.
  - Mobile: `src/components/CancellationModal.tsx` adds an `ExitOfferStep`; eligibility is gated to `source === "stripe"` and `hasPaidAccess` (which excludes `accessType === "reverse_trial"` so trial users never enter the cancel flow). The Stripe subscription id is fetched from `/api/auth/me` (never from RevenueCat's `productIdentifier`, which is an SKU). Both **accept** (after the backend applies the coupon) and **decline** deep-link the user into the Stripe billing portal via `POST /api/stripe/portal` + `Linking.openURL`. **Authz on the portal endpoint:** `/api/stripe/portal` requires an auth token, derives the Stripe customer id server-side from `getUserFromToken`, and explicitly ignores any client-supplied customerId — preventing IDOR.