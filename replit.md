# ExpatHub - Replit Agent Guide

## Overview
ExpatHub is a mobile-first application (Expo/React Native) aimed at assisting expats with international relocation. It provides country-specific guides, official resources, vendor directories, and community connections. The project's core purpose is to offer comprehensive, opinionated advice to facilitate informed decisions for users moving abroad. It operates on a freemium model, with detailed pathway guides available through a "Pro" subscription.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web.
- **Routing**: `expo-router` v6, using file-based routing and typed routes.
- **State Management**: React Context for global state and React Query for server-side data.
- **Persistence**: `AsyncStorage` for user preferences.
- **UI Design**: Custom component library with a design token system (`theme/tokens.ts`) and `StyleSheet.create` for styling.
- **Navigation**: Tab-based layout with nested Stack navigators for country details; subscription flow as a modal.
- **Authentication**: JWT-based via `AuthContext` with `expathub.website` API. Uses `expo-secure-store` (native) or `AsyncStorage` (web) for token storage. Web authentication is proxied through an Express backend to handle CORS.
- **Forgot Password**: Handled via `expathub.website` with email-based reset. Route at `/forgot-password` with calm UX, neutral success messaging (prevents account enumeration), and analytics events (`password_reset_opened`, `password_reset_submitted`, `password_reset_success`, `password_reset_error`).
- **About Screen**: Route at `/about`, accessible from Account screen. Displays app version (via expo-constants), company (MagicElfDigital LLC), support email (mailto link), and legal links (Privacy Policy, Terms of Service, Delete Account). Presented as a modal.

### Backend (Express.js)
- **Runtime**: Node.js with TypeScript and Express v5.
- **API Structure**: Routes in `server/routes.ts` under `/api` prefix.
- **Data Storage**: Uses an `IStorage` interface, currently with in-memory storage (`MemStorage`).
- **CORS**: Dynamically configured for development environments.
- **Production**: Serves static web build of the Expo app.

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts`, primarily for a `users` table.
- **Migrations**: Managed by `drizzle-kit`. Primarily used for user data, with core content residing in static files.

### Data Layer
- **Access**: Centralized data access point (`src/data/index.ts`).
- **Types**: Canonical schemas in `src/data/types.ts`.
- **Raw Data**: Static TypeScript files (`data/countries.ts`, `data/pathways.ts`, etc.) store core content.
- **Passport Notes**: `data/passportNotes.ts` provides nationality-specific notes for pathways across 7 passport types.

### Subscription / Freemium Model (3-Tier)
- **Monetization**:
    1. **30-Day Decision Pass** ($29, consumable)
    2. **Country Lifetime Unlock** ($69 per country, non-consumable)
    3. **Monthly Subscription** ($14.99/month, auto-renewing)
- **Access Hierarchy**: Full subscription > Decision Pass > Country Lifetime > None.
- **Payment Integration**: RevenueCat SDK for iOS/Android in-app purchases; Stripe Checkout for web.
- **Backend-Authoritative Entitlements**: Backend (`expathub.website`) is the single source of truth for access gating. RevenueCat handles purchase UX only.
- **Billing Orchestrator**: `src/billing/orchestrator.ts` manages purchase flows, syncing with backend entitlements.
- **Entitlement Management**: `EntitlementContext` provides unified access status.
- **Premium Content Gating**: `ProGate` component and `ProPaywall` manage access and display paywall.
- **Analytics**: Lightweight conversion tracking for user actions and purchases.
- **Non-Launch Country Gating**: Countries not in the `LAUNCH_COUNTRIES` array are marked as "Coming Soon".
- **Launch Countries**: Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, United Kingdom, Germany, Ireland, Australia (11 total).

### Continue / Last Viewed (v1.1)
- **Context**: `ContinueContext` (`src/contexts/ContinueContext.tsx`) persists last viewed country, section, and resource ID.
- **State**: `lastViewedCountrySlug`, `lastViewedSection` (resources/vendors/community/null), `lastViewedResourceId`.
- **Tracking**: Country detail, resources, vendors, and community pages call `recordView()` on mount.
- **Home Screen**: Shows "Continue where you left off" card with section context, navigates to last viewed page. "Clear" link resets.
- **Persistence**: AsyncStorage under `expathub_continue`.

### Saved Resources (v1.1)
- **Context**: `SavedContext` (`src/contexts/SavedContext.tsx`) manages bookmarked resources per country.
- **State**: `savedResourcesByCountry: Record<string, string[]>` — keyed by country slug, values are resource URLs.
- **Methods**: `toggleSavedResource()`, `isSaved()`, `getSavedResources()`, `removeSavedResource()`.
- **Resources Page**: Bookmark icon on each resource card toggles saved state.
- **Saved Page**: Route at `/country/[slug]/saved`, lists bookmarked resources with remove, empty state.
- **NavCard**: "Saved" card on country detail page navigates to saved page.
- **Persistence**: AsyncStorage under `expathub_saved`.

### Paywall Segmented Navigation (v1.1)
- **Tabs**: ProPaywall component has 3 segmented tabs: "What you get", "Plans" (default), "FAQ".
- **Fixed CTA**: Sticky bottom bar with "Start 30-Day Decision Access" button, visible when user has no access.
- **FAQ**: 5 expandable Q&A items covering Decision Briefs, multi-country access, cancellation, trial, and payment methods.

### Internationalization Sweep (v1.1)
- **Neutral Language**: All main content in `decisionBriefs.ts` uses "home country", "destination country", "state pension" instead of US-centric terms ("Social Security", "401(k)", "FBI check", "US prices").
- **Passport Scoping**: US-specific terms (IRS, US Social Security, etc.) only appear in `data/passportNotes.ts` entries scoped to `passport: "us"`.
- **Passport Persistence**: `EligibilitySnapshot` stores selected passport nationality via AsyncStorage (`expathub_passport_nationality`), pre-filling on subsequent visits.
- **No US Default**: Passport nationality dropdown defaults to `null` (requires selection).
- **Privacy Note**: "Stored only on your device and not shared." displayed above bracket inputs in EligibilitySnapshot.
- **Country Page**: Passport Notes notice says "7 nationality groups" (not "including US, UK, EU, and more").

### Expanding Soon / Waitlist (v1.1)
- **Location**: Explore screen (`app/(tabs)/explore/index.tsx`), bottom section.
- **Countries**: France, Italy, Thailand, Mexico, New Zealand — muted cards, no navigation to country pages.
- **Waitlist Modal**: Email (required) + optional note, POST to `/api/waitlist`, stores in `waitlist` table (PostgreSQL).
- **Backend**: `POST /api/waitlist` in `server/routes.ts` — validates email/countrySlug, inserts via `pg` pool.
- **DB Table**: `waitlist` (id serial PK, country_slug, email, note, created_at) — defined in `shared/schema.ts`.
- **Analytics**: `waitlist_joined` event on successful submission.
- **No auth required, no entitlement checks.**

### Source Badge Classification (v1.1)
- **Three levels**: `official` (immigration/visa authorities), `authoritative` (tax, health, employment institutions), `community` (commercial/third-party).
- **Counts**: 15 official, 20 authoritative, 10 community (45 total).
- **Info Legend**: Resources page has an info icon next to title that toggles an inline explainer card.
- **Component**: `src/components/SourceBadge.tsx` renders all three levels with neutral styling.

### Planner Layer (v1.1)
- **Purpose**: Semi-linear 6-step relocation planning system for paid users.
- **Context**: `PlanContext` (`src/contexts/PlanContext.tsx`) manages plan state with AsyncStorage persistence.
- **State**: `activeCountrySlug`, `activePathwayId`, `completedSteps[]` — one active plan at a time.
- **Steps**: Fixed 6-step structure in `src/data/planSteps.ts` (Confirm Pathway, Validate Finances, Prepare Docs, Execute Residency, Register Local, Post-Arrival Compliance).
- **Components**:
  - `PlanModule` (`src/components/PlanModule.tsx`) — expandable step cards with checklists
  - `EligibilitySnapshot` (`src/components/EligibilitySnapshot.tsx`) — bracket-based eligibility check inside Step 1
  - `LifetimeOfferBanner` (`src/components/LifetimeOfferBanner.tsx`) — inline upsell after 2+ steps completed
  - `PlanCompletionCard` (`src/components/PlanCompletionCard.tsx`) — shown when all 6 steps done
- **Integration**: Country page (`app/(tabs)/country/[slug]/index.tsx`) shows Focus Activation for paid users, PlanModule for active plans.
- **Analytics Events**: `plan_focus_started`, `plan_step_completed`, `eligibility_snapshot_run`, `lifetime_offer_shown`, `lifetime_offer_clicked`, `plan_completed`.
- **Tone**: Calm, advisory — no exclamation marks, no urgency, no legal assurance language.

## External Dependencies

### Core Runtime
- Expo SDK 54
- React 19.1 / React Native 0.81
- Express 5

### Database & ORM
- PostgreSQL
- Drizzle ORM
- drizzle-zod
- pg

### State & Data Fetching
- @tanstack/react-query
- @react-native-async-storage/async-storage

### Navigation & UI
- expo-router
- react-native-gesture-handler
- react-native-reanimated
- react-native-screens
- react-native-safe-area-context
- react-native-keyboard-controller
- @expo/vector-icons / Ionicons
- expo-web-browser

### Subscription & Payments
- react-native-purchases (RevenueCat SDK)
- Stripe API

### Build Tools
- tsx
- esbuild
- drizzle-kit
- patch-package