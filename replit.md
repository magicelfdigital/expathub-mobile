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
    - **Subscription/Freemium Model**: 4-tier system (30-Day Decision Pass at $29, Country Lifetime Unlock at $69, Monthly Explorer at $14.99/mo, Annual Pathfinder at $89/yr) integrated with RevenueCat for mobile and Stripe Checkout for web. RevenueCat product IDs: `expathub_explorer` (monthly), `expathub_pathfinder` (annual). Entitlements are backend-authoritative.
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
- posthog-react-native (initialized in `app/_layout.tsx`, wired into `src/lib/analytics.ts`'s `trackEvent`). Reads `EXPO_PUBLIC_POSTHOG_KEY`; if absent, init is skipped and events still log locally + post to `/api/analytics`. Funnel events: `app_opened`, `onboarding_started`, `quiz_started`, `quiz_completed`, `result_screen_viewed`, `paywall_viewed`, `trial_tapped`, `trial_started`.