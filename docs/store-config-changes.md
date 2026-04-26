# Store + Stripe Configuration Changes — 2 Tier / 14-day Trial Migration

This doc captures the manual store-side configuration that goes with the
codebase changes from the **4-tier (Decision Pass, Country Lifetime, Monthly,
Annual) → 2-tier (Monthly + Annual)** simplification, and the **7-day → 14-day
free trial** change applied to both plans.

> The code only references two SKUs and one trial length. None of the steps
> below run automatically — they must be done by an operator with App Store
> Connect, Google Play Console, RevenueCat, and Stripe access.

---

## 1. Codebase contract (already shipped)

| Surface | Plan IDs / values |
|---|---|
| RevenueCat product IDs | `expathub_explorer` (monthly), `expathub_pathfinder` (annual) |
| Mobile prices (display) | `$14.99/month`, `$89/year` |
| Trial length (mobile + web) | **14 days** (constant: `TRIAL_DURATION_DAYS` in `src/config/subscription.ts`) |
| Web checkout endpoint | `POST /api/stripe/checkout` with body `{ plan: "monthly" \| "annual" }` |
| Stripe price ID env vars | `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID` |
| Stripe trial config | `subscription_data.trial_period_days: 14` (server-side) |
| Removed legacy code paths | Decision Pass and Country Lifetime products are no longer offered. The entitlement gate ignores any legacy `decisionPass` / `countryUnlocks` fields the backend may still return. |

---

## 2. App Store Connect (iOS)

1. **Subscriptions group** (auto-renewing): keep two products only —
   - `expathub_explorer` — Monthly Explorer — **$14.99/month**
   - `expathub_pathfinder` — Annual Pathfinder — **$89/year**
2. For **each** product, open **Subscription Pricing** → **Introductory
   Offer** → **Free Trial** → **14 days**, available to **New Subscribers**
   (and, optionally, lapsed subscribers — confirm with marketing).
3. Remove the old offers: any 7-day intro on `expathub_pathfinder`, and
   any standalone non-renewing products for the **30-Day Decision Pass** or
   **Country Lifetime** packs. If the products cannot be deleted, mark them
   **Cleared for Sale → No** so they stop appearing in offerings.
4. Submit the changes for review with a screenshot of the new paywall.

## 3. Google Play Console (Android)

1. **Monetize → Products → Subscriptions**: confirm only
   `expathub_explorer` and `expathub_pathfinder` exist.
2. For each subscription, open the **Base plan** → **Offers** and create /
   keep a single **Free trial** offer with **Billing period: 14 days**, set as
   the default introductory offer for new subscribers.
3. Deactivate any one-time / non-recurring SKUs created for the Decision Pass
   or Country Lifetime tiers.

## 4. RevenueCat dashboard

1. **Products**: ensure only `expathub_explorer` and `expathub_pathfinder` are
   active. Archive the Decision Pass and Country Lifetime products so they
   stop appearing in offerings.
2. **Offerings → Default**: keep two packages mapped to those products
   (`$rc_monthly` / `$rc_annual` is fine).
3. **Entitlements**: a single entitlement `full_access` should be granted by
   both products. Remove `decision_access` and any `country_<slug>`
   entitlements — the app no longer reads them.
4. Verify Apple + Google service credentials are still valid so trial events
   propagate.

## 5. Stripe (web checkout)

1. In the Stripe dashboard, create / confirm two recurring **Prices**:
   - Monthly — $14.99 USD / month
   - Annual — $89 USD / year
2. Copy the price IDs into Replit Secrets:
   - `STRIPE_MONTHLY_PRICE_ID = price_…`
   - `STRIPE_ANNUAL_PRICE_ID = price_…`
   - `STRIPE_SECRET_KEY = sk_…` (server-side, already required)
3. Trial length is **set in code** (`subscription_data.trial_period_days: 14`)
   — do **not** also configure a trial on the Price itself, otherwise it will
   compound.
4. Until both price-ID secrets are populated, the checkout endpoint returns
   HTTP 503 with a helpful message; the web `/pricing` page surfaces this as
   "Web checkout is being set up. In the meantime, please subscribe inside the
   ExpatHub mobile app."
5. **Smart Retries (dunning)** — Stripe Dashboard → **Settings → Billing →
   Subscriptions and emails → Manage failed payments**:
   - Set retry schedule to **3 / 5 / 7 days** after the first failed charge.
   - After the final retry fails, **cancel the subscription** (do not leave
     it in `past_due` indefinitely).
   - Enable **"Email customers about failed payments"** so users hear about
     the retries before the subscription cancels.
6. **Trial-end reminders** — Stripe Dashboard → **Settings → Billing →
   Subscriptions and emails → Trial settings**:
   - Enable **"Send a trial-ending reminder email"**.
   - Set the reminder window to **3 days before trial end** (so users get the
     heads-up on day 11 of the 14-day trial). This matches Apple's required
     advance notice for intro-offer auto-renew so the policy is consistent
     across web and mobile.
   - Make sure the email branding (logo, support address) is set to the
     ExpatHub account so the reminder looks legitimate.

## 6. Verification checklist

- [ ] iOS sandbox purchase of `expathub_pathfinder` shows the **14-day free
      trial** introductory offer in the App Store sheet.
- [ ] iOS sandbox purchase of `expathub_explorer` shows the **14-day free
      trial** introductory offer.
- [ ] Android internal-test purchase shows the same 14-day trials on both
      plans.
- [ ] RevenueCat customer info reports a single `full_access` entitlement
      after either purchase.
- [ ] Web `/pricing` → "Start 14-day free trial" → Stripe Checkout shows
      "14-day free trial" and **$0 due today**.
- [ ] After the trial, Stripe charges $14.99 (monthly) or $89 (annual).
- [ ] No UI surface mentions Decision Pass, Country Lifetime, or a 7-day
      trial.
