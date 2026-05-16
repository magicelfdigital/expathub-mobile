# ExpatHub Web — Authorization & Purchase Experience Specification

This document specifies how the ExpatHub website (expathub.world) should implement user authentication, content gating, and the purchase/subscription flow to match the mobile app experience. The web version uses Stripe for payments and shares the same auth backend as the mobile app.

> This document describes the **2-tier purchase model** (as of v1.4). The
> web side offers two recurring plans: **Monthly Explorer ($14.99/mo, no
> trial)** and **Annual Pathfinder ($89/yr, 14-day free trial via Stripe
> `subscription_data.trial_period_days`)**. The resume-pending-purchase
> flow only handles `monthly` and `annual` plan keys. Source of truth:
>
> - `web/src/pages/Pricing.tsx` — the live two-plan layout
> - `server/routes.ts` → `POST /api/stripe/checkout` — accepts
>   `{ plan: "monthly" \| "annual" }` and applies the 14-day annual trial
> - `docs/store-config-changes.md` — Stripe + RevenueCat operator setup

---

## 1. Authentication

### 1.1 Auth Backend

The auth API lives at `https://expathub.world` and uses a single `/api/auth` endpoint with an `action` parameter:

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/auth` | POST | `{ action: "signin", email, password }` | `{ token, user: { id, email } }` — auto-creates account on first sign-in |
| `/api/auth` | POST | `{ action: "signout" }` + Authorization: Bearer TOKEN | `{ ok: true }` |
| `/api/auth` | GET | — (Authorization: Bearer TOKEN) | `{ id, email }` |

- Passwords must be >= 6 characters.
- The `token` is a JWT. Store it in `localStorage` (web) under the key `auth_jwt_token`.
- On page load, check for a stored token and call `GET /api/auth` with the Authorization header to restore the session. If the token is expired or invalid, clear it silently.

### 1.2 RevenueCat User Sync

After every successful auth event (login, register, OR session restore), call `loginUser(userId.toString())` to bind the session to RevenueCat. This must happen at three points:

1. **Login success** — immediately after receiving `{ token, user }` from `POST /api/auth` with action `"signin"`.
2. **Register success** — same as login; the API auto-creates accounts on first sign-in with `action: "signin"`.
3. **Session restore** — after `GET /api/auth` validates a stored token on page load.

**Race condition note:** `loginUser()` internally ensures RevenueCat is initialized before calling `rc.logIn()`. If `initPurchases()` hasn't completed yet (e.g., session restore fires before the entitlement context mounts), `loginUser()` will call `initPurchases()` itself. This is safe because `initPurchases()` is idempotent.

### 1.3 Auth UX Rules

- **Free content is accessible without login.** Users can browse countries, pathways (free tier), resources, vendors, and community links without any account.
- **Premium content viewing requires login.** If a logged-out user navigates to a premium Decision Brief, show a gate: "Sign in to view this content" with a CTA to the auth modal/page.
- **Purchase buttons are always visible.** The paywall shows both subscription options to everyone, including logged-out users.
- **Purchases require auth.** When a logged-out user taps a purchase button, the app stores the pending purchase intent, redirects to the auth flow, and auto-resumes the purchase after successful login/register.

### 1.4 Pending Purchase Flow (Critical)

This is the key UX innovation — users see prices and can tap "subscribe" before having an account:

1. User taps a plan CTA (e.g., "Start 14-day free trial — Annual Pathfinder").
2. If NOT logged in:
   a. Store `{ plan }` in `localStorage` under key `pending_purchase`.
      - `plan` is one of: `"monthly"`, `"annual"`.
   b. Redirect to the auth modal/page.
3. After successful login/register, the auth modal auto-closes (navigates back).
4. The paywall component detects the user is now logged in, reads `pending_purchase` from localStorage, clears it, and auto-initiates the Stripe Checkout flow for the stored plan.
5. If the user dismisses auth without logging in, they return to the paywall — pending purchase stays in storage for next attempt.

### 1.5 Forgot Password

The forgot password flow allows users to reset their password:

- **Endpoint**: `POST /api/auth/forgot-password` on `https://www.expathub.website` (note: `www` subdomain required to avoid TLS redirect)
- **Body**: `{ email }`
- **Response**: `{ ok: true }` (always returns `ok: true` regardless of whether the email exists, for security)

**On Web:**
- The frontend proxies the request through the Express backend at `POST /api/auth/forgot-password` to avoid CORS issues when calling the external URL.
- User submits email on forgot password screen.
- Backend calls the external endpoint.
- Response is `{ ok: true }` which displays a success message: "Check your email for a reset link."

**On Native:**
- The native app calls the external URL directly: `https://www.expathub.website/api/auth/forgot-password`.
- No CORS constraint on native platforms.

**Reset Flow:**
- Email contains a reset link in the format: `expathub.website/reset-password?token=xxx`
- User opens the link in their phone's browser.
- User resets their password on the web form.
- After reset, user returns to the app and signs in with their new password.

---

## 2. Subscription Tiers & Products

ExpatHub uses a 2-tier subscription model:

| Tier | Price | Trial | Stripe Price ID env | What It Unlocks |
|---|---|---|---|---|
| **Monthly Explorer** | $14.99/month | None | `STRIPE_MONTHLY_PRICE_ID` | Ongoing full access to all 11 launch countries |
| **Annual Pathfinder** | $89/year | 14 days | `STRIPE_ANNUAL_PRICE_ID` | Ongoing full access to all 11 launch countries |

Both plans grant the single `full_access_subscription` entitlement.

### 2.1 Access Check

Check access in this order (first match wins):

1. **Active Monthly Explorer or Annual Pathfinder subscription** → full access.
2. **Sandbox / promo override or active 48h reverse trial** → full access.
3. **None** → free content only, show paywall for premium content.

### 2.2 Launch Countries

```
portugal, spain, canada, costa-rica, panama, ecuador, malta,
united-kingdom, germany, ireland, australia
```

All 11 launch countries unlock from a single subscription — there are no
per-country products.

---

## 3. Stripe Integration (Web Payments)

### 3.1 Backend Endpoints

The Express backend at port 5000 provides these Stripe endpoints:

| Endpoint | Method | Body | Response | Notes |
|---|---|---|---|---|
| `POST /api/stripe/checkout` | POST | `{ plan: "monthly" \| "annual" }` | `{ url }` | Creates a Checkout Session (subscription mode; annual adds 14-day trial), returns redirect URL |
| `POST /api/stripe/portal` | POST | `{ customerId }` | `{ url }` | Creates Customer Portal session for subscription management |
| `GET /api/stripe/status` | GET | — | `{ hasProAccess }` | Checks if current user has active subscription |

### 3.2 Checkout Flow

1. User clicks a plan CTA on the paywall.
2. Frontend calls `POST /api/stripe/checkout` with `{ plan: "monthly" | "annual" }`.
3. Backend creates a Stripe Checkout Session with:
   - `mode: "subscription"` for both plans.
   - For `annual`, includes `subscription_data.trial_period_days: 14` to enable the 14-day free trial.
   - `success_url`: Return URL with `?checkout=success` query param.
   - `cancel_url`: Return URL with `?checkout=cancel` query param.
   - `customer_email`: The logged-in user's email (to link Stripe customer to ExpatHub account).
   - `metadata`: Includes `{ userId, plan }` for webhook processing.
4. Frontend redirects to `session.url` (Stripe-hosted checkout page).
5. After payment, Stripe redirects back to the success/cancel URL.

### 3.3 Post-Checkout Handling

On the success return URL (`?checkout=success`):
- Show a brief confirmation message.
- Call `GET /api/stripe/status` to verify the subscription is active.
- Refresh the entitlement state from the backend (no client-side timestamps to maintain — there are no longer any one-time purchase records to track in localStorage).

### 3.4 Webhook Processing (Backend)

Set up a Stripe webhook endpoint at `POST /api/stripe/webhook` to handle:

- `checkout.session.completed` — Activate the subscription/purchase for the user.
- `customer.subscription.deleted` — Revoke access when subscription is cancelled.
- `customer.subscription.updated` — Handle plan changes.
- `invoice.payment_failed` — Handle failed payments (optional: notify user).

The webhook should update the user's subscription status in the database, keyed by the user ID stored in the Checkout Session metadata.

### 3.5 Stripe Environment Variables

| Variable | Where | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Backend (secret) | Stripe API secret key |
| `STRIPE_MONTHLY_PRICE_ID` | Backend | Stripe Price ID for Monthly Explorer ($14.99/mo) |
| `STRIPE_ANNUAL_PRICE_ID` | Backend | Stripe Price ID for Annual Pathfinder ($89/yr); 14-day trial is configured in code, not on the price |
| `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Frontend (public) | Public mirror of the monthly Stripe Price ID |
| `EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID` | Frontend (public) | Public mirror of the annual Stripe Price ID |

---

## 4. RevenueCat Integration (Cross-Platform Sync)

RevenueCat is used on iOS/Android for in-app purchases. On web, it serves as a read-only entitlement check to detect purchases made on mobile.

### 4.1 Why RevenueCat on Web?

A user might purchase a subscription on their iPhone and then visit the website. RevenueCat's API can check if that user has active entitlements, so the website can grant access without requiring a separate Stripe purchase.

### 4.2 RevenueCat Web SDK

RevenueCat works on web out of the box. The mobile app already initializes it and syncs the user ID via `loginUser(userId)` after auth.

On web, after the user logs in:
1. Initialize RevenueCat with the appropriate API key.
2. Call `Purchases.logIn(userId.toString())` to associate the web session with the RevenueCat user.
3. Check `customerInfo.entitlements.active` for `full_access_subscription` — granted by either the Monthly Explorer or Annual Pathfinder subscription.

### 4.3 Entitlement Check Priority

When determining access on web:
1. Check RevenueCat entitlements (covers mobile-originated subscriptions).
2. Check Stripe subscription status via `/api/stripe/status` (covers web-originated subscriptions).
3. Apply any sandbox/promo override or active 48h reverse trial.
4. If none → no access, show paywall.

### 4.4 RevenueCat Entitlement IDs

| Entitlement | Meaning |
|---|---|
| `full_access_subscription` | Active Monthly Explorer or Annual Pathfinder subscription |

---

## 5. Content Gating (ProGate / ProPaywall)

### 5.1 Gate Logic

Premium content (Decision Briefs) is gated by the `ProGate` component:

```
if (hasFullAccess) → show content
else → show ProPaywall
```

- `hasFullAccess` = true when the user has an active Monthly Explorer or Annual Pathfinder subscription, OR an active sandbox/promo override, OR an active 48h reverse trial.

### 5.2 Paywall Display

The `ProPaywall` shows two subscription options:

1. **Annual Pathfinder — $89/year** (primary CTA, highlighted)
   - "Start your 14-day free trial"
   - Best long-term value

2. **Monthly Explorer — $14.99/month** (secondary option)
   - "Ongoing access to everything, cancel anytime"
   - For users who want flexibility

### 5.3 Paywall Behavior

- **All purchase options are visible to everyone**, including logged-out users.
- Tapping a purchase button when NOT logged in triggers the pending-purchase flow (Section 1.4).
- Tapping a purchase button when logged in initiates the Stripe Checkout flow immediately.
- After successful purchase, the paywall closes and content becomes visible.
- If purchase is cancelled (user returns from Stripe without paying), paywall stays open — no error message.
- If there's a payment error, show the error message on the paywall.

### 5.4 Purchase Outcome Handling

The mobile app's `purchasePackage()` returns an explicit status. On web, mimic the same logic after Stripe Checkout returns:

| Status | Meaning | Paywall Action |
|---|---|---|
| `"purchased"` | New purchase completed | Close paywall if `hasProAccess` is true |
| `"already_owned"` | User already owns this product | Close paywall if `hasProAccess` is true |
| `"cancelled"` | User cancelled checkout | Stay on paywall, no error message |

**Close logic:** Only close the paywall when `status` is `"purchased"` OR `"already_owned"` AND the user actually has access (`hasProAccess === true`). If the status indicates a purchase but access isn't confirmed, show: "Purchase could not be confirmed. Please try again or restore purchases."

### 5.5 Sandbox Mode

In development (`__DEV__` or `EXPO_PUBLIC_SANDBOX_MODE=true`), show a toggle to simulate Pro access without real purchases. This bypasses all payment flows and grants full access locally.

---

## 6. Account Screen

The account screen (accessible via profile icon in header) shows:

- **User email**
- **Current access level**: Free, Monthly Explorer, Annual Pathfinder (with trial countdown if applicable), or Reverse Trial (with countdown)
- **Manage subscription** button → opens Stripe Customer Portal (web) or App Store (mobile)
- **Upgrade CTA** if user is on the free tier
- **Logout** button

---

## 7. Logging & Debugging

### 7.1 Console Logging Prefixes

All auth and purchase logs use these prefixes for easy filtering:

- `[AUTH]` — Login, register, session restore, logout events
- `[PURCHASE]` — Purchase button taps, pending purchase storage, Stripe checkout initiation
- `[GATE]` — Entitlement checks, access decisions, refresh results
- `[RC]` — RevenueCat initialization, user login, entitlement queries

### 7.2 Key Events to Log

- `[AUTH] Session restored for user {id}, syncing with RevenueCat` — on token restore + `GET /api/auth` success
- `[RC] loginUser called before init, attempting initPurchases first for user {id}` — race condition self-heal
- `[RC] Logged in user: {id}` + active entitlements — after RevenueCat `logIn`
- `[PURCHASE] Stored pending purchase: {plan}` — when storing pending intent before auth redirect
- `[PURCHASE] Resuming {plan} after auth` — when resuming from pending after auth
- `[PURCHASE] Monthly result: status={status}, hasProAccess={bool}` — after purchase attempt
- `[PURCHASE] Annual result: status={status}, hasProAccess={bool}` — after purchase attempt
- On Stripe checkout redirect: log the plan being used
- On checkout return: log success/cancel status

---

## 8. Data Flow Summary

```
User taps a plan on paywall
    │
    ├─ Logged in?
    │   ├─ YES → Initiate Stripe Checkout for { plan } → Redirect → Return with success/cancel
    │   │                                                              │
    │   │                                               ├─ success → check status + hasProAccess
    │   │                                               │              ├─ both OK → close paywall
    │   │                                               │              └─ no access → show error
    │   │                                               └─ cancel → stay on paywall (no error)
    │   │
    │   └─ NO → Store { plan } in localStorage → Redirect to auth
    │                                                              │
    │                                         ├─ Login/Register success
    │                                         │       │
    │                                         │       ├─ loginUser(userId) → sync RevenueCat
    │                                         │       │
    │                                         │       └─ Paywall reads pending purchase, clears it
    │                                         │              │
    │                                         │              ├─ monthly → handleMonthlySubscribe()
    │                                         │              └─ annual → handleAnnualSubscribe()
    │                                         │
    │                                         └─ Auth dismissed → return to paywall (pending purchase stays)
```

---

## 9. Implementation Checklist

### Auth
- [ ] Auth modal/page with login + register modes
- [ ] JWT token storage in localStorage
- [ ] Session restore on page load via `GET /api/auth` with Authorization header
- [ ] Auth auto-dismiss after successful login/register
- [ ] `loginUser(userId)` called after login, register, AND session restore
- [ ] Race-safe: `loginUser()` self-initializes RevenueCat if needed
- [ ] Forgot password form calling `POST /api/auth/forgot-password` (proxied on web, direct on native)

### Pending Purchase
- [ ] Pending purchase storage in localStorage (`{ plan: "monthly" | "annual" }`)
- [ ] Auto-resume Stripe Checkout after auth success

### Payments
- [ ] Stripe Checkout integration for both plans (monthly + annual, with 14-day trial on annual)
- [ ] Post-checkout: check explicit status (`purchased` / `already_owned` / `cancelled`)
- [ ] Close paywall only when status is purchased/already_owned AND hasProAccess is true
- [ ] Post-checkout cancel: stay on paywall, no error message
- [ ] Stripe Customer Portal for subscription management
- [ ] Stripe webhook endpoint for server-side subscription tracking

### Entitlements
- [ ] RevenueCat web SDK initialization
- [ ] RevenueCat user login sync (`logIn(userId)`) at all 3 auth points
- [ ] Cross-platform entitlement checking (RC + Stripe), with sandbox / 48h reverse-trial overrides applied locally

### UI
- [ ] Content gating with ProGate/ProPaywall components
- [ ] Account screen with access status display
- [ ] Sandbox mode toggle for development

### Logging
- [ ] Prefixed console logging: `[AUTH]`, `[PURCHASE]`, `[GATE]`, `[RC]`
- [ ] Purchase results log explicit status + hasProAccess
