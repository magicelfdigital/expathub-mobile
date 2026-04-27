# Store + Stripe Configuration Changes — 2 Tier / 14-day Trial Migration

This doc captures the manual store-side configuration that goes with the
codebase changes from the **4-tier (Decision Pass, Country Lifetime, Monthly,
Annual) → 2-tier (Monthly + Annual)** simplification, and the **7-day → 14-day
free trial** change applied to both plans.

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

## 3. RevenueCat dashboard

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
5. **Experiments (paid intro vs free trial)** — RevenueCat dashboard →
   **Experiments → New experiment**:
   - Name: `monthly_paid_intro_vs_free_trial`.
   - Control offering: the existing **Default** offering with the 14-day
     free trial on `expathub_explorer`.
   - Variant offering: clone Default into **paid_intro_test**, replace the
     monthly package with `expathub_explorer` configured to use a **$0.99
     intro price for 1 month** (no free trial). Create the matching intro
     offer in App Store Connect (**Pay As You Go → $0.99 / 1 month**) before
     launching the experiment.
   - Traffic split: 50/50, single audience (no overlap with the annual
     experiment below).
   - Stop rule: **statistical significance at 95%** OR **2,000 entitlement
     starts per arm**, whichever comes first.
6. **Experiments (annual $89 vs $99)** — only run when the paid-intro
   experiment is **not** active so we don't compound treatments:
   - Name: `annual_89_vs_99`.
   - Control offering: Default (annual = $89).
   - Variant offering: clone Default into **annual_99_test** with
     `expathub_pathfinder` priced at **$99/year** (create the $99 SKU in
     App Store Connect first; ASC requires a new SKU for any price change).
   - Traffic split: 50/50.
   - Stop rule: same as above.
7. Web `/pricing` and `/api/stripe/checkout` run their own A/B fork via the
   `ENABLE_PAID_INTRO_TEST` and `ENABLE_ANNUAL_PRICE_TEST` env flags — keep
   the RevenueCat experiment in sync (same arm, same dates) so the mobile
   and web reports describe the same population.

## 4. Stripe (web checkout)

1. In the Stripe dashboard, create / confirm two recurring **Prices**:
   - Monthly — $14.99 USD / month
   - Annual — $89 USD / year
2. Copy the price IDs into Replit Secrets:
   - `STRIPE_MONTHLY_PRICE_ID = price_…` (control: 14-day free trial → $14.99/mo)
   - `STRIPE_ANNUAL_PRICE_ID = price_…` (control: $89/year)
   - `STRIPE_SECRET_KEY = sk_…` (server-side, already required)
   - **A/B variant prices** (only required if the corresponding env flag is on):
     - `STRIPE_MONTHLY_PAID_INTRO_PRICE_ID = price_…` — recurring price that
       charges $0.99 today and $14.99/mo afterwards (no free trial). Falls
       back to `STRIPE_MONTHLY_PRICE_ID` when unset.
     - `STRIPE_ANNUAL_99_PRICE_ID = price_…` — $99/year. Falls back to
       `STRIPE_ANNUAL_PRICE_ID` when unset.
   - **Experiment toggles** (mutually exclusive — if both are on, only the
     paid-intro test runs):
     - `ENABLE_PAID_INTRO_TEST = 1`
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

- [ ] iOS sandbox purchase of `expathub_pathfinder` shows the **14-day free
      trial** introductory offer in the App Store sheet.
- [ ] iOS sandbox purchase of `expathub_explorer` shows the **14-day free
      trial** introductory offer.
- [ ] RevenueCat customer info reports a single `full_access` entitlement
      after either purchase.
- [ ] Web `/pricing` → "Start 14-day free trial" → Stripe Checkout shows
      "14-day free trial" and **$0 due today**.
- [ ] After the trial, Stripe charges $14.99 (monthly) or $89 (annual).
- [ ] No UI surface mentions Decision Pass, Country Lifetime, or a 7-day
      trial.
