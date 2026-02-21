# ExpatHub - Replit Agent Guide

## Overview

ExpatHub is a mobile-first application (Expo/React Native) designed to assist expats with international relocation. It offers country-specific guides, official resources, vendor directories, and community connections. The application operates on a freemium model, where detailed pathway guides are accessible via a "Pro" subscription. The project aims to provide comprehensive, opinionated advice to help users make informed decisions about moving abroad.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web.
- **Routing**: `expo-router` v6, utilizing file-based routing and typed routes.
- **State Management**: React Context for global app state (e.g., selected country, subscription status) and React Query for server-side data fetching and caching.
- **Persistence**: `AsyncStorage` for maintaining user preferences like selected country across sessions.
- **UI Design**: Custom component library built with a design token system (`theme/tokens.ts`) and `StyleSheet.create` for styling, avoiding external UI libraries.
- **Navigation**: Features a tab-based layout with four main sections (Home, Explore, Community, Country). Country-specific details use nested Stack navigators, and the subscription flow is presented as a modal.
- **Authentication**: `AuthContext` (`contexts/AuthContext.tsx`) manages JWT-based auth with `expathub.website`. Login: `POST /api/auth/login`, Register: `POST /api/auth/register`, Session: `GET /api/auth/me`, Logout: `POST /api/auth/logout`. On web, proxied through Express backend (`server/routes.ts`) to avoid CORS. On native, calls external API directly. Token stored via `expo-secure-store` (iOS/Android) or `AsyncStorage` (web). Auth screen at `app/auth.tsx` (login/register modal). Account screen at `app/account.tsx` shows profile, subscription status, and logout. Profile icon in tab header and home screen top-right navigates to auth/account.
- **Forgot Password**: `app/forgot-password.tsx` — calls `POST /api/auth/forgot-password` on `expathub.website` (with `www` subdomain to avoid TLS redirect). On web, proxied through Express backend (`server/routes.ts`) to avoid CORS. On native, calls external API directly. Reset link in email opens `expathub.website/reset-password?token=xxx` in the phone's browser; user resets password on web then returns to app to sign in.

### Backend (Express.js)

- **Runtime**: Node.js with TypeScript, using Express v5.
- **API Structure**: Routes are organized in `server/routes.ts` under the `/api` prefix.
- **Data Storage**: Designed with an `IStorage` interface for future database integration, currently using in-memory storage (`MemStorage`).
- **CORS**: Dynamically configured to support Replit development environments and localhost.
- **Production**: Serves a static web build of the Expo app; in development, it proxies to the Expo dev server.

### Database

- **ORM**: Drizzle ORM configured with a PostgreSQL dialect.
- **Schema**: Defined in `shared/schema.ts`, primarily for a `users` table.
- **Migrations**: Managed via `drizzle-kit`.
- **Note**: While configured, the application largely relies on static data files for core content, with plans for broader database integration.

### Data Layer

- **Access Layer**: A centralized data access point (`src/data/index.ts`) abstracts data retrieval, ensuring consistent access patterns across the application.
- **Types**: Canonical schemas for various data entities (e.g., Resource, Vendor, Pathway) are defined in `src/data/types.ts`.
- **Raw Data**: Static TypeScript files (`data/countries.ts`, `data/pathways.ts`, etc.) store the application's core content, including country details, pathway guides (some premium), resources, vendors, and community links.
- **Passport Notes**: `data/passportNotes.ts` provides nationality-specific notes for each pathway across 7 passport types (US, UK, CA, AU, EU, JP, CR). All pathways have notes for all 7 passport types — coverage is complete. Displayed on pathway detail screens in a "Passport Notes" section. Country detail pages show a notice that passport notes are available. Planned v2: full passport selector with nationality-aware content throughout.

### Subscription / Freemium Model (3-Tier)

- **Monetization Tiers**: Three purchase options:
  1. **30-Day Decision Pass** ($29, consumable) — Full access to all 8 launch countries for 30 days. Primary offering. Product ID: `decision_pass_30d`.
  2. **Country Lifetime Unlock** ($69 per country, non-consumable) — Permanent access to a single country's Decision Briefs. Product IDs: `country_lifetime_<slug>` (e.g., `country_lifetime_portugal`).
  3. **Monthly Subscription** ($14.99/month, auto-renewing) — Ongoing full access. Product ID: `expathub_monthly`.
- **Access Hierarchy**: Full subscription > Decision Pass (30-day) > Country Lifetime > None. `hasFullAccess` = true for subscription or decision pass. `hasCountryAccess(slug)` checks country-specific unlocks.
- **Payment Integration**: RevenueCat SDK (`react-native-purchases`) for iOS/Android in-app purchases; Stripe Checkout for web subscriptions with customer portal.
- **RevenueCat Configuration**: API key stored in `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` env vars. Entitlements: `decision_access`, `full_access_subscription`, `country_<slug>`. SDK initialized in `src/subscriptions/revenuecat.ts` with debug logging in dev.
- **Backend-Authoritative Entitlements**: Backend is the single source of truth for access gating. RevenueCat SDK is used for purchase UX only — entitlements are NEVER gated from RC CustomerInfo. Backend endpoints: `GET /api/entitlements` (auth required), `POST /api/billing/mobile/refresh` (auth required). Env var `EXPO_PUBLIC_BACKEND_URL` sets the backend base URL.
- **Billing Orchestrator**: `src/billing/orchestrator.ts` coordinates purchase/restore flows: RC transaction → `POST /api/billing/mobile/refresh` → poll `GET /api/entitlements` every 2s (max 60s) → unlock UI only after backend confirms. Handles timeouts gracefully.
- **Backend Client**: `src/billing/backendClient.ts` implements `BackendClient` interface with JWT auth headers. Token is managed via mutable ref pattern in `src/billing/index.ts` to avoid stale closures in singleton orchestrator.
- **Login Sync**: On login/register/session restore, `EntitlementContext` calls `POST /api/billing/mobile/refresh` then `GET /api/entitlements` to initialize entitlement state. RC `logIn(userId)` called from `AuthContext` to alias device.
- **Entitlement Management**: `EntitlementContext` (`src/contexts/EntitlementContext.tsx`) provides unified access status with `SubscriptionContext` bridge layer (`contexts/SubscriptionContext.tsx`) for backward compatibility. Tracks source (revenuecat/stripe/sandbox), management URL, expiration date, decision pass expiry, unlocked countries.
- **Local Storage**: Decision Pass purchase timestamp stored in AsyncStorage (`decision_pass_purchased_at`). Country unlocks stored as array of slugs (`country_lifetime_unlocks`). Both synced with backend entitlements on refresh.
- **Premium Content Gating**: `ProGate` component checks `hasFullAccess` first, then `hasCountryAccess(slug)` for country-specific content. Shows `ProPaywall` with appropriate context when access is denied.
- **ProPaywall**: Custom 3-tier paywall component (`src/components/ProPaywall.tsx`) showing Decision Pass as primary, country unlock when country context is present, monthly subscription as backup. Uses orchestrator for purchase/restore flows with timeout handling. Contextual value propositions, sandbox testing toggle.
- **Country Hub Integration**: Country detail page (`app/(tabs)/country/[slug]/index.tsx`) shows access status banner (pass days left, country unlocked) or unlock CTA linking to paywall with country context.
- **Account Screen**: Shows access type (Decision Pass, Country Unlock, Monthly, Free), expiration info, unlocked countries as chips, and upgrade CTA.
- **Decision Briefs**: Core premium feature providing opinionated, detailed advice on relocation, covering recommended profiles, financial realities, and common mistakes.
- **Sandbox Mode**: Dev-only toggle in paywall to simulate Pro access for testing without real purchases.
- **Analytics**: Tracks purchase events by type (decision_pass, country_lifetime, monthly_subscription), restore, cancel, paywall_shown.
- **Launch Countries**: portugal, spain, canada, costa-rica, panama, ecuador, malta, united-kingdom (8 countries).

## External Dependencies

### Core Runtime
- **Expo SDK 54**
- **React 19.1** / **React Native 0.81**
- **Express 5**

### Database & ORM
- **PostgreSQL**
- **Drizzle ORM**
- **drizzle-zod**
- **pg**

### State & Data Fetching
- **@tanstack/react-query**
- **@react-native-async-storage/async-storage**

### Navigation & UI
- **expo-router**
- **react-native-gesture-handler**
- **react-native-reanimated**
- **react-native-screens**
- **react-native-safe-area-context**
- **react-native-keyboard-controller**
- **@expo/vector-icons** / **Ionicons**
- **expo-web-browser**

### Subscription & Payments
- **react-native-purchases** (RevenueCat SDK)
- **Stripe API** (for web subscriptions)

### Build Tools
- **tsx**
- **esbuild**
- **drizzle-kit**
- **patch-package**

## Pre-Launch Checklist

Before publishing or submitting to app stores, address these items:

- [x] **Swap privacy policy & terms URLs** — Updated to `https://expathub.website/privacy` and `https://expathub.website/terms` in `src/config/subscription.ts`. Also update in Google Play Console and Apple App Store Connect.
- [ ] **RevenueCat production keys** — Replace test API key with production keys from RevenueCat dashboard (starts with `appl_` for iOS, `goog_` for Android). Update `EXPO_PUBLIC_RC_IOS_KEY` and `EXPO_PUBLIC_RC_ANDROID_KEY`.
- [ ] **Configure RevenueCat dashboard** — Create entitlements `decision_access`, `full_access_subscription`, and `country_<slug>` for each launch country. Create products: `decision_pass_30d` (consumable), `country_lifetime_<slug>` (non-consumable) for each country, and `expathub_monthly` (auto-renewing subscription).
- [ ] **Set up App Store Connect products** — Create `decision_pass_30d` consumable ($29), 8 `country_lifetime_*` non-consumables ($69 each), and `expathub_monthly` subscription ($14.99/mo).
- [ ] **Set up Google Play products** — Create matching in-app products and subscription.
- [ ] **Stripe configuration** — If using web subscriptions, set `STRIPE_SECRET_KEY` and configure Stripe price IDs for monthly subscription.
- [ ] **Contact email** — Verify `support@magicelfdigital.com` is active and monitored (used in privacy policy and terms of service).