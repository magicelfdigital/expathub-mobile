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
## How to run

Backend (Express on :5000) must be running for the Playwright suite.

```sh
# Web e2e (Playwright)
PLAYWRIGHT_BASE_URL=http://localhost:5000 npx playwright test
```

These specs also run as part of the full default test run
(`npx playwright test`).
