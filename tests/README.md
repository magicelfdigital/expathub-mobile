# Conversion-lift test coverage

End-to-end and harness tests that protect the v1.4 conversion-lift
flows. Wired up alongside Task #16 ("Verify the new conversion lifts
end-to-end with automated browser tests").

## What's covered

Web (Playwright, `tests/e2e/`):

- `locked-section.spec.ts`
  - `/country/:slug` renders the locked overlay + masked free preview
    for anonymous users.
  - `paywall_locked_section_viewed` is POSTed to `/api/analytics`
    with the right `section`/`country` fields.
  - Pro users see no overlay and no analytics fires.
- `identity-join.spec.ts`
  - Drives `/start`: takes the quiz, submits an email, then simulates an
    authenticated session and asserts the analytics chain stays joined.
  - All pre-email-gate events share a single anonymous `distinct_id`.
  - The email gate fires `$identify` whose `$anon_distinct_id` is that
    anon id and whose new `distinct_id` is `email:<sha256>`.
  - Subsequent events use the new email-keyed id.
  - Once `/api/auth/me` resolves, `useUser` fires a follow-up `$identify`
    that reconciles the email id to `user:<userId>`.
- `cancellation-exit-offer.spec.ts`
  - When `/api/subscription/exit-offer/eligibility` returns
    `eligible: true`, the 50%-off card shows on `/account`.
  - Accepting the offer POSTs `/api/subscription/exit-offer`
    with `action: "accept"` and surfaces a "discount applied"
    confirmation.
  - When eligibility returns `false`, the offer card is skipped
    entirely.

Mobile (Maestro on iOS simulator, `.maestro/`):

- `reverse-trial-on-dismiss.yaml`
  - Launches the app with cleared state, deep-links into `expathub://subscribe`
    to open `ProPaywall`, taps the close button, and asserts the
    "Enjoy 48 hours of full access — on us." toast surfaces through the
    global `<Toast testID="toast" />` mounted in `app/_layout.tsx`.
  - Re-opens the paywall and dismisses again. `AsyncStorage` now has
    `reverseTrial_used=true`, so the predicate in
    `src/lib/conversionLifts.ts::shouldGrantReverseTrialOnDismiss`
    short-circuits and the toast must NOT reappear — proves the
    one-shot gate holds across remounts.
- `cancellation-exit-offer.yaml`
  - Deep-links into the dev-only `expathub://debug-cancellation` harness
    (`app/debug-cancellation.tsx`), which renders `CancellationModal`
    directly with `exitOffer.eligible=true` and a wired `onAccept`
    callback that flips a visible status row.
  - Asserts the modal opens on the `exit_offer` step first (via
    `getInitialCancellationStep`), taps `exit-offer-accept`, and
    asserts both the wired `onAccept` ran and the modal closed.

Mobile (Jest harness, `src/billing/__tests__/conversionLifts.test.ts`):

- The two pure predicates extracted into `src/lib/conversionLifts.ts`
  (`shouldGrantReverseTrialOnDismiss`, `getInitialCancellationStep`)
  are exercised across all branches.
- Behavioural harnesses simulate `ProPaywall.handleClose` and the
  `CancellationModal` accept/decline handlers, asserting the same
  ordering, analytics names, and state transitions used in production.
  Both `ProPaywall` and `CancellationModal` import the same predicates,
  so a regression in either surface fails the harness.

## How to run

Backend (Express on :5000) must be running for the Playwright suite.

```sh
# Mobile harness (jest)
npx jest src/billing/__tests__/conversionLifts.test.ts

# Web e2e (Playwright)
PLAYWRIGHT_BASE_URL=http://localhost:5000 npx playwright test

# Mobile e2e (Maestro on iOS simulator)
#
# Requires:
#   - macOS with Xcode + the iOS Simulator
#   - Maestro CLI (`curl -Ls "https://get.maestro.mobile.dev" | bash`)
#   - The Expo dev client running on the booted simulator
#     (`npm run expo:dev`, then "Open on iOS simulator" from Expo)
#
# The flows deep-link into `expathub://subscribe` and
# `expathub://debug-cancellation` (the debug harness is __DEV__-only and
# crashes in production builds, so run them against the dev client).
maestro test .maestro/reverse-trial-on-dismiss.yaml
maestro test .maestro/cancellation-exit-offer.yaml
```

Both suites also run as part of the full default test run
(`npx jest` and `npx playwright test`).
