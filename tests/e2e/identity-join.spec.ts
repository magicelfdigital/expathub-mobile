import { test, expect } from "playwright/test";

/**
 * Web identity-join coverage (Task #40 contract).
 *
 * The web funnel sends a stable `distinct_id` with every analytics event so
 * PostHog can join pre-account quiz events to post-account purchase events.
 * The identifier is upgraded twice:
 *
 *   1. Anonymous random id            → quiz events
 *   2. SHA-256(email) (`email:<hex>`) → email gate (`identifyByEmail`)
 *   3. `user:<userId>`                → after `/api/auth/me` resolves a user
 *      (`identifyWebUser`, called from `useUser`)
 *
 * Each upgrade is supposed to fire a `$identify` event whose
 * `$anon_distinct_id` is the previous id, which is what tells PostHog to
 * alias the two ids together. If any link in that chain breaks, the
 * conversion-lift dashboards silently lose the join — and we only notice
 * weeks later when the funnel numbers stop matching reality.
 *
 * These tests pin that chain end-to-end.
 */

type AnalyticsPayload = {
  event: string;
  distinct_id?: string;
  properties?: Record<string, unknown>;
};

const ANON_KEY = "eh_anon_distinct_id";
const DISTINCT_KEY = "eh_distinct_id";
const IDENTIFIED_USER_KEY = "eh_identified_user_id";

// Each Playwright test gets a fresh browser context, which means an empty
// `localStorage`. We rely on that for the anon-id phase of the first test,
// rather than wiring an `addInitScript` clear (which would also wipe the
// email-keyed id between Phase 2 and Phase 3 of the same test).

async function captureAnalytics(
  context: import("playwright/test").BrowserContext,
  sink: AnalyticsPayload[],
) {
  await context.route("**/api/analytics", async (route) => {
    try {
      const body = route.request().postDataJSON() as AnalyticsPayload;
      sink.push(body);
    } catch {
      // ignore malformed payloads in test
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

async function stubBackend(context: import("playwright/test").BrowserContext) {
  // Stub the lead endpoints so the form succeeds without a real backend
  // round-trip. Both are best-effort from the page's perspective.
  await context.route("**/api/readiness-lead", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
  await context.route("**/api/auth/quiz-lead", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
}

test.describe("Web identity join (quiz → email → account)", () => {
  test("anon → email → user_id chain joins via $identify on /api/analytics", async ({
    page,
    context,
  }) => {
    // Force-anonymous for the quiz portion. We swap this mock later in the
    // same test to exercise the post-auth reconciliation path.
    let authenticated = false;
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: authenticated
          ? JSON.stringify({
              user: {
                id: "user-identity-join-1",
                email: "join@test.local",
                hasProAccess: false,
              },
            })
          : JSON.stringify({ user: null }),
      }),
    );

    const analytics: AnalyticsPayload[] = [];
    await captureAnalytics(context, analytics);
    await stubBackend(context);

    await page.goto("/start");

    // Walk the quiz: intro → 4 yes/no → region.
    await page.getByTestId("quiz-start").click();
    for (let i = 0; i < 4; i++) {
      // Each yes/no question renders an answer with `data-testid=quiz-answer-yes`.
      // `.first()` is defensive against any future addition of duplicate yeses.
      await page.getByTestId("quiz-answer-yes").first().click();
    }
    await page.getByTestId("quiz-answer-southern_europe").click();

    // Email gate appears after the 900ms calculating spinner.
    await expect(page.getByTestId("quiz-email-gate")).toBeVisible();

    // ── Phase 1: every quiz event before the email gate must carry the
    // same anonymous distinct_id. If `getDistinctId()` ever regresses to
    // returning a fresh id per call, this assertion fails immediately.
    const preEmail = analytics.filter(
      (e) => e.event !== "$identify" && typeof e.distinct_id === "string",
    );
    expect(
      preEmail.length,
      "expected at least quiz_started + quiz_question_answered events",
    ).toBeGreaterThanOrEqual(2);
    const anonId = preEmail[0]?.distinct_id;
    expect(anonId, "first quiz event missing distinct_id").toBeTruthy();
    for (const e of preEmail) {
      expect(
        e.distinct_id,
        `event ${e.event} broke the anon distinct_id chain`,
      ).toBe(anonId);
      // The same id is also forwarded inside `properties` so backends that
      // only inspect properties still see it. Pin both surfaces.
      expect(
        (e.properties as Record<string, unknown> | undefined)?.distinct_id,
        `event ${e.event} missing distinct_id in properties`,
      ).toBe(anonId);
    }
    // Sanity check that the anon id is NOT already an email-keyed or
    // user-keyed id (i.e. localStorage really was empty at the start).
    expect(anonId!.startsWith("email:")).toBe(false);
    expect(anonId!.startsWith("user:")).toBe(false);

    const preEmailCount = analytics.length;

    // ── Phase 2: submit the email gate. `identifyByEmail` should fire
    // `$identify` with the previous anon id as `$anon_distinct_id` and a
    // new `email:<sha256>` distinct_id, and every subsequent event should
    // carry the new id.
    await page.getByTestId("input-email").fill("Join@Test.Local");
    await page.getByTestId("button-email-submit").click();
    await expect(page.getByTestId("quiz-results")).toBeVisible();

    // Wait until the $identify event has actually been observed — the
    // POST is keepalive/fire-and-forget so it can race the UI transition.
    await expect
      .poll(
        () =>
          analytics.some(
            (e) =>
              e.event === "$identify" &&
              typeof e.distinct_id === "string" &&
              e.distinct_id.startsWith("email:"),
          ),
        {
          timeout: 5_000,
          message:
            "expected $identify with email:<sha256> distinct_id after email gate",
        },
      )
      .toBe(true);

    const identifyEmail = analytics.find(
      (e) =>
        e.event === "$identify" &&
        typeof e.distinct_id === "string" &&
        e.distinct_id.startsWith("email:"),
    )!;
    expect(identifyEmail.distinct_id).toMatch(/^email:[0-9a-f]{64}$/);
    expect(
      (identifyEmail.properties as Record<string, unknown>)?.$anon_distinct_id,
      "$identify must carry the previous anon id so PostHog aliases the two",
    ).toBe(anonId);
    const emailId = identifyEmail.distinct_id!;

    // Subsequent (non-$identify) events fired AFTER the email gate must
    // use the new email-keyed id. We slice to just the post-email tail
    // and assert no event regressed back to the anon id.
    const postEmailEvents = analytics
      .slice(preEmailCount)
      .filter((e) => e.event !== "$identify");
    expect(
      postEmailEvents.length,
      "expected at least one post-email-gate event (e.g. quiz_completed, result_screen_viewed)",
    ).toBeGreaterThan(0);
    for (const e of postEmailEvents) {
      expect(
        e.distinct_id,
        `event ${e.event} fired after email gate but kept the anon id`,
      ).toBe(emailId);
    }

    // ── Phase 3: now simulate the user signing in. Flip the auth mock,
    // reload, and assert `useUser` fires a second `$identify` reconciling
    // the email-keyed id to the real user id.
    const beforeAuthCount = analytics.length;
    authenticated = true;
    await page.goto("/start");

    await expect
      .poll(
        () =>
          analytics
            .slice(beforeAuthCount)
            .some(
              (e) =>
                e.event === "$identify" &&
                e.distinct_id === "user:user-identity-join-1",
            ),
        {
          timeout: 5_000,
          message:
            "expected $identify with user:<id> distinct_id after /api/auth/me resolved",
        },
      )
      .toBe(true);

    const identifyUser = analytics
      .slice(beforeAuthCount)
      .find(
        (e) =>
          e.event === "$identify" &&
          e.distinct_id === "user:user-identity-join-1",
      )!;
    expect(
      (identifyUser.properties as Record<string, unknown>)?.$anon_distinct_id,
      "post-auth $identify must reference the email-keyed id so the chain stays joined",
    ).toBe(emailId);
  });

  test("authenticated session reconciles a stored email id to the real user id", async ({
    page,
    context,
  }) => {
    // This test isolates Phase 3 from the previous test: it pre-seeds the
    // page with an existing email-keyed distinct_id (as if the user had
    // already taken the quiz on a previous visit) and asserts that the
    // first authenticated page load fires the reconciliation `$identify`.
    const seededAnon = "anon-seeded-for-test";
    const seededEmail = "email:" + "a".repeat(64);

    await context.addInitScript(
      ({ anon, distinct, user, anonValue, distinctValue }) => {
        try {
          window.localStorage.setItem(anon, anonValue);
          window.localStorage.setItem(distinct, distinctValue);
          window.localStorage.removeItem(user);
        } catch {
          // ignore — storage may be unavailable in some environments
        }
      },
      {
        anon: ANON_KEY,
        distinct: DISTINCT_KEY,
        user: IDENTIFIED_USER_KEY,
        anonValue: seededAnon,
        distinctValue: seededEmail,
      },
    );

    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: 4242,
            email: "returning@test.local",
            hasProAccess: false,
          },
        }),
      }),
    );

    const analytics: AnalyticsPayload[] = [];
    await captureAnalytics(context, analytics);
    await stubBackend(context);

    await page.goto("/start");

    // The reconciliation $identify must fire once the session resolves.
    await expect
      .poll(
        () =>
          analytics.some(
            (e) =>
              e.event === "$identify" && e.distinct_id === "user:4242",
          ),
        {
          timeout: 5_000,
          message:
            "expected $identify reconciling stored email id to user:4242",
        },
      )
      .toBe(true);

    const identify = analytics.find(
      (e) => e.event === "$identify" && e.distinct_id === "user:4242",
    )!;
    expect(
      (identify.properties as Record<string, unknown>)?.$anon_distinct_id,
      "post-auth $identify must reference the previously-stored distinct_id, not the original anon id",
    ).toBe(seededEmail);
  });
});
