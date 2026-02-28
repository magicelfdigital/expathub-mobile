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
- **Forgot Password**: Handled via `expathub.website` with email-based reset.

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