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
- **Navigation**: Tab-based layout (Home, Explore, Community) with stack navigators for detail screens. Subscription flow is a modal.
- **Authentication**: JWT-based via `AuthContext`, token storage using `expo-secure-store` or `AsyncStorage`. Web authentication is proxied through an Express backend.
- **Key Features**:
    - **Subscription/Freemium Model**: 3-tier system (30-Day Decision Pass, Country Lifetime Unlock, Monthly Subscription) integrated with RevenueCat for mobile and Stripe Checkout for web. Entitlements are backend-authoritative.
    - **Continue / Last Viewed**: Persists user's last viewed country, section, and resource for quick access.
    - **Saved Resources**: Allows users to bookmark resources per country.
    - **Paywall Segmented Navigation**: ProPaywall component with "What you get", "Plans", and "FAQ" tabs, plus a sticky CTA.
    - **Internationalization**: Content uses neutral language and passport-specific notes, with selected passport nationality stored locally.
    - **Relocation Readiness Assessment**: Onboarding quiz with weighted scoring, providing a relocation readiness tier, top country match, and lead capture for non-guide countries.
    - **Expanding Soon / Waitlist**: Section for upcoming countries with a waitlist feature integrated with the backend.
    - **Source Badge Classification**: Resources are categorized as official, authoritative, or community.
    - **Planner Layer**: A 6-step semi-linear relocation planning system for paid users, with country-specific checklists and pet requirements. It allows users to manage one active plan at a time.
    - **Tablet Support**: Responsive design using a `useLayout` hook to adapt screen layouts for tablets with 2-column grids.

### Backend
- **Runtime**: Node.js with TypeScript and Express.
- **API Structure**: Routes under `/api` prefix, handling data access and authentication.
- **Data Storage**: Uses an `IStorage` interface, currently with in-memory storage, and a PostgreSQL database.

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