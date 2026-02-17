# ExpatHub — Architecture Specification

**Version:** 1.0
**Date:** February 2026
**Company:** Magic Elf Digital
**Contact:** support@magicelfdigital.com

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Data Architecture](#5-data-architecture)
6. [Authentication Architecture](#6-authentication-architecture)
7. [Subscription & Payment Architecture](#7-subscription--payment-architecture)
8. [Design System](#8-design-system)
9. [Analytics](#9-analytics)
10. [Environment & Deployment](#10-environment--deployment)
11. [External Service Dependencies](#11-external-service-dependencies)

---

## 1. System Overview

ExpatHub is a mobile-first application built with Expo and React Native that provides decision-ready intelligence for international relocation. It covers visa pathways, work authorization rules, financial realities, and residency options across 8 launch countries.

| Attribute        | Detail                                                        |
|------------------|---------------------------------------------------------------|
| Platform targets | iOS, Android, Web                                             |
| Framework        | Expo SDK 54 / React Native 0.81 / React 19.1                 |
| Business model   | Freemium with 3-tier monetization                             |
| Company          | Magic Elf Digital                                             |
| Launch countries | Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, United Kingdom |
| Total countries  | 32 listed (8 decision-ready, 24 coming soon)                  |

### Core Value Proposition

ExpatHub provides structured, opinionated guidance for people considering international relocation — covering visa pathways, work authorization clarity, financial realities, and residency timelines through premium Decision Briefs.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│                                                                     │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐             │
│   │     iOS      │   │   Android   │   │     Web     │             │
│   │  (Expo Go /  │   │  (Expo Go / │   │  (Browser)  │             │
│   │  native app) │   │  native app)│   │             │             │
│   └──────┬───────┘   └──────┬──────┘   └──────┬──────┘             │
│          │                  │                  │                     │
│          └──────────────────┼──────────────────┘                    │
│                             │                                       │
│              Expo / React Native (TypeScript)                       │
│              expo-router v6 (file-based routing)                    │
│              React Query + React Context                            │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ HTTP / REST
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                        BACKEND LAYER                                │
│                                                                     │
│                    Express.js v5 (port 5000)                        │
│                                                                     │
│   ┌───────────────────────────────────────────────────────┐        │
│   │  /api/auth              → Proxy to expathub.world     │        │
│   │  /api/auth/forgot-pwd   → Proxy to expathub.website   │        │
│   │  /api/stripe/checkout   → Stripe Checkout Sessions    │        │
│   │  /api/stripe/portal     → Stripe Customer Portal      │        │
│   │  /api/stripe/status     → Subscription status check   │        │
│   │  /api/stripe/webhook    → Stripe webhook handler      │        │
│   │  /privacy, /terms       → Static HTML pages           │        │
│   └───────────────────────────────────────────────────────┘        │
└──────────┬──────────────────┬──────────────────┬────────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐ ┌───────────────┐ ┌─────────────────────────────┐
│   DATABASE       │ │ STATIC DATA   │ │    EXTERNAL SERVICES        │
│                  │ │               │ │                             │
│  PostgreSQL      │ │  TypeScript   │ │  expathub.world (Auth API) │
│  (Neon-backed)   │ │  data files   │ │  expathub.website (Pwd)    │
│  Drizzle ORM     │ │  (countries,  │ │  RevenueCat (iOS/Android)  │
│  shared/schema   │ │   pathways,   │ │  Stripe (Web payments)     │
│                  │ │   briefs...)  │ │                             │
└──────────────────┘ └───────────────┘ └─────────────────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Technology Stack

| Technology                          | Version / Detail                          |
|-------------------------------------|-------------------------------------------|
| Expo SDK                            | 54                                        |
| React Native                        | 0.81                                      |
| React                               | 19.1                                      |
| TypeScript                          | Strict mode                               |
| Routing                             | expo-router v6 (file-based)               |
| Server state                        | @tanstack/react-query                     |
| Client state                        | React Context                             |
| Persistence                         | @react-native-async-storage/async-storage |
| Secure storage (native)             | expo-secure-store                         |
| Icons                               | @expo/vector-icons (Ionicons, Feather)    |
| Animations                          | react-native-reanimated                   |
| Gestures                            | react-native-gesture-handler              |
| Keyboard                            | react-native-keyboard-controller          |
| In-app purchases                    | react-native-purchases (RevenueCat)       |

### 3.2 Route Map

```
app/
├── _layout.tsx                  # Root layout — provider tree
├── +not-found.tsx               # 404 fallback
├── auth.tsx                     # Login / register modal
├── forgot-password.tsx          # Password reset request
├── account.tsx                  # User profile & subscription status
├── account-info.tsx             # Detailed account information
├── subscribe/
│   └── index.tsx                # Subscription modal (ProPaywall)
└── (tabs)/
    ├── _layout.tsx              # Tab bar: Home, Explore, Community, Countries
    ├── index.tsx                # Home screen
    ├── explore/
    │   ├── _layout.tsx          # Explore stack layout
    │   ├── index.tsx            # Topic cards grid
    │   ├── remote-work.tsx      # Remote work country analysis
    │   ├── sponsorship.tsx      # Employer sponsorship analysis
    │   ├── flexibility.tsx      # Flexibility options analysis
    │   ├── pr.tsx               # Permanent residency analysis
    │   ├── compare.tsx          # Country comparison matrix
    │   └── glossary.tsx         # Immigration glossary
    ├── community/
    │   └── index.tsx            # Community links (selected country)
    └── country/
        ├── _layout.tsx          # Country stack layout
        ├── index.tsx            # Browse all countries by region
        └── [slug]/
            ├── _layout.tsx      # Country detail stack
            ├── index.tsx        # Country hub (nav cards)
            ├── resources.tsx    # Official government links
            ├── vendors.tsx      # Service provider directory
            ├── community.tsx    # Country-specific community links
            └── pathways/
                ├── [key].tsx    # Pathway detail + Decision Brief
                └── passport-notes.tsx  # Nationality-specific notes
```

### 3.3 Context Providers

Provider nesting order (outermost → innermost):

| Order | Provider              | File                                | Purpose                                              |
|-------|-----------------------|-------------------------------------|------------------------------------------------------|
| 1     | QueryClientProvider   | lib/query-client.ts                 | React Query cache and default fetcher                |
| 2     | AuthProvider          | contexts/AuthContext.tsx             | JWT auth with expathub.world, token management       |
| 3     | CountryProvider       | contexts/CountryContext.tsx          | Selected country persistence via AsyncStorage        |
| 4     | SubscriptionProvider  | contexts/SubscriptionContext.tsx     | Bridge layer for backward compatibility              |

The `SubscriptionProvider` internally wraps `EntitlementProvider` (`src/contexts/EntitlementContext.tsx`) which manages RevenueCat entitlements, Stripe status, and subscription state with a customer info listener for real-time updates.

Exposed access functions:
- `hasFullAccess` — active subscription OR active decision pass
- `hasCountryAccess(slug)` — country-specific lifetime unlock
- `hasProAccess` — any paid access (full or country-level)

### 3.4 Component Library

ExpatHub uses a custom design token system with no external UI libraries. All components use `StyleSheet.create` for styling.

| Component           | File                              | Purpose                                                 |
|---------------------|-----------------------------------|---------------------------------------------------------|
| ProPaywall          | src/components/ProPaywall.tsx     | 3-tier purchase modal with contextual value propositions|
| ProGate             | src/lib/requireProAccess.ts       | Content gating: checks access → shows paywall           |
| DecisionBriefCard   | src/components/DecisionBriefCard.tsx | Premium brief content display                        |
| CompareMatrix       | src/components/CompareMatrix.tsx  | Horizontally scrollable country comparison table        |
| AvailabilityGate    | src/components/AvailabilityGate.tsx | Launch readiness / coming-soon gate                   |
| ComingSoon          | src/components/ComingSoon.tsx     | Coming soon disclosure badge                            |
| LastReviewedPill    | src/components/LastReviewedPill.tsx | Content freshness indicator                            |
| ErrorBoundary       | components/ErrorBoundary.tsx      | App-level error boundary with restart                   |

---

## 4. Backend Architecture

### 4.1 Express.js Server

| Attribute            | Detail                                                         |
|----------------------|----------------------------------------------------------------|
| Framework            | Express v5                                                     |
| Port                 | 5000                                                           |
| Language             | TypeScript (compiled via tsx)                                  |
| Entry point          | server/index.ts                                                |
| Route registration   | server/routes.ts                                               |
| CORS                 | Dynamically configured for Replit environments and localhost   |
| Production mode      | Serves static Expo web build                                  |
| Development mode     | Proxies requests to Expo dev server (port 8081)                |

### 4.2 API Routes

| Route                        | Method | Purpose                                                     |
|------------------------------|--------|-------------------------------------------------------------|
| `/api/auth`                  | ALL    | Proxy to expathub.world auth API (signin, register, signout, session check) |
| `/api/auth/forgot-password`  | POST   | Proxy to expathub.website for password reset (avoids CORS on web) |
| `/api/stripe/checkout`       | POST   | Create Stripe Checkout Session (accepts `priceId`)          |
| `/api/stripe/portal`         | POST   | Create Stripe Customer Portal session (accepts `customerId`)|
| `/api/stripe/status`         | GET    | Check current user's subscription status                    |
| `/api/stripe/webhook`        | POST   | Stripe webhook handler for payment events                   |
| `/privacy`                   | GET    | Privacy policy HTML (server/templates/privacy-policy.html)  |
| `/terms`                     | GET    | Terms of service HTML (server/templates/terms-of-service.html)|

### 4.3 Storage Interface

| Component     | File                | Detail                                              |
|---------------|---------------------|-----------------------------------------------------|
| IStorage      | server/storage.ts   | Abstract interface for future database integration  |
| MemStorage    | server/storage.ts   | Current in-memory implementation                    |
| Drizzle ORM   | drizzle.config.ts   | Configured with PostgreSQL dialect (Neon-backed)    |
| Schema        | shared/schema.ts    | Database schema (users table)                       |
| Migrations    | drizzle-kit          | Migration management tool                           |

---

## 5. Data Architecture

### 5.1 Static Data Files

All core content is stored as TypeScript files, not database records. This enables type safety, compile-time validation, and zero-latency data access.

| File                        | Content                             | Approximate Lines |
|-----------------------------|-------------------------------------|--------------------|
| `data/countries.ts`         | 32 countries across 6 regions       | 62                 |
| `data/pathways.ts`          | Visa routes per country             | 374                |
| `data/resources.ts`         | Official government links           | 269                |
| `data/vendors.ts`           | Service provider listings           | 59                 |
| `data/community.ts`         | Expat group links                   | 72                 |
| `data/glossary.ts`          | Immigration terminology             | —                  |
| `data/passportNotes.ts`     | Nationality-specific notes (7 types)| —                  |
| `src/data/decisionBriefs.ts`| Premium Decision Briefs (27+)       | 3,063              |
| `src/data/compareMatrix.ts` | Country comparison data             | 184                |
| `src/data/coverage.ts`      | Coverage status per country/section | 137                |
| `src/data/pro-offer.ts`     | Upsell messaging and value props    | 189                |

### 5.2 Data Access Layer

| File                  | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `src/data/index.ts`   | Centralized data access point — abstracts retrieval      |
| `src/data/types.ts`   | Canonical type definitions (Resource, Vendor, Pathway, Country, DecisionBrief, etc.) |

### 5.3 Content Quality System

Decision Briefs include a built-in quality and freshness system:

| Concept             | Values                                  | Purpose                                  |
|---------------------|-----------------------------------------|------------------------------------------|
| Confidence level    | High, Medium, Low                       | Indicates reliability of brief content   |
| Severity            | P0 (critical), P1 (important), P2 (minor) | Prioritizes content review urgency      |
| Review triggers     | Eligibility, work rights, income thresholds | Automated flags for content review     |
| Source validation   | Government domain requirement           | Ensures official source citations        |

Quality system files:

| File                           | Purpose                               |
|--------------------------------|---------------------------------------|
| `src/data/briefHelpers.ts`     | Brief data access utilities           |
| `src/data/briefValidation.ts`  | Content validation rules              |
| `src/data/briefSeverity.ts`    | Severity classification logic         |
| `src/data/briefReviewRules.ts` | Automated review trigger definitions  |

### 5.4 Content Monitoring

| Directory/File                          | Purpose                                    |
|-----------------------------------------|--------------------------------------------|
| `src/monitoring/`                       | Automated content monitoring system        |
| `src/monitoring/buildProposal.ts`       | Generates content update proposals         |
| `src/monitoring/severityHeuristics.ts`  | Severity classification heuristics         |
| `src/monitoring/volatility.ts`          | Tracks content change frequency            |
| `src/monitoring/approvalPolicy.ts`      | Approval workflow for content patches      |
| `monitoring/proposals.json`             | Pending content update proposals           |
| `monitoring/sources.json`               | Tracked source URLs                        |
| `monitoring/state.json`                 | Current monitoring state                   |

---

## 6. Authentication Architecture

### 6.1 Auth Flow

```
┌──────────────────────────────────────────────────────────┐
│  External Auth API: https://expathub.world               │
│                                                          │
│  POST /api/auth   { action: "signin",  email, password } │
│  POST /api/auth   { action: "register", email, password }│
│  POST /api/auth   { action: "signout" } + Bearer token  │
│  GET  /api/auth   (Authorization: Bearer <token>)        │
│                                                          │
│  Response: { token: JWT, user: { id, email } }           │
└──────────────────────────────────────────────────────────┘
```

| Aspect                | Detail                                                        |
|-----------------------|---------------------------------------------------------------|
| Auth API              | `https://expathub.world`                                      |
| Endpoint              | Single `POST /api/auth` with `action` parameter              |
| Session check         | `GET /api/auth` with `Authorization: Bearer <token>`         |
| Token type            | JWT                                                           |
| Token storage (native)| expo-secure-store                                             |
| Token storage (web)   | AsyncStorage (mapped to localStorage)                        |
| Context               | `AuthContext` in `contexts/AuthContext.tsx`                   |
| State exposed         | `user`, `token`, `loading`, `login`, `register`, `logout`, `getAuthHeaders` |

On web, auth requests are proxied through the Express backend at `/api/auth` to the external API to simplify CORS handling.

### 6.2 Forgot Password

| Aspect              | Detail                                                           |
|----------------------|------------------------------------------------------------------|
| External API         | `https://www.expathub.website/api/auth/forgot-password`         |
| Subdomain note       | `www` subdomain required to avoid TLS redirect issues           |
| Web flow             | Proxied through Express backend (`POST /api/auth/forgot-password`) to avoid CORS |
| Native flow          | Calls external URL directly (no CORS on native platforms)       |
| Reset flow           | Email → reset link → opens in phone's browser → user resets on web → returns to app to sign in |
| Token expiry         | 1 hour                                                          |

### 6.3 Auth UX Rules

| Rule                            | Detail                                                              |
|---------------------------------|---------------------------------------------------------------------|
| Free content                    | Accessible without login                                            |
| Premium content viewing         | Requires login                                                      |
| Purchase buttons                | Visible to everyone, including logged-out users                     |
| Purchases                       | Require account → pending purchase flow                             |
| Pending purchase flow           | Stores `{ type, countrySlug }` → redirects to auth → auto-resumes purchase after login |

---

## 7. Subscription & Payment Architecture

### 7.1 Three-Tier Model

| Tier                     | Price        | Type             | Product ID                    | Access Granted                       |
|--------------------------|--------------|------------------|-------------------------------|--------------------------------------|
| 30-Day Decision Pass     | $29          | Consumable       | `decision_pass_30d`           | Full access to all 8 countries for 30 days |
| Country Lifetime Unlock  | $69/country  | Non-consumable   | `country_lifetime_<slug>`     | Permanent access to one country      |
| Monthly Subscription     | $14.99/mo    | Auto-renewing    | `expathub_monthly`            | Ongoing full access to everything    |

### 7.2 Access Hierarchy

```
Monthly Subscription (full_access_subscription)
    > Decision Pass 30-day (decision_access)
        > Country Lifetime Unlock (country_<slug>)
            > None (free tier)
```

| Function                 | Returns true when                                          |
|--------------------------|------------------------------------------------------------|
| `hasFullAccess`          | Active subscription OR active (non-expired) decision pass  |
| `hasCountryAccess(slug)` | Country-specific lifetime unlock for that slug            |
| `hasProAccess`           | Any paid access (full or country-level)                   |

### 7.3 RevenueCat (iOS / Android)

| Attribute           | Detail                                                      |
|---------------------|-------------------------------------------------------------|
| SDK                 | `react-native-purchases`                                    |
| API key (iOS)       | `EXPO_PUBLIC_RC_IOS_KEY` environment variable               |
| API key (Android)   | `EXPO_PUBLIC_RC_ANDROID_KEY` environment variable            |
| Initialization      | `src/subscriptions/revenuecat.ts`                           |
| Customer info       | Real-time listener in EntitlementContext                     |

RevenueCat entitlement IDs:

| Entitlement ID               | Meaning                         |
|------------------------------|---------------------------------|
| `decision_access`            | 30-Day Decision Pass is active  |
| `full_access_subscription`   | Monthly subscription is active  |
| `country_portugal`           | Portugal lifetime unlock        |
| `country_spain`              | Spain lifetime unlock           |
| `country_canada`             | Canada lifetime unlock          |
| `country_costa_rica`         | Costa Rica lifetime unlock      |
| `country_panama`             | Panama lifetime unlock          |
| `country_ecuador`            | Ecuador lifetime unlock         |
| `country_malta`              | Malta lifetime unlock           |
| `country_united_kingdom`     | United Kingdom lifetime unlock  |

### 7.4 Stripe (Web)

| Attribute           | Detail                                                      |
|---------------------|-------------------------------------------------------------|
| Server-side key     | `STRIPE_SECRET_KEY` environment variable                    |
| Checkout            | Stripe Checkout Sessions for one-time and recurring payments|
| Customer Portal     | Stripe Customer Portal for subscription management          |
| Webhook             | `POST /api/stripe/webhook` for server-side event tracking   |
| Implementation      | `src/subscriptions/stripeWeb.ts`                            |

Stripe checkout modes:
- `mode: "payment"` — Decision Pass and Country Lifetime Unlock (one-time)
- `mode: "subscription"` — Monthly Subscription (recurring)

### 7.5 Entitlement Context

| Context                | File                                    | Purpose                                           |
|------------------------|-----------------------------------------|---------------------------------------------------|
| EntitlementContext      | `src/contexts/EntitlementContext.tsx`    | Unified access status from all sources             |
| SubscriptionContext     | `contexts/SubscriptionContext.tsx`       | Bridge layer for backward compatibility            |

EntitlementContext state:

| Field                    | Type       | Purpose                                         |
|--------------------------|------------|--------------------------------------------------|
| `hasProAccess`           | boolean    | Any paid access                                  |
| `hasFullAccess`          | boolean    | Subscription or decision pass                    |
| `accessType`             | string     | `decision_pass`, `country_lifetime`, `subscription`, `sandbox`, `none` |
| `source`                 | string     | `revenuecat`, `stripe`, `sandbox`, `none`        |
| `loading`                | boolean    | Entitlement check in progress                    |
| `managementURL`          | string     | Platform subscription management URL             |
| `expirationDate`         | string     | Subscription expiration (ISO date)               |
| `decisionPassExpiresAt`  | string     | Decision pass expiration (ISO date)              |
| `decisionPassDaysLeft`   | number     | Days remaining on decision pass                  |
| `unlockedCountries`      | string[]   | Array of unlocked country slugs                  |

Local storage keys:
- `decision_pass_purchased_at` — ISO date string in AsyncStorage
- `country_lifetime_unlocks` — JSON array of country slugs in AsyncStorage

### 7.6 Content Gating

```
User requests premium content
        │
        ▼
   ┌─────────────┐     YES
   │ hasFullAccess├──────────► Show content
   └──────┬──────┘
          │ NO
          ▼
   ┌─────────────────────┐     YES
   │ hasCountryAccess(slug)├──────────► Show content
   └──────┬──────────────┘
          │ NO
          ▼
     Show ProPaywall
     (3-tier purchase options)
```

| Component    | Purpose                                                          |
|--------------|------------------------------------------------------------------|
| ProGate      | Wraps premium content; checks access hierarchy before rendering  |
| ProPaywall   | 3-tier purchase modal with contextual value propositions         |
| Sandbox mode | Dev-only toggle (`__DEV__`) to simulate full access              |

---

## 8. Design System

### 8.1 Token System

Defined in `theme/tokens.ts`:

**Colors:**

| Token           | Value                     | Usage                               |
|-----------------|---------------------------|-------------------------------------|
| `bg`            | `#F7F5F0`                 | App background (warm off-white)     |
| `surface`       | `#FFFFFF`                 | Card backgrounds                    |
| `border`        | `rgba(0,0,0,0.10)`       | Subtle card borders                 |
| `text`          | `#0B1220`                 | Primary text color                  |
| `subtext`       | `rgba(11,18,32,0.65)`    | Secondary text                      |
| `primary`       | `#009C9C`                 | Teal accent (buttons, links, active)|
| `primarySoft`   | `rgba(0,156,156,0.12)`   | Teal background tint                |
| `primaryBorder` | `rgba(0,156,156,0.25)`   | Teal border accent                  |

**Spacing:**

| Token | Value (px) |
|-------|------------|
| `xs`  | 6          |
| `sm`  | 10         |
| `md`  | 14         |
| `lg`  | 16         |
| `xl`  | 20         |
| `xxl` | 28         |

**Border Radius:**

| Token  | Value (px) |
|--------|------------|
| `sm`   | 10         |
| `md`   | 12         |
| `lg`   | 16         |
| `pill` | 999        |

**Typography:**

| Token   | Size (px) | Usage              |
|---------|-----------|---------------------|
| `small` | 12        | Captions, labels    |
| `body`  | 14        | Body text           |
| `h3`    | 16        | Section headings    |
| `h2`    | 20        | Page subheadings    |
| `h1`    | 26        | Page titles         |

**Font Weights:**

| Token     | Value | Usage                    |
|-----------|-------|--------------------------|
| `regular` | 400   | Body text                |
| `bold`    | 700   | Emphasis, labels         |
| `black`   | 900   | Headings, CTAs           |

### 8.2 Visual Identity

- Warm off-white background (`#F7F5F0`) with white card surfaces
- Teal primary accent (`#009C9C`) for buttons, links, and active states
- Heavy use of font weight 900 for headings and CTAs
- Ionicons throughout the app — no emojis
- 16px border radius on cards (`tokens.radius.lg`)
- Subtle borders (`rgba(0,0,0,0.10)`) — no drop shadows
- Cards use `StyleSheet.create` — no external UI component libraries

---

## 9. Analytics

| Attribute         | Detail                                                    |
|-------------------|-----------------------------------------------------------|
| Implementation    | `src/lib/analytics.ts`                                    |
| Architecture      | Pluggable listener system                                 |
| Dev mode          | Console logging with prefixed messages                    |
| Production        | Dispatched to registered listeners                        |

### Key Events

| Event                    | Trigger                                         |
|--------------------------|-------------------------------------------------|
| `paywall_shown`          | ProPaywall component rendered                   |
| `subscribe_success`      | Successful purchase of any tier                 |
| `decision_brief_opened`  | User views a Decision Brief                     |
| `entitlement_refresh`    | Entitlement state refreshed (with source/status)|
| `purchase_initiated`     | Purchase button tapped (with type)              |
| `purchase_completed`     | Purchase flow completed (with status)           |
| `purchase_cancelled`     | User cancelled purchase flow                    |
| `purchase_restored`      | Purchases restored                              |

### Console Log Prefixes

| Prefix       | Domain                                           |
|--------------|--------------------------------------------------|
| `[AUTH]`     | Login, register, session restore, logout         |
| `[PURCHASE]` | Purchase taps, pending storage, checkout         |
| `[GATE]`    | Entitlement checks, access decisions             |
| `[RC]`      | RevenueCat init, user login, entitlement queries |

---

## 10. Environment & Deployment

### 10.1 Environment Variables

| Variable                       | Type   | Purpose                                          |
|--------------------------------|--------|--------------------------------------------------|
| `EXPO_PUBLIC_RC_IOS_KEY`       | Secret | RevenueCat iOS API key                           |
| `EXPO_PUBLIC_RC_ANDROID_KEY`   | Secret | RevenueCat Android API key                       |
| `SESSION_SECRET`               | Secret | Express session signing key                      |
| `STRIPE_SECRET_KEY`            | Secret | Stripe API key for web payments                  |
| `DATABASE_URL`                 | Env    | PostgreSQL connection string (Neon)              |
| `PASSWORD_API_URL`             | Env    | Base URL for password reset API (`www.expathub.website`) |
| `EXPO_PUBLIC_AUTH_API_URL`     | Env    | Auth API base URL (`www.expathub.world`)         |

### 10.2 Build & Development

| Command               | Purpose                              | Port  |
|------------------------|--------------------------------------|-------|
| `npm run expo:dev`     | Start Expo dev server with HMR       | 8081  |
| `npm run server:dev`   | Start Express backend                | 5000  |

Build tools:

| Tool           | Purpose                             |
|----------------|-------------------------------------|
| `tsx`          | TypeScript execution for server     |
| `esbuild`     | Fast bundling                       |
| `drizzle-kit`  | Database migration management       |
| `patch-package`| Patch third-party dependencies      |

### 10.3 Launch Countries

| Country         | Slug              | Region          |
|-----------------|--------------------|-----------------|
| Portugal        | `portugal`         | Europe          |
| Spain           | `spain`            | Europe          |
| Canada          | `canada`           | North America   |
| Costa Rica      | `costa-rica`       | Central America |
| Panama          | `panama`           | Central America |
| Ecuador         | `ecuador`          | South America   |
| Malta           | `malta`            | Europe          |
| United Kingdom  | `united-kingdom`   | Europe          |

---

## 11. External Service Dependencies

| Service              | Purpose                        | Integration Point                                     |
|----------------------|--------------------------------|-------------------------------------------------------|
| expathub.world       | Authentication API             | `AuthContext`, proxied via Express `/api/auth`         |
| expathub.website     | Password reset API             | `forgot-password.tsx`, Express proxy `/api/auth/forgot-password` |
| RevenueCat           | iOS/Android in-app purchases   | `EntitlementContext`, `src/subscriptions/revenuecat.ts`|
| Stripe               | Web payments                   | `src/subscriptions/stripeWeb.ts`, Express `/api/stripe/*` routes |
| Neon (PostgreSQL)    | Database hosting               | Drizzle ORM, `shared/schema.ts`                       |

---

*ExpatHub Architecture Specification v1.0 — February 2026 — Magic Elf Digital*
