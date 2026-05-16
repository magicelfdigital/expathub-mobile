# Store + Stripe Configuration — 2-Tier Subscription Setup

This doc captures the manual store-side configuration needed to support the
**2-tier subscription model**: **Monthly Explorer ($14.99/month, 14-day free trial)**
and **Annual Pathfinder ($89/year, 14-day free trial)**.

> **Scope:** ExpatHub ships on **iOS + Web only**. Google Play Console / Android
> billing configuration is intentionally out of scope and has been removed from
> this checklist.
>
> The code only references two SKUs and one trial length. None of the steps
> below run automatically — they must be done by an operator with App Store
> Connect, RevenueCat, and Stripe access.

---

## 1. Codebase contract (already shipped)

| Surface | Plan IDs / values |
|---|---|
| RevenueCat product IDs (iOS) | `monthly_subscription_all_access` (monthly), `ExpatHub_pathfinder` (annual) |
| Mobile prices (display) | `$14.99/month`, `$89/year` |
| Trial length (both plans) | **14 days** (constant: `TRIAL_DURATION_DAYS` in `src/config/subscription.ts`). |
| Web checkout endpoint | `POST /api/stripe/checkout` with body `{ plan: "monthly" \| "annual" }` |
| Stripe price ID env vars | `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID` |
| Stripe trial config | `subscription_data.trial_period_days: 14` (server-side, both plans) |
| Single entitlement | `full_access_subscription` — granted by either plan |

---

## 2. App Store Connect (iOS)

1. **Subscriptions group** (auto-renewing): keep two products only —
   - `monthly_subscription_all_access` — Monthly Explorer — **$14.99/month**
   - `ExpatHub_pathfinder` — Annual Pathfinder — **$89/year**
2. For **both** subscription products, open **Subscription Pricing** →
   **Introductory Offer** → **Free Trial** → **14 days**, available to
   **New Subscribers** (and, optionally, lapsed subscribers — confirm with
   marketing). Both Monthly Explorer and Annual Pathfinder ship with the
   same 14-day free trial.
3. Make sure no other auto-renewing or non-renewing products are
   **Cleared for Sale**. The app only reads the two SKUs above.
4. Submit the changes for review with a screenshot of the new paywall.

## 3. RevenueCat dashboard

1. **Products**: ensure only `monthly_subscription_all_access` and
   `ExpatHub_pathfinder` are active. Any other products should be archived
   so they stop appearing in offerings.
2. **Offerings → Default**: keep two packages mapped to those products
   (`$rc_monthly` / `$rc_annual` is fine).
3. **Entitlements**: a single entitlement `full_access_subscription`
   should be granted by both products. No other entitlements should be
   active — the app only reads this one.
4. Verify Apple service credentials are still valid so trial events
   propagate.
5. **Experiments (annual $89 vs $99)** — RevenueCat dashboard →
   **Experiments → New experiment**:
   - Name: `annual_89_vs_99`.
   - Control offering: Default (annual = $89).
   - Variant offering: clone Default into **annual_99_test** with
     `ExpatHub_pathfinder` priced at **$99/year** (create the $99 SKU in
     App Store Connect first; ASC requires a new SKU for any price change).
   - Traffic split: 50/50.
   - Stop rule: **statistical significance at 95%** OR **2,000 entitlement
     starts per arm**, whichever comes first.
6. Web `/pricing` and `/api/stripe/checkout` mirror this via the
   `ENABLE_ANNUAL_PRICE_TEST` env flag — keep the RevenueCat experiment in
   sync (same dates) so the mobile and web reports describe the same
   population.

> **Retired:** the `monthly_paid_intro_vs_free_trial` experiment (monthly
> $0.99 intro vs free trial) was retired once both plans were standardised
> on a 14-day free trial. The `ENABLE_PAID_INTRO_TEST` env flag and
> `STRIPE_MONTHLY_PAID_INTRO_PRICE_ID` secret are no longer read.

## 4. Stripe (web checkout)

1. In the Stripe dashboard, create / confirm two recurring **Prices**:
   - Monthly — $14.99 USD / month
   - Annual — $89 USD / year
2. Copy the price IDs into Replit Secrets:
   - `STRIPE_MONTHLY_PRICE_ID = price_…` (control: 14-day free trial → $14.99/mo)
   - `STRIPE_ANNUAL_PRICE_ID = price_…` (control: $89/year)
   - `STRIPE_SECRET_KEY = sk_…` (server-side, already required)
   - **A/B variant prices** (only required if the corresponding env flag is on):
     - `STRIPE_ANNUAL_99_PRICE_ID = price_…` — $99/year. Falls back to
       `STRIPE_ANNUAL_PRICE_ID` when unset.
   - **Experiment toggles**:
     - `ENABLE_ANNUAL_PRICE_TEST = 1`
   - **Admin dashboard** (`GET /api/admin/ab-results`):
     - `ADMIN_BASIC_USER` (default `admin`)
     - `ADMIN_BASIC_PASS` — required; endpoint returns 503 until set.
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

## 5. Verification checklist

- [ ] iOS sandbox purchase of `ExpatHub_pathfinder` shows the **14-day free
      trial** introductory offer in the App Store sheet.
- [ ] iOS sandbox purchase of `monthly_subscription_all_access` shows the
      **14-day free trial** introductory offer in the App Store sheet.
- [ ] RevenueCat customer info reports a single `full_access_subscription`
      entitlement after either purchase.
- [ ] Web `/pricing` → "Start 14-day free trial" (Annual Pathfinder) →
      Stripe Checkout shows "14-day free trial" and **$0 due today**.
- [ ] Web `/pricing` → "Start 14-day free trial" (Monthly Explorer) →
      Stripe Checkout shows "14-day free trial" and **$0 due today**.
- [ ] After the annual trial, Stripe charges $89. After the monthly trial,
      Stripe charges $14.99 and continues to charge $14.99 on each renewal.
- [ ] No UI surface mentions a 7-day trial anywhere.
