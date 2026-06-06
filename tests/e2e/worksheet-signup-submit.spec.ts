import { test, expect } from "playwright/test";

/**
 * Worksheet anonymous-signup-submit end-to-end coverage (Task #93).
 *
 * The unit tests around `app/(tabs)/(home)/worksheets/index.tsx` and
 * `app/(tabs)/(home)/worksheets/[id].tsx` cover the individual pieces
 * (list redirect to /auth, deep-link guard on the detail screen,
 * /auth honouring `redirectTo`), but nothing exercises the full loop
 * from an anonymous tap through to a recorded submission.
 *
 * This spec drives the whole funnel on web:
 *   1. Anonymous user lands on `/worksheets`.
 *   2. Taps a worksheet row → redirected to `/auth?mode=register&...`
 *      with the worksheet path encoded as `redirectTo`.
 *   3. Fills out register form → `/api/auth/register` mock returns a
 *      session.
 *   4. Auth screen consumes `redirectTo` and lands on the worksheet
 *      detail screen.
 *   5. User fills in the worksheet and taps "Save worksheet".
 *   6. `POST /api/worksheets/:id/submit` is observed with the answers
 *      the user actually entered.
 *
 * Why a separate baseURL: the React+Vite SPA at port 5000 doesn't
 * include the worksheets pages — those live in the Expo Router app
 * (`app/(tabs)/(home)/worksheets/*`), which on web is served by the
 * Expo dev server on port 8081. The locked-section / identity-join
 * specs all target the SPA at 5000; this one targets
 * the Expo web bundle. Override with `PLAYWRIGHT_EXPO_BASE_URL` if
 * the Expo dev server is bound to a different host.
 */

const EXPO_BASE_URL =
  process.env.PLAYWRIGHT_EXPO_BASE_URL ?? "http://localhost:8081";

// The Expo web bundle is built on-demand the first time the page is
// requested, which can comfortably exceed Playwright's 30s default.
const TEST_TIMEOUT_MS = 180_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Credentials": "true",
};

type FulfillBody = string | Record<string, unknown> | Array<unknown>;

function jsonResponse(body: FulfillBody, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: text,
  };
}

function corsPreflight() {
  return { status: 204, headers: CORS_HEADERS, body: "" };
}

test.describe("Worksheet anonymous → signup → submit", () => {
  test.use({ baseURL: EXPO_BASE_URL });

  test("anonymous tap, register, fill in, and submit records the response", async ({
    page,
    context,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    // The Expo Router root layout includes an OnboardingGate that
    // redirects unauthenticated, first-time visitors to
    // `/onboarding/intro` when the `hasSeenOnboarding` flag is not
    // set. AsyncStorage on web is backed by `window.localStorage`, so
    // we pre-seed the flag here to keep this test focused on the
    // worksheet funnel rather than the onboarding gate.
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("hasSeenOnboarding", "true");
      } catch {
        // localStorage may be unavailable in some contexts; ignore.
      }
    });

    // Track auth state so /api/auth/me flips after register succeeds.
    let currentUser: { id: number; email: string; hasProAccess: boolean } | null =
      null;

    // Playwright matches routes in reverse order of registration (the
    // most recently added handler runs first). Register the catch-all
    // FIRST so the specific handlers below take precedence; otherwise
    // the catch-all swallows /api/worksheets and the list comes back
    // as `{ ok: true }` instead of an array of worksheet rows.
    await context.route("**/api/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      return route.fulfill(jsonResponse({ ok: true }));
    });

    // BookmarkProvider fetches /api/notes and /api/bookmarks on mount
    // and expects arrays — calling `.filter()` on the result. The
    // catch-all above returns `{ ok: true }` which would crash the
    // provider and trigger the ErrorBoundary, which in turn navigates
    // the app back to "/" and breaks this whole funnel mid-flight.
    // Returning empty arrays here keeps the provider quiet so the
    // worksheet detail screen actually stays mounted.
    await context.route("**/api/bookmarks", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      // Toggle/save bookmark endpoints (POST/DELETE on /api/bookmarks/:slug)
      // are handled by the catch-all below; the list GET needs an array.
      if (route.request().method() === "GET") {
        return route.fulfill(jsonResponse([]));
      }
      return route.fulfill(jsonResponse({ ok: true }));
    });
    await context.route("**/api/notes", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      if (route.request().method() === "GET") {
        return route.fulfill(jsonResponse([]));
      }
      return route.fulfill(jsonResponse({ ok: true }));
    });

    // /api/auth/me — anonymous initially, populated after register.
    await context.route("**/api/auth/me", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      return route.fulfill(jsonResponse({ user: currentUser }));
    });

    // Public worksheet list (no auth). Two rows so the user has a real
    // tap target. Schema mirrors `WorksheetListItem` from
    // `src/hooks/useWorksheets.ts`.
    await context.route("**/api/worksheets", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      return route.fulfill(
        jsonResponse([
          {
            id: "ws_financial_cushion",
            questionId: 1,
            dimension: "Financial Cushion",
            title: "Your financial cushion",
            description:
              "A short check on the savings buffer you have to land safely in your new country.",
          },
          {
            id: "ws_income_stability",
            questionId: 2,
            dimension: "Income Stability",
            title: "Your income stability",
            description:
              "Where your income comes from once you arrive matters as much as how much it is.",
          },
        ]),
      );
    });

    // Per-user worksheet responses — empty so the detail screen treats
    // this user as having their one-free-worksheet still available.
    await context.route("**/api/worksheets/responses", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      return route.fulfill(jsonResponse([]));
    });

    // Register endpoint — flips currentUser so subsequent /api/auth/me
    // queries return an authenticated session, and returns the bearer
    // token the worksheet submit call will carry.
    let registerCalls = 0;
    await context.route("**/api/auth/register", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill(corsPreflight());
      }
      registerCalls += 1;
      currentUser = {
        id: 99001,
        email: "fresh-worksheet@test.local",
        hasProAccess: false,
      };
      return route.fulfill(
        jsonResponse({
          token: "test-bearer-token-worksheet-signup",
          user: currentUser,
        }),
      );
    });

    // Capture the worksheet submission so the test can assert the
    // server actually received the user's answers under the bearer
    // returned by /api/auth/register.
    const submissions: Array<{
      url: string;
      method: string;
      authorization: string | undefined;
      body: Record<string, unknown>;
    }> = [];
    await context.route(
      "**/api/worksheets/*/submit",
      async (route) => {
        const req = route.request();
        if (req.method() === "OPTIONS") {
          return route.fulfill(corsPreflight());
        }
        let body: Record<string, unknown> = {};
        try {
          body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
        } catch {
          // leave body empty on parse failure
        }
        submissions.push({
          url: req.url(),
          method: req.method(),
          authorization: req.headers()["authorization"],
          body,
        });
        return route.fulfill(
          jsonResponse({
            ok: true,
            worksheetId: "ws_financial_cushion",
            questionId: 1,
            dimensionScore: 2.5,
          }),
        );
      },
    );

    // (The catch-all `**/api/**` handler at the top of this block
    // already absorbs any other /api/* traffic — analytics, onboarding,
    // etc. — and is registered first so the specific handlers above
    // take precedence.)

    // 1. Anonymous user lands on the worksheets list.
    await page.goto("/worksheets", { waitUntil: "domcontentloaded" });

    const row = page.getByTestId("worksheet-row-ws_financial_cushion");
    await expect(row).toBeVisible({ timeout: TEST_TIMEOUT_MS });

    // 2. Tap a worksheet row → routed to /auth with redirectTo back
    //    to the worksheet detail.
    await row.click();
    const emailInput = page.getByTestId("auth-email");
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    // 3. Fill out register form and submit.
    await emailInput.fill("fresh-worksheet@test.local");
    await page.getByTestId("auth-password").fill("password123");
    await page.getByTestId("auth-confirm-password").fill("password123");
    await page.getByTestId("auth-submit").click();

    // The register mock must actually be hit — otherwise the rest of
    // the flow is meaningless.
    await expect
      .poll(() => registerCalls, {
        timeout: 15_000,
        message: "expected /api/auth/register to be POSTed by the auth screen",
      })
      .toBeGreaterThanOrEqual(1);

    // 4. After register, the auth screen consumes redirectTo and
    //    lands the user on the worksheet detail. The submit button
    //    is the load-bearing element here — its presence implies the
    //    detail screen mounted AND the open-time paywall guard did
    //    NOT redirect away (user has no prior responses, so they
    //    still have their one free worksheet).
    await expect(page.getByTestId("worksheet-submit")).toBeVisible({
      timeout: 30_000,
    });

    // 5. Fill in every question on ws_financial_cushion:
    //    - savings_months (choice) → "6to12"
    //    - expenses_priced (scale 1-5) → 4
    //    - comfort_drawdown (scale 1-5) → 4
    await page.getByTestId("choice-savings_months-6to12").click();
    await page.getByTestId("scale-expenses_priced-4").click();
    await page.getByTestId("scale-comfort_drawdown-4").click();

    // Submit.
    await page.getByTestId("worksheet-submit").click();

    // 6. The submission must actually reach /api/worksheets/:id/submit,
    //    carrying the bearer token the register mock issued AND the
    //    answers the user just typed in. If any handoff in the funnel
    //    breaks (auth modal not unmounting cleanly, stale user value
    //    re-triggering the anon guard, submit hook losing the token,
    //    etc.), this assertion fails.
    await expect
      .poll(() => submissions.length, {
        timeout: 15_000,
        message: "expected the worksheet submit POST to be observed",
      })
      .toBeGreaterThanOrEqual(1);

    const submission = submissions[0];
    expect(submission.method).toBe("POST");
    expect(submission.url).toContain(
      "/api/worksheets/ws_financial_cushion/submit",
    );
    expect(submission.authorization).toBe(
      "Bearer test-bearer-token-worksheet-signup",
    );

    const answers = submission.body.answers as
      | Record<string, unknown>
      | undefined;
    expect(answers).toBeTruthy();
    expect(answers!.savings_months).toBe("6to12");
    expect(answers!.expenses_priced).toBe(4);
    expect(answers!.comfort_drawdown).toBe(4);
  });
});
