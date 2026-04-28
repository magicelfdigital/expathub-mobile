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
- `cancellation-exit-offer.spec.ts`
  - When `/api/subscription/exit-offer/eligibility` returns
    `eligible: true`, the 50%-off card shows on `/account`.
  - Accepting the offer POSTs `/api/subscription/exit-offer`
    with `action: "accept"` and surfaces a "discount applied"
    confirmation.
  - When eligibility returns `false`, the offer card is skipped
    entirely.

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
```

Both suites also run as part of the full default test run
(`npx jest` and `npx playwright test`).
