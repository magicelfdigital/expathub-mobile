import { test, expect, type Request } from "playwright/test";

const SUB_ID = "sub_test_cancellation_e2e";

/**
 * Web cancellation flow exit-offer coverage.
 *
 * Asserts the conversion-lift contract for the web exit-offer card:
 *  1. Subscriber lands on /account, opens the cancellation flow.
 *  2. The eligibility endpoint runs; when eligible the 50%-off offer card
 *     is shown.
 *  3. Clicking "Yes, keep me at 50% off" POSTs `/api/subscription/exit-offer`
 *     with `action: "accept"` and the user is told the discount applied.
 *
 * Also:
 *  - When eligibility returns `eligible: false`, the offer card is
 *    skipped and the user is sent to the confirm step (no surprise card
 *    when the offer was already shown for the current period).
 */
test.describe("Web cancellation flow exit offer", () => {
  test("eligible subscriber sees the 50% offer, accepts, and is told the discount applied", async ({
    page,
    context,
  }) => {
    // Mock a paying user.
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "user-cancel-test-1",
            email: "cancel@test.local",
            hasProAccess: true,
            stripeSubscriptionId: SUB_ID,
          },
        }),
      }),
    );

    // Mock eligibility = true so the offer card shows.
    await context.route(
      "**/api/subscription/exit-offer/eligibility**",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            eligible: true,
            alreadyShown: false,
            periodStart: new Date().toISOString(),
          }),
        }),
    );

    // Capture every POST to /api/subscription/exit-offer so we can assert
    // the accept call happened with the right payload.
    const offerPosts: Array<Record<string, unknown>> = [];
    await context.route("**/api/subscription/exit-offer", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        try {
          const body = req.postDataJSON() as Record<string, unknown>;
          offerPosts.push(body);
        } catch {}
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, action: "accept" }),
      });
    });

    // Stub Stripe portal in case the test ever falls through to decline —
    // we don't want a real navigation off the SPA.
    await context.route("**/api/stripe/portal", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/account?portal=stub" }),
      }),
    );

    await page.goto("/account");

    // Open the cancellation flow.
    await page.getByTestId("manage-subscription-btn").click();

    // The offer card must appear once eligibility resolves.
    await expect(page.getByTestId("cancel-offer")).toBeVisible();
    await expect(
      page.getByTestId("cancel-offer-accept"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cancel-offer-decline"),
    ).toBeVisible();

    // The "shown" record should have been POSTed already — best-effort.
    await expect
      .poll(() => offerPosts.some((p) => p.action === "shown"), {
        timeout: 3_000,
        message: "expected best-effort 'shown' POST before accept",
      })
      .toBe(true);

    // Accept the offer.
    await page.getByTestId("cancel-offer-accept").click();

    // Success card with "discount applied" copy.
    const success = page.getByTestId("cancel-offer-success");
    await expect(success).toBeVisible();
    await expect(success).toContainText(/50%/);
    await expect(success).toContainText(/applied/i);

    // The accept POST must have been made with the correct payload.
    const acceptCall = offerPosts.find((p) => p.action === "accept");
    expect(acceptCall, "expected POST /api/subscription/exit-offer with action=accept").toBeTruthy();
    expect(acceptCall!.subscriptionId).toBe(SUB_ID);
  });

  test("when eligibility returns false, the offer card is skipped", async ({
    page,
    context,
  }) => {
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "user-cancel-test-2",
            email: "noexit@test.local",
            hasProAccess: true,
            stripeSubscriptionId: SUB_ID,
          },
        }),
      }),
    );

    await context.route(
      "**/api/subscription/exit-offer/eligibility**",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            eligible: false,
            alreadyShown: true,
          }),
        }),
    );

    let postCount = 0;
    await context.route("**/api/subscription/exit-offer", async (route) => {
      if (route.request().method() === "POST") postCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/account");
    await page.getByTestId("manage-subscription-btn").click();

    // No offer card; we land on the confirm step.
    await expect(page.getByTestId("cancel-confirm")).toBeVisible();
    await expect(page.getByTestId("cancel-offer")).toHaveCount(0);
    expect(postCount).toBe(0);
  });
});
