# ExpatHub - Product Requirements Document & Technical Specification

**Version:** 1.0
**Date:** February 2026
**Company:** Magic Elf Digital
**Contact:** support@magicelfdigital.com

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Target Audience](#2-target-audience)
3. [Business Model](#3-business-model)
4. [Feature Requirements](#4-feature-requirements)
5. [Information Architecture](#5-information-architecture)
6. [Screen-by-Screen Specification](#6-screen-by-screen-specification)
7. [Content Inventory](#7-content-inventory)
8. [Subscription & Paywall Logic](#8-subscription--paywall-logic)
9. [Technical Architecture](#9-technical-architecture)
10. [Data Models](#10-data-models)
11. [API Specification](#11-api-specification)
12. [Design System](#12-design-system)
13. [Analytics Events](#13-analytics-events)
14. [Content Quality System](#14-content-quality-system)
15. [Pre-Launch Checklist](#15-pre-launch-checklist)

---

## 1. Product Overview

### What It Is

ExpatHub is a mobile-first application that provides decision-ready intelligence for international relocation. It covers visa pathways, work authorization rules, financial realities, and residency options across 8 launch countries.

### Problem Statement

People considering international relocation spend months on forums, Facebook groups, and scattered blog posts trying to piece together outdated, contradictory advice. There is no single source of structured, opinionated guidance that tells them what actually works, what doesn't, and what the real costs and timelines are.

### Solution

ExpatHub provides:
- Structured country comparison tools
- Official government resource directories
- Vetted vendor listings (lawyers, tax advisors, relocation services)
- Community connections (expat groups, forums, meetups)
- **Decision Briefs** (premium): detailed, opinionated guides covering work authorization clarity, sponsorship requirements, visa choice guidance, financial reality checks, and common mistakes

### Value Proposition

"ExpatHub doesn't sell you a dream. We give you the information you need to make a confident, informed decision about one of the biggest moves of your life."

### Launch Countries (Decision-Ready)

| Country | Region | Pathways |
|---------|--------|----------|
| Portugal | Europe | D7 (Passive Income), D8 (Digital Nomad), Student Visa |
| Spain | Europe | Non-Lucrative Visa, Digital Nomad Visa, Student Visa |
| Canada | North America | Express Entry |
| Costa Rica | Central America | Rentista Visa, Pensionado Visa |
| Panama | Central America | Friendly Nations Visa, Pensionado Visa, Self Economic Solvency Visa |
| Ecuador | South America | Rentista Visa, Jubilado (Retirement) Visa |
| Malta | Europe | Nomad Residence Permit, Global Residence Programme |
| United Kingdom | Europe | Skilled Worker Visa, Global Talent Visa, Innovator Founder Visa |

### Coming Soon

France, Italy, Thailand, Mexico, Ireland, Germany, Netherlands, Sweden, Norway, Denmark, Switzerland, Austria, Greece, Belize, Guatemala, Colombia, Uruguay, Chile, Argentina, Brazil, Japan, Singapore, Malaysia, Australia, New Zealand.

---

## 2. Target Audience

### Primary Personas

1. **Remote workers** exploring where to base themselves internationally
2. **Professionals** considering an international career move with employer sponsorship
3. **Retirees** researching affordable, high-quality destinations
4. **Digital nomads** ready to transition from temporary stays to legal residency
5. **Families** evaluating the best country for their next chapter

### User Characteristics

- Typically US, UK, or EU citizens considering relocation
- Age range: 25-65
- Comfortable with mobile apps
- Willing to pay for high-quality, actionable information
- Currently in the research/comparison phase of relocation planning

---

## 3. Business Model

### Freemium Tiers

**Free Tier:**
- Country browsing and selection (32 countries listed, 8 decision-ready)
- Pathway summaries (title, description, who it's for, who it's not for)
- Official government resource links
- Vendor directory per country
- Community links per country
- Country comparison matrix (5 free rows)
- Explore topics (remote work, sponsorship, flexibility, permanent residency, compare)

**Pro Tier (3 purchase options):**

1. **30-Day Decision Pass — $29 one-time (consumable)**
   - Full access to all 8 launch countries for 30 days
   - Decision Briefs, premium pathway details, pro comparison rows
   - Product ID: `decision_pass_30d`

2. **Country Lifetime Unlock — $69 per country, one-time (non-consumable)**
   - Permanent access to one country's Decision Briefs and premium pathway details
   - Product IDs: `country_lifetime_<slug>` (e.g., `country_lifetime_portugal`)

3. **Monthly Subscription — $14.99/month, auto-renewing**
   - Ongoing full access to all countries and premium content
   - Product ID: `expathub_monthly`

### Payment Processing

| Platform | Provider | Details |
|----------|----------|---------|
| iOS | RevenueCat | Entitlements: `decision_access`, `full_access_subscription`, `country_<slug>`. Products: `decision_pass_30d`, `country_lifetime_<slug>` (×8), `expathub_monthly`. API key env: `EXPO_PUBLIC_RC_IOS_KEY` |
| Android | RevenueCat | Same entitlements and products. API key env: `EXPO_PUBLIC_RC_ANDROID_KEY` |
| Web | Stripe | Checkout Sessions for purchase, Customer Portal for management. Server-side via `STRIPE_SECRET_KEY` |

### Revenue Targets

- Not specified. Primary goal is building a subscriber base with high-quality content that reduces churn.

---

## 4. Feature Requirements

### F1: Country Selection & Persistence

**Priority:** P0 (Must Have)

- User selects a country from the browse list or popular destinations
- Selection persists across sessions via AsyncStorage
- First-time users see a welcome screen with value propositions
- Returning users see a "Welcome back" card with their selected country

### F2: Country Hub

**Priority:** P0

- Per-country landing page showing all available sections
- Navigation cards for: Decision Brief, Pathways, Resources, Vendors, Community
- Coverage badges showing "Ready" or "Coming soon" status per section
- Links to official government resources

### F3: Decision Briefs (Premium)

**Priority:** P0

- Country overview briefs (e.g., "Portugal: popular for a reason, but the hype hides real problems")
- Pathway-specific briefs (e.g., detailed D7 visa analysis)
- Brief sections: headline, decision summary, recommended for, not recommended for, key requirements, financial reality, timeline reality, risk flags, common mistakes, better alternatives, work reality, family & dependents, lifestyle & culture
- Confidence level indicator (High / Medium / Conditional)
- Last reviewed date and source links
- Gated behind Pro subscription

### F4: Pathway Details

**Priority:** P0

- Free: title, summary, who it's for, who it's not for, official links
- Premium: step-by-step process, timeline, cost range
- Official links open in external browser
- Premium content gated with ProGate component

### F5: Explore Topics

**Priority:** P1

- Topic-based browsing with 5 categories:
  1. "I need to keep working" (remote work rules)
  2. "I want a local job (sponsorship)" (employer sponsorship realities)
  3. "I'm not sure yet — flexibility" (options that preserve flexibility)
  4. "I want to stay long-term (PR)" (permanent residency paths)
  5. "Compare countries" (side-by-side matrix)
- Each topic shows relevant countries and pathways

### F6: Country Comparison Matrix

**Priority:** P1

- Side-by-side comparison of all 8 launch countries
- Free rows: Residency pathways, Work without sponsorship, Path to permanent residency, Typical timeline, Language requirement
- Pro rows: Work sponsorship reality, Income thresholds, Tax exposure risk, Bureaucracy difficulty, Not ideal for
- Horizontally scrollable table

### F7: Resources Directory

**Priority:** P1

- Official government links per country (immigration offices, tax authorities, healthcare portals)
- Categorized by: visa, tax, housing, healthcare, work
- Source type tags: official, community, expert
- Opens links in external browser

### F8: Vendor Directory

**Priority:** P1

- Service provider listings per country
- Categories: Legal, Tax, Housing, Relocation
- Direct links to vendor websites

### F9: Community Links

**Priority:** P1

- Expat group and community links per country
- Types: Meetups, Forums, Facebook, Expat groups, General, Discord, WhatsApp
- Default community links shown when no country-specific links exist

### F10: Subscription Management

**Priority:** P0

- ProPaywall component shown when non-Pro users access premium content
- Contextual value propositions based on entry point (compare, brief, pathway, general)
- Monthly and yearly plan options with dynamic pricing from RevenueCat offerings
- Purchase, restore, and manage subscription flows
- Sandbox mode toggle in development for testing
- Subscription management via RevenueCat management URL or platform-native settings

### F11: Privacy Policy & Terms of Service

**Priority:** P0

- Accessible from the home screen footer
- Served as HTML pages from the backend
- Links to: privacy policy, terms of service
- Company: Magic Elf Digital

### F12: Authentication

**Priority:** P0

- JWT-based auth with external API at `expathub.world`
- Single endpoint `POST /api/auth` with action parameter (`signin`, `signout`)
- Token stored via `expo-secure-store` (iOS/Android) or `AsyncStorage` (web)
- Free content accessible without login
- Purchases require account creation with pending-purchase flow (stores purchase intent, redirects to auth, completes purchase after login)

### F13: Forgot Password

**Priority:** P1

- `POST /api/auth/forgot-password` on `expathub.website`
- Reset link sent via email opens in phone's browser
- User resets password on web, returns to app to sign in
- On web, proxied through Express backend to avoid CORS
- 1-hour token expiry

### F14: Passport Notes

**Priority:** P1

- Nationality-specific notes for each pathway across 7 passport types (US, UK, CA, AU, EU, JP, CR)
- Displayed on pathway detail screens in a "Passport Notes" section
- All pathways have notes for all 7 passport types — coverage is complete

---

## 5. Information Architecture

### Navigation Structure

```
Root Layout
├── (tabs)
│   ├── Home (index)           — Welcome / returning user dashboard
│   ├── Explore                — Topic-based browsing
│   │   ├── index              — Topic cards grid
│   │   ├── remote-work        — Remote work country analysis
│   │   ├── sponsorship        — Sponsorship country analysis
│   │   ├── flexibility        — Flexibility country analysis
│   │   ├── pr                 — Permanent residency analysis
│   │   └── compare            — Country comparison matrix
│   ├── Community              — Community links for selected country
│   └── Countries              — Country browsing & detail
│       ├── index              — Browse all countries by region
│       └── [slug]             — Country hub
│           ├── index          — Country overview with nav cards
│           ├── pathways/[key] — Individual pathway detail + decision brief
│           ├── resources      — Official resources list
│           ├── vendors        — Vendor directory
│           └── community      — Country-specific community links
└── subscribe/index            — Subscription modal (ProPaywall)
```

### Tab Bar

| Tab | Label | Icon | Route |
|-----|-------|------|-------|
| 1 | Home | `home` | `/(tabs)/index` |
| 2 | Explore | `compass` | `/(tabs)/explore` |
| 3 | Community | `people` | `/(tabs)/community/index` |
| 4 | Countries | `earth` | `/(tabs)/country` |

---

## 6. Screen-by-Screen Specification

### 6.1 Home Screen

**Route:** `/(tabs)/index`

**First-time user (no country selected):**
- Brand logo (full logo, transparent background)
- Tagline: "Move abroad with clarity"
- Description of the app's purpose
- Three value propositions with icons:
  1. "Decision Briefs that clarify what work is actually allowed"
  2. "Compare pathways side-by-side across countries"
  3. "Verified vendors, resources, and community connections"
- Primary CTA: "Choose your country" button
- Coverage note: "Decision-ready: Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, UK"

**Returning user (country selected):**
- "Welcome back" greeting
- Continue card with selected country name and "Pick up where you left off"
- Popular destinations list (up to 6 countries)

**Footer (always):**
- Privacy Policy link
- Terms of Service link
- "2026 Magic Elf Digital" copyright

### 6.2 Explore Screen

**Route:** `/(tabs)/explore/index`

- Grid of 5 topic cards, each with:
  - Title describing the user's intent
  - Subtitle with brief guidance
  - Accent color and icon
  - Tap navigates to topic detail screen

### 6.3 Explore Topic Detail (Remote Work, Sponsorship, etc.)

**Routes:** `/(tabs)/explore/remote-work`, `sponsorship`, `flexibility`, `pr`

- Country-specific analysis for the selected topic
- Shows relevant pathways and considerations per country
- Links to country detail pages and pathway details

### 6.4 Country Comparison

**Route:** `/(tabs)/explore/compare`

- Horizontally scrollable comparison matrix
- All 8 launch countries as columns
- 10 comparison rows (5 free, 5 pro-gated)
- Pro rows show lock icon and upgrade prompt for non-Pro users

### 6.5 Community Screen

**Route:** `/(tabs)/community/index`

- Shows community links for the currently selected country
- Falls back to default community links if no country-specific data exists
- Links open in external browser

### 6.6 Browse Countries

**Route:** `/(tabs)/country/index`

- All 32 countries grouped by region
- Region sections: Europe, North America, Central America, South America, Asia, Oceania
- Each country card shows name and region
- Launch countries show "Ready" badge
- Non-launch countries show "Coming soon" badge
- Tapping a country sets it as selected and navigates to country hub

### 6.7 Country Hub

**Route:** `/(tabs)/country/[slug]/index`

- Country name as header
- Navigation cards for each section:
  - Decision Brief (premium) — opens pathway detail with overview brief
  - Pathways — lists visa/immigration routes
  - Resources — official government links
  - Vendors — service providers
  - Community — expat groups
- Each card shows coverage status badge
- For non-launch countries: "Coming soon" message with general resources

### 6.8 Pathway Detail

**Route:** `/(tabs)/country/[slug]/pathways/[key]`

- **Free content (always visible):**
  - Pathway title and summary
  - "Who this is for" list
  - "Who this is NOT for" list
  - Official links (government websites)

- **Premium content (Pro only):**
  - Decision Brief card with full brief content
  - Step-by-step process
  - Realistic timeline
  - Cost range
  - If not Pro: ProGate component blocks premium content and shows paywall

### 6.9 Resources Screen

**Route:** `/(tabs)/country/[slug]/resources`

- List of official government links for the country
- Each resource shows: label, note, URL
- Categorized by: visa, tax, housing, healthcare, work
- Source type indicator: official, community, expert
- Links open in external browser

### 6.10 Vendors Screen

**Route:** `/(tabs)/country/[slug]/vendors`

- List of vetted service providers
- Each vendor shows: name, category, note, URL
- Categories: Legal, Tax, Housing, Relocation
- Links open in external browser

### 6.11 Country Community Screen

**Route:** `/(tabs)/country/[slug]/community`

- Community links specific to the selected country
- Types: Meetups, Forums, Facebook, Expat groups, Discord, WhatsApp, General
- Each link shows: name, type, note, URL

### 6.12 Subscribe Modal

**Route:** `/subscribe/index`

- Presented as a modal overlay
- Contains the ProPaywall component
- Accessible from any ProGate interception point

### 6.13 Auth Screen

**Route:** `/auth`

- Login/register modal with email and password fields
- Toggle between "Sign In" and "Create Account" modes
- "Forgot password?" link visible in login mode
- Pending purchase flow: stores purchase intent before redirecting to auth, completes purchase after successful login
- Profile icon in tab header navigates to auth (if logged out) or account (if logged in)

### 6.14 Forgot Password Screen

**Route:** `/forgot-password`

- Email input field
- Calls `POST /api/auth/forgot-password` on `expathub.website`
- Shows confirmation message: "If an account exists for that email, we've sent password reset instructions. Check your spam folder if you don't see it."
- Notes 1-hour token expiry
- "Back to Sign In" button

### 6.15 Account Screen

**Route:** `/account`

- User email display
- Access level indicator: Decision Pass / Country Unlock / Monthly / Free
- Unlocked countries displayed as chips (for country lifetime unlocks)
- Decision Pass: shows days remaining
- Manage subscription link
- Logout button

### 6.16 ProPaywall (Component)

- **Header:** Contextual headline based on entry point
- **Value propositions:** Dynamic based on country/pathway context
- **Pricing:** Three purchase options
  - Decision Pass: $29 one-time, 30-day full access (primary CTA)
  - Country Lifetime Unlock: $69 one-time per country (shown when country context exists)
  - Monthly Subscription: $14.99/month, ongoing full access (secondary option)
  - Dynamic pricing from RevenueCat when available
- **Actions:**
  - Purchase button per tier (initiates purchase)
  - Restore purchases button
  - Manage subscription button (for existing subscribers)
- **Pending purchase flow:** If user is not logged in, stores purchase intent and redirects to auth screen
- **Sandbox toggle:** Dev-only switch to simulate Pro access
- **Coverage summary:** Shows decision-ready country count

---

## 7. Content Inventory

### Decision Briefs (27 total)

| Country | Brief ID | Type |
|---------|----------|------|
| Portugal | portugal-overview | Country overview |
| Portugal | portugal-d7 | Pathway (D7 Passive Income) |
| Portugal | portugal-d8 | Pathway (D8 Digital Nomad) |
| Portugal | portugal-student | Pathway (Student Visa) |
| Spain | spain-overview | Country overview |
| Spain | spain-nlv | Pathway (Non-Lucrative Visa) |
| Spain | spain-dnv | Pathway (Digital Nomad Visa) |
| Spain | spain-student | Pathway (Student Visa) |
| France | france-overview | Country overview |
| France | france-talent-passport | Pathway (Talent Passport) |
| Italy | italy-overview | Country overview |
| Italy | italy-elective-residency | Pathway (Elective Residency) |
| Italy | italy-digital-nomad | Pathway (Digital Nomad) |
| Thailand | thailand-overview | Country overview |
| Thailand | thailand-ltr | Pathway (Long-Term Resident) |
| Thailand | thailand-retirement | Pathway (Retirement) |
| Costa Rica | costa-rica-overview | Country overview |
| Costa Rica | costa-rica-rentista | Pathway (Rentista) |
| Costa Rica | costa-rica-pensionado | Pathway (Pensionado) |
| Mexico | mexico-overview | Country overview |
| Mexico | mexico-temporary-resident | Pathway (Temporary Resident) |
| Mexico | mexico-permanent-resident | Pathway (Permanent Resident) |
| Canada | canada-overview | Country overview |
| Canada | canada-express-entry | Pathway (Express Entry) |
| Panama | panama-overview | Country overview |
| Panama | panama-friendly-nations | Pathway (Friendly Nations) |
| Panama | panama-pensionado | Pathway (Pensionado) |
| Panama | panama-self-economic-solvency | Pathway (Self Economic Solvency) |
| Ecuador | ecuador-overview | Country overview |
| Ecuador | ecuador-rentista | Pathway (Rentista) |
| Ecuador | ecuador-jubilado | Pathway (Jubilado) |
| Malta | malta-overview | Country overview |
| Malta | malta-digital-nomad | Pathway (Nomad Residence Permit) |
| Malta | malta-grp | Pathway (Global Residence Programme) |
| UK | united-kingdom-overview | Country overview |
| UK | united-kingdom-skilled-worker | Pathway (Skilled Worker) |
| UK | united-kingdom-global-talent | Pathway (Global Talent) |
| UK | united-kingdom-innovator-founder | Pathway (Innovator Founder) |

### Decision Brief Structure

Each brief contains:

```
headline                  — One-line opinionated summary
decisionSummary           — 2-3 sentence overview of the real situation
recommendedFor[]          — Who this country/pathway is genuinely good for
notRecommendedFor[]       — Who should look elsewhere (and why)
keyRequirements[]         — What you actually need (documents, money, etc.)
financialReality[]        — Real costs, not official minimums
timelineReality[]         — Actual processing times and delays
riskFlags[]               — Things that could go wrong
commonMistakes[]          — Expensive errors other people have made
betterAlternatives[]?     — Other options to consider instead
workReality[]?            — What work you can actually do legally
familyAndDependents[]?    — Implications for spouse/children
lifestyleAndCulture[]?    — Cultural adjustment realities
confidenceLevel           — High | Medium | Conditional
lastReviewedAt            — ISO date of last content review
sourceLinks[]?            — Official government source URLs
changeLog[]?              — Record of content changes with severity
```

### Comparison Matrix Dimensions

| Row | Free/Pro | Example Data |
|-----|----------|-------------|
| Residency pathways | Free | "D7, D8, Student" |
| Work without sponsorship | Free | "Yes (D7, D8)" |
| Path to permanent residency | Free | "5 years" |
| Typical timeline | Free | "2-6 months" |
| Language requirement | Free | "No formal requirement" |
| Work sponsorship reality | Pro | "Growing tech scene; limited outside Lisbon/Porto" |
| Income thresholds | Pro | "D7: ~€760/mo; D8: €3,510/mo" |
| Tax exposure risk | Pro | "Medium — NHR gutted in 2024" |
| Bureaucracy difficulty | Pro | "High — AIMA backlog severe" |
| Not ideal for | Pro | "Budget expats; anyone needing fast processing" |

---

## 8. Subscription & Paywall Logic

### Access Hierarchy

```
Monthly Subscription (full_access_subscription)
    > Decision Pass 30-day (decision_access)
        > Country Lifetime Unlock (country_<slug>)
            > None (free tier)
```

- `hasFullAccess` = `true` when user has an active monthly subscription OR an active (non-expired) decision pass
- `hasCountryAccess(slug)` = `true` when user has a country lifetime unlock for that specific country
- Content gating checks `hasFullAccess` first, then falls back to `hasCountryAccess(slug)` for country-specific content

### Entitlement Flow

```
App Launch
    │
    ├── iOS/Android: Initialize RevenueCat SDK
    │   ├── Configure with platform API key
    │   ├── Get customer info
    │   ├── Check for entitlements: decision_access, full_access_subscription, country_<slug>
    │   ├── Check Decision Pass expiry (30-day window from purchase)
    │   └── Listen for real-time customer info updates
    │
    └── Web: Check Stripe subscription status
        └── GET /api/stripe/status
            └── Returns { hasProAccess: boolean }
```

### Content Gating Rules

| Content | Free Users | Decision Pass | Country Unlock | Monthly Sub |
|---------|------------|---------------|----------------|-------------|
| Pathway title, summary, whoFor, notFor | Visible | Visible | Visible | Visible |
| Pathway steps, timeline, costRange | Blocked (ProGate) | Visible | Visible (owned country) | Visible |
| Decision Brief (any) | Blocked (ProGate) | Visible | Visible (owned country) | Visible |
| Compare matrix (free rows) | Visible | Visible | Visible | Visible |
| Compare matrix (pro rows) | Blocked | Visible | Blocked | Visible |
| Resources | Visible | Visible | Visible | Visible |
| Vendors | Visible | Visible | Visible | Visible |
| Community | Visible | Visible | Visible | Visible |

### ProGate Component Behavior

1. Check `hasFullAccess` from EntitlementContext (subscription or decision pass)
2. If full access: render children (premium content)
3. Check `hasCountryAccess(slug)` for country-specific content
4. If country access: render children
5. If loading: show spinner
6. If no access: render ProPaywall with context props

### ProPaywall Display

- Shows 3 purchase options:
  - **Decision Pass ($29)** — Primary CTA. "Full access for 30 days"
  - **Country Lifetime Unlock ($69)** — Shown when country context exists. "Permanent access to [Country]"
  - **Monthly Subscription ($14.99/mo)** — Secondary option. "Ongoing full access"
- Contextual value propositions based on entry point
- Pending purchase flow for logged-out users (see below)

### Purchase Flow

**Decision Pass (iOS/Android — RevenueCat):**
1. User taps "Get Decision Pass" on paywall
2. If not logged in: store purchase intent, redirect to auth screen
3. After login: resume purchase flow
4. App calls `purchasePackage("decision_pass_30d")`
5. RevenueCat handles App Store / Play Store purchase dialog
6. On success: `decision_access` entitlement activates, purchase timestamp stored in AsyncStorage
7. ProGate re-evaluates and shows premium content

**Country Lifetime Unlock (iOS/Android — RevenueCat):**
1. User taps "Unlock [Country]" on paywall
2. If not logged in: store purchase intent with country slug, redirect to auth screen
3. After login: resume purchase flow
4. App calls `purchasePackage("country_lifetime_<slug>")`
5. RevenueCat handles purchase dialog
6. On success: `country_<slug>` entitlement activates, slug added to AsyncStorage unlocks array
7. ProGate re-evaluates for that country's content

**Monthly Subscription (iOS/Android — RevenueCat):**
1. User taps "Subscribe Monthly" on paywall
2. If not logged in: store purchase intent, redirect to auth screen
3. After login: resume purchase flow
4. App calls `purchasePackage("expathub_monthly")`
5. RevenueCat handles subscription dialog
6. On success: `full_access_subscription` entitlement activates
7. ProGate re-evaluates and shows all premium content

**Web (Stripe):**
1. User taps purchase option on paywall
2. Frontend calls `POST /api/stripe/checkout` with `priceId`
3. Server creates Stripe Checkout Session
4. User redirected to Stripe-hosted checkout page
5. On success: redirected back with `?checkout=success`
6. App checks `GET /api/stripe/status` for updated entitlement

### Pending Purchase Flow (Logged-Out Users)

1. User taps any purchase option while not logged in
2. App stores purchase intent in memory: `{ type: "decision_pass" | "country_lifetime" | "monthly", slug?: string }`
3. User redirected to auth screen
4. After successful login/registration, app checks for pending purchase intent
5. If intent exists: automatically resumes purchase flow with stored parameters
6. If no intent: normal post-login navigation

### Sandbox Mode

- Enabled when `EXPO_PUBLIC_SANDBOX_MODE === "true"` or `__DEV__` is true
- Toggle switch visible on paywall in dev mode
- When enabled: `hasProAccess` returns true with source "sandbox"
- No real purchase required for testing

---

## 9. Technical Architecture

### Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo SDK | 54 |
| UI | React Native | 0.81 |
| Language | TypeScript | - |
| Routing | expo-router | v6 (file-based) |
| State (server) | @tanstack/react-query | - |
| State (client) | React Context + AsyncStorage | - |
| Backend | Express | v5 |
| Database | PostgreSQL (Neon) via Drizzle ORM | - |
| Payments (mobile) | RevenueCat (react-native-purchases) | - |
| Payments (web) | Stripe API | - |
| Icons | @expo/vector-icons (Ionicons) | - |
| Animations | react-native-reanimated | - |
| Gestures | react-native-gesture-handler | - |

### Platform Targets

- iOS (via Expo Go / EAS Build)
- Android (via Expo Go / EAS Build)
- Web (via Expo Web)

### Project Structure

```
/
├── app/                          # Expo Router routes
│   ├── _layout.tsx               # Root layout (providers)
│   ├── +not-found.tsx            # 404 handler
│   ├── subscribe/index.tsx       # Subscription modal
│   └── (tabs)/                   # Tab navigator
│       ├── _layout.tsx           # Tab bar configuration
│       ├── index.tsx             # Home screen
│       ├── explore/              # Explore section
│       │   ├── _layout.tsx       # Explore stack navigator
│       │   ├── index.tsx         # Topic cards
│       │   ├── remote-work.tsx   # Remote work analysis
│       │   ├── sponsorship.tsx   # Sponsorship analysis
│       │   ├── flexibility.tsx   # Flexibility analysis
│       │   ├── pr.tsx            # Permanent residency analysis
│       │   └── compare.tsx       # Comparison matrix
│       ├── community/
│       │   └── index.tsx         # Community links
│       └── country/
│           ├── _layout.tsx       # Country stack navigator
│           ├── index.tsx         # Browse all countries
│           └── [slug]/
│               ├── _layout.tsx   # Country detail stack
│               ├── index.tsx     # Country hub
│               ├── pathways/
│               │   └── [key].tsx # Pathway detail + brief
│               ├── resources.tsx # Resources list
│               ├── vendors.tsx   # Vendor directory
│               └── community.tsx # Country community
│
├── src/
│   ├── components/               # Shared components
│   │   ├── AvailabilityGate.tsx  # Shows coming soon for non-ready content
│   │   ├── ComingSoon.tsx        # Coming soon placeholder
│   │   ├── CompareMatrix.tsx     # Comparison table component
│   │   ├── DecisionBriefCard.tsx # Brief display card
│   │   ├── LastReviewedPill.tsx  # Content freshness indicator
│   │   ├── ProGate.tsx           # Subscription gate wrapper
│   │   └── ProPaywall.tsx        # Full paywall UI (737 lines)
│   │
│   ├── contexts/
│   │   └── EntitlementContext.tsx # Unified subscription state
│   │
│   ├── config/
│   │   └── subscription.ts       # Subscription constants & product IDs
│   │
│   ├── subscriptions/
│   │   ├── revenuecat.ts         # RevenueCat SDK wrapper (260 lines)
│   │   └── stripeWeb.ts          # Stripe web integration
│   │
│   ├── data/                     # Static content data
│   │   ├── index.ts              # Centralized data access layer
│   │   ├── types.ts              # Canonical type definitions
│   │   ├── decisionBriefs.ts     # All decision brief content (3,063 lines)
│   │   ├── compareMatrix.ts      # Comparison matrix data (184 lines)
│   │   ├── coverage.ts           # Coverage tracking per country (137 lines)
│   │   ├── pro-offer.ts          # Pro upsell messaging (189 lines)
│   │   ├── briefHelpers.ts       # Brief validation & confidence logic (212 lines)
│   │   ├── severity.ts           # Severity level definitions
│   │   ├── briefSeverity.ts      # Brief-specific severity rules
│   │   ├── briefValidation.ts    # Brief content validation
│   │   └── briefReviewRules.ts   # Review trigger rules
│   │
│   └── lib/
│       └── analytics.ts          # Event tracking system
│
├── data/                         # Raw content data files
│   ├── countries.ts              # Country list (32 countries)
│   ├── pathways.ts               # Visa pathway data (374 lines)
│   ├── resources.ts              # Official resource links (269 lines)
│   ├── vendors.ts                # Vendor directory (59 lines)
│   └── community.ts              # Community links (72 lines)
│
├── contexts/
│   ├── CountryContext.tsx         # Selected country state + AsyncStorage
│   └── SubscriptionContext.tsx    # Bridge layer for backward compat
│
├── components/
│   ├── Screen.tsx                # Base screen wrapper
│   └── ErrorBoundary.tsx         # App crash handler
│
├── lib/
│   └── query-client.ts           # React Query client + API helpers
│
├── theme/
│   └── tokens.ts                 # Design token system
│
├── server/
│   ├── index.ts                  # Express server entry
│   ├── routes.ts                 # API routes (Stripe endpoints)
│   ├── vite.ts                   # Vite dev server integration
│   └── templates/
│       ├── landing-page.html     # Static landing page
│       ├── privacy-policy.html   # Privacy policy
│       └── terms-of-service.html # Terms of service
│
└── assets/
    ├── brand/                    # Brand logos and icons
    └── images/                   # App icons, splash screens
```

### Provider Hierarchy

```
ErrorBoundary
  └── QueryClientProvider (React Query)
        └── GestureHandlerRootView
              └── KeyboardProvider
                    └── CountryProvider (selected country + AsyncStorage)
                          └── SubscriptionProvider (entitlement state)
                                └── Stack Navigator (routes)
```

### Data Flow

```
Static TS Files (data/, src/data/)
    │
    ▼
Data Access Layer (src/data/index.ts)
    │
    ├── getCountries(), getCountry(slug)
    ├── getPathways(slug), getPathway(slug, key)
    ├── getResources(slug)
    ├── getVendors(slug)
    ├── getCommunityLinks(slug)
    ├── getDecisionBrief(id), getDecisionBriefsForCountry(slug)
    ├── getCompareMatrix(), getCompareCountrySlugs()
    ├── getProOffer(country?, pathway?)
    └── isDecisionReady(slug), isLaunchCountry(slug)
    │
    ▼
React Components (screens + shared components)
```

---

## 10. Data Models

### Country

```typescript
type Region = "Europe" | "North America" | "Central America" | "South America" | "Asia" | "Oceania";

type Country = {
  name: string;           // Display name (e.g., "Portugal")
  slug: string;           // URL-safe identifier (e.g., "portugal")
  region: Region;         // Geographic region
  popular?: boolean;      // Featured on home screen
};
```

### Pathway

```typescript
type Pathway = {
  id: string;             // Generated: "{slug}-pw-{key}"
  countrySlug: string;    // Parent country slug
  key: string;            // Unique key within country (e.g., "d7", "express-entry")
  title: string;          // Display name (e.g., "D7 — Passive Income Visa")
  summary: string;        // 1-2 sentence description
  whoFor: string[];       // List of ideal candidate descriptions
  notFor: string[];       // List of who should look elsewhere
  premium: boolean;       // Whether full details require Pro
  officialLinks: {        // Government website links
    label: string;
    url: string;
  }[];
  steps?: string[];       // Step-by-step process (premium)
  timeline?: string;      // Realistic timeline (premium)
  costRange?: string;     // Fee range (premium)
};
```

### Decision Brief

```typescript
type ConfidenceLevel = "High" | "Medium" | "Conditional";

type SourceLink = {
  label: string;
  url: string;
  type: "official" | "secondary";
};

type BriefChangeLogEntry = {
  date: string;           // ISO date
  summary: string;        // What changed
  severity: "P0" | "P1" | "P2";
};

type DecisionBrief = {
  id: string;                      // e.g., "portugal-overview", "portugal-d7"
  countrySlug: string;
  pathwayKey?: string;             // Undefined for country overview briefs

  headline: string;                // Opinionated one-liner
  decisionSummary: string;         // 2-3 sentence real-talk summary

  recommendedFor: string[];        // Who this genuinely works for
  notRecommendedFor: string[];     // Who should look elsewhere

  keyRequirements: string[];       // What you actually need
  financialReality: string[];      // Real costs
  timelineReality: string[];       // Real processing times
  riskFlags: string[];             // What could go wrong

  commonMistakes: string[];        // Expensive errors others have made
  betterAlternatives?: string[];   // Other options to consider

  workReality?: string[];          // What work is actually allowed
  familyAndDependents?: string[];  // Spouse/children implications
  lifestyleAndCulture?: string[];  // Cultural adjustment realities

  confidenceLevel: ConfidenceLevel;
  lastReviewedAt: string;          // ISO date
  updatedAt?: string;
  sourceLinks?: SourceLink[];
  changeLog?: BriefChangeLogEntry[];
};
```

### Resource

```typescript
type Resource = {
  id: string;
  countrySlug: string;
  label: string;
  note?: string;
  url: string;
  sourceType?: "official" | "community" | "expert";
  category?: "visa" | "tax" | "housing" | "healthcare" | "work";
};
```

### Vendor

```typescript
type Vendor = {
  id: string;
  countrySlug: string;
  name: string;
  category: string;       // "Legal" | "Tax" | "Housing" | "Relocation"
  url: string;
  note?: string;
};
```

### Community Link

```typescript
type CommunityLink = {
  id: string;
  countrySlug: string;
  name: string;
  type: "Meetups" | "Forums" | "Facebook" | "Expat groups" | "General" | "Discord" | "WhatsApp";
  url: string;
  note?: string;
};
```

### Compare Row

```typescript
type CompareRow = {
  label: string;          // Row header (e.g., "Residency pathways")
  proOnly: boolean;       // Whether this row is gated
  values: Record<string, string>;  // Country slug → display value
};
```

### Coverage

```typescript
type CoverageStatus = "decision-ready" | "coming-soon";
type CoverageSection = "brief" | "resources" | "vendors" | "community" | "pathway";
```

### Entitlement State

```typescript
type EntitlementSource = "revenuecat" | "stripe" | "sandbox" | "none";

interface EntitlementContextValue {
  hasProAccess: boolean;
  source: EntitlementSource;
  loading: boolean;
  sandboxMode: boolean;
  managementURL: string | null;
  expirationDate: string | null;
  setSandboxOverride: (value: boolean) => void;
  refresh: () => Promise<void>;
}
```

---

## 11. API Specification

### Backend Routes

All routes are under the `/api` prefix. The backend is Express v5 with TypeScript.

#### POST /api/stripe/checkout

Creates a Stripe Checkout Session for web subscription purchases.

**Request:**
```json
{
  "priceId": "price_xxxxx"
}
```

**Response (200):**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

**Errors:**
- 400: `priceId` not provided
- 503: Stripe not configured (no `STRIPE_SECRET_KEY`)
- 500: Stripe API error

#### POST /api/stripe/portal

Creates a Stripe Customer Portal session for managing subscriptions.

**Request:**
```json
{
  "customerId": "cus_xxxxx"
}
```

**Response (200):**
```json
{
  "url": "https://billing.stripe.com/..."
}
```

#### GET /api/stripe/status

Returns current subscription status for the web user.

**Response (200):**
```json
{
  "hasProAccess": false
}
```

*Note: Currently returns `false` always. Requires webhook integration for real status tracking.*

#### POST /api/auth (Login/Register)

Authenticates or registers a user via external API at `expathub.world`.

**Base URL:** `https://www.expathub.world` (www subdomain required to avoid TLS redirect)

**Request:**
```json
{
  "action": "signin",
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "token": "jwt_token_here",
  "user": { "email": "user@example.com" }
}
```

#### GET /api/auth (Session Check)

Validates current session token.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user": { "email": "user@example.com" }
}
```

#### POST /api/auth (Logout)

Signs out the current user.

**Request:**
```json
{
  "action": "signout"
}
```

#### POST /api/auth/forgot-password

Requests a password reset email.

**Base URL:** `https://www.expathub.website` (www subdomain required to avoid TLS redirect)
**Note:** On web, proxied through Express backend (`/api/auth/forgot-password`) to avoid CORS.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If an account exists for that email, we've sent password reset instructions."
}
```

#### POST /api/auth/reset-password (Web Only)

Resets user password using token from email link. Opens at `expathub.website/reset-password?token=xxx`.

**Base URL:** `https://www.expathub.website`

**Request:**
```json
{
  "token": "reset_token_here",
  "password": "newpassword"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully."
}
```

#### GET /privacy

Serves the privacy policy HTML page.

#### GET /terms

Serves the terms of service HTML page.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_RC_IOS_KEY` | Yes (iOS) | RevenueCat iOS API key |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | Yes (Android) | RevenueCat Android API key |
| `STRIPE_SECRET_KEY` | Yes (Web) | Stripe server-side secret key |
| `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Yes (Web) | Stripe price ID for monthly plan |
| `EXPO_PUBLIC_SANDBOX_MODE` | No | Set to "true" to enable sandbox in production |
| `SESSION_SECRET` | Yes | Express session secret |

---

## 12. Design System

### Design Tokens

```typescript
const tokens = {
  color: {
    bg: "#F7F5F0",                    // Warm off-white background
    surface: "#FFFFFF",               // Card/surface white
    border: "rgba(0,0,0,0.10)",       // Subtle borders
    text: "#0B1220",                  // Near-black primary text
    subtext: "rgba(11,18,32,0.65)",   // Muted secondary text
    primary: "#009C9C",               // Teal accent color
    primarySoft: "rgba(0,156,156,0.12)", // Light teal background
    primaryBorder: "rgba(0,156,156,0.25)", // Teal border
    white: "#FFFFFF",
    dark: "#0B1220",
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 28,
  },

  radius: {
    sm: 10,
    md: 12,
    lg: 16,
    pill: 999,                        // Fully rounded
  },

  text: {
    small: 12,
    body: 14,
    h3: 16,
    h2: 20,
    h1: 26,
  },

  weight: {
    regular: "400",
    bold: "700",
    black: "900",
  },
};
```

### Visual Style

- **Background:** Warm off-white (#F7F5F0), not pure white
- **Cards:** White surface with 1px subtle border, 16px border radius
- **Primary accent:** Teal (#009C9C) — used for buttons, links, icons, active states
- **Typography:** Heavy use of weight "900" (black) for headings and labels
- **Icons:** Ionicons from @expo/vector-icons throughout
- **Buttons:** Teal background with white text, 16px radius, no shadows
- **Badges/pills:** Light teal background with teal text, fully rounded
- **Pressed states:** Slight opacity reduction and scale transform

### Icon Usage

All icons use the Ionicons set from `@expo/vector-icons`:

| Context | Icon | Size |
|---------|------|------|
| Home tab | `home` | Tab size |
| Explore tab | `compass` | Tab size |
| Community tab | `people` | Tab size |
| Countries tab | `earth` | Tab size |
| Shield/verified | `shield-checkmark` | 16 |
| Compare | `git-compare-outline` | 16 |
| People/community | `people-outline` | 16 |
| Forward/navigate | `chevron-forward` | 18 |
| Arrow forward | `arrow-forward` | 16 |
| Checkmark | `checkmark-circle` | 14 |
| Time/clock | `time-outline` | 10 |
| Flag | `flag` | 18 |
| Laptop/remote | `laptop-outline` | 20 |
| Briefcase/job | `briefcase-outline` | 20 |
| Options/flexible | `options-outline` | 20 |

---

## 13. Analytics Events

The app tracks user interactions via a pluggable analytics system. Events are logged to console in development and dispatched to registered listeners.

| Event | Description | Properties |
|-------|-------------|------------|
| `subscribe_screen_viewed` | Subscription modal opened | - |
| `subscribe_tapped` | User tapped subscribe button | plan, platform |
| `subscribe_success` | Subscription completed | plan, source |
| `subscribe_cancelled` | User cancelled purchase | - |
| `subscribe_error` | Purchase error occurred | error |
| `restore_tapped` | User tapped restore purchases | - |
| `restore_success` | Purchases restored successfully | count |
| `restore_not_found` | No purchases found to restore | - |
| `restore_error` | Restore error occurred | error |
| `manage_subscription_tapped` | Manage subscription tapped | - |
| `paywall_shown` | Paywall displayed | platform, country, pathway |
| `paywall_viewed` | Paywall viewed with context | context, countrySlug, pathwayKey |
| `paywall_value_context` | Value context tracked | entryPoint, countrySlug, pathwayKey |
| `paywall_unlock_tapped` | Unlock button tapped | - |
| `paywall_dismissed` | Paywall dismissed | - |
| `entitlement_refresh` | Entitlement status refreshed | source, hasProAccess |
| `entitlement_refresh_error` | Entitlement refresh failed | source |
| `explore_opened` | Explore topic opened | topic |
| `compare_started` | Comparison matrix viewed | - |
| `compare_row_viewed` | Comparison row expanded | row |
| `decision_brief_opened` | Decision brief viewed | briefId, country |
| `brief_section_viewed` | Brief section expanded | section, briefId |
| `subscription_started` | Subscription flow initiated | plan, source |

---

## 14. Content Quality System

### Confidence Levels

Each Decision Brief has a confidence level that reflects content accuracy:

| Level | Meaning | Criteria |
|-------|---------|----------|
| High | Content is current and verified | No P0/P1 flags, reviewed within 60 days |
| Medium | Content may have minor gaps | Has P1 (important but not critical) changes pending |
| Low | Content needs urgent review | Has P0 (critical) changes or review overdue >60 days |

### Severity Definitions

| Severity | Description | Examples |
|----------|-------------|---------|
| P0 | Critical — affects eligibility, work rights, or legal compliance | Eligibility criteria changed, work rights modified, income thresholds updated |
| P1 | Important — affects costs or timelines significantly | Processing time changed >30%, fees changed >20% |
| P2 | Minor — informational updates | Portal URL changed, minor procedural updates |

### Mandatory Review Triggers

Changes to these fields automatically trigger a review:

**P0 triggers (critical):**
- Eligibility criteria
- Work rights
- Income thresholds
- Proof formats
- Application portals
- Issuing authorities
- First-year tax residency

**P1 triggers (threshold-based):**
- Processing time (if change > 30%)
- Fees (if change > 20%)

### Source Validation

- Primary sources must be from recognized government domains (.gov, .gob, .gc.ca, .gov.uk, .europa.eu, etc.)
- Maximum 2 professional body sources (bar associations, law societies)
- Non-official sources generate warnings for editorial review

---

## 15. Pre-Launch Checklist

### Legal & Compliance
- [ ] Swap privacy policy & terms URLs to production domain (magicelfdigital.com)
- [ ] Verify `support@magicelfdigital.com` is active and monitored
- [ ] Review privacy policy for GDPR/CCPA compliance

### Payment Configuration
- [ ] Replace RevenueCat test keys with production keys (`appl_` for iOS, `goog_` for Android)
- [ ] Configure RevenueCat dashboard: entitlements `decision_access`, `full_access_subscription`, `country_<slug>` for 8 launch countries
- [ ] Create RevenueCat products: `decision_pass_30d` (consumable, $29), `country_lifetime_<slug>` (non-consumable, $69 each for 8 countries), `expathub_monthly` (auto-renewing, $14.99/mo)
- [ ] Set up App Store Connect: `decision_pass_30d` consumable ($29), 8× `country_lifetime_*` non-consumables ($69 each), `expathub_monthly` subscription ($14.99/mo)
- [ ] Set up Google Play: matching in-app products and subscription
- [ ] Set `STRIPE_SECRET_KEY` for web subscriptions
- [ ] Configure Stripe price IDs for monthly subscription
- [ ] Test full purchase flow on all platforms (all 3 tiers)
- [ ] Test forgot password flow end-to-end (native and web)

### App Store Submission
- [ ] Apple App Review — currently in review process
- [ ] Google Play — awaiting billing verification
- [ ] App Store screenshots for all required device sizes
- [ ] Play Store feature graphic (1024x500px)

### Content
- [ ] Final review of all 27+ Decision Briefs
- [ ] Verify all official source links are current
- [ ] Update lastReviewedAt dates for all briefs
- [ ] Check confidence levels reflect current accuracy

### Technical
- [ ] Disable sandbox mode in production (`EXPO_PUBLIC_SANDBOX_MODE !== "true"`)
- [ ] Verify analytics event tracking is working
- [ ] Test deep linking and route handling
- [ ] Performance test on low-end devices
- [ ] Verify web insets and platform-specific handling

---

*End of document. This PRD and technical specification covers the complete ExpatHub application as of February 2026. 3-tier monetization model (Decision Pass, Country Lifetime Unlock, Monthly Subscription), JWT authentication, and forgot password flow.*
