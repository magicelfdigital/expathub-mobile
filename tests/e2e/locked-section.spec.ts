import { test, expect, type Request } from "playwright/test";

/**
 * Web LockedSection conversion-lift coverage.
 *
 * Asserts:
 *  1. The locked overlay actually renders on `/country/:slug` for an
 *     anonymous (non-Pro) visitor.
 *  2. The masked free preview is rendered alongside the overlay (so the
 *     blur-preview UX is intact, not just the gate).
 *  3. The unified analytics event `paywall_locked_section_viewed` is
 *     POSTed to `/api/analytics` with the expected `section` + `country`.
 *
 * The third assertion is the regression-catcher the task calls out:
 * if `LockedSection` ever stops firing the pixel, this test fails.
 */
test.describe("Locked section blur preview", () => {
  test("renders locked overlay and emits paywall_locked_section_viewed", async ({
    page,
    context,
  }) => {
    // Force-anonymous: short-circuit `/api/auth/me` so the test does not
    // depend on whatever session may already be in the dev DB.
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null }),
      }),
    );

    // Capture every analytics POST the page fires while we walk the page.
    const analyticsPayloads: Array<Record<string, unknown>> = [];
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        analyticsPayloads.push(body);
      } catch {
        // ignore malformed payloads in test
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/country/spain");

    // The country page renders.
    await expect(page.getByTestId("page-country-detail")).toBeVisible();

    // The visa-pathway locked section should be present and locked.
    const visaSection = page.getByTestId("locked-section-visa_pathway");
    await expect(visaSection).toBeVisible();
    await expect(visaSection).toHaveAttribute("data-state", "locked");

    // The masked free preview AND the lock overlay should both render.
    await expect(page.getByTestId("locked-preview-visa_pathway")).toBeVisible();
    await expect(page.getByTestId("locked-overlay-visa_pathway")).toBeVisible();
    await expect(page.getByTestId("locked-cta-visa_pathway")).toBeVisible();

    // Scroll a few sections into view so the IntersectionObserver fires
    // for sections beyond the visible area at first paint.
    await page.getByTestId("locked-section-cost_by_city").scrollIntoViewIfNeeded();
    await page.getByTestId("locked-section-healthcare").scrollIntoViewIfNeeded();
    await page.getByTestId("locked-section-schools").scrollIntoViewIfNeeded();

    // Wait until the unified-analytics event is observed for the
    // visa-pathway section. This is the regression contract.
    await expect
      .poll(
        () =>
          analyticsPayloads.some(
            (p) =>
              p.event === "paywall_locked_section_viewed" &&
              (p.properties as Record<string, unknown> | undefined)?.section ===
                "visa_pathway",
          ),
        { timeout: 5_000, message: "analytics call for visa_pathway not fired" },
      )
      .toBe(true);

    const visaEvent = analyticsPayloads.find(
      (p) =>
        p.event === "paywall_locked_section_viewed" &&
        (p.properties as Record<string, unknown> | undefined)?.section ===
          "visa_pathway",
    )!;
    const props = visaEvent.properties as Record<string, unknown>;
    expect(props.country).toBe("spain");
    // The web pixel module tags every analytics event with `surface: "web"`.
    expect(props.surface).toBe("web");

    // Ensure unrelated sections also reported once they were scrolled into
    // view — protects the "fires once per locked section" contract.
    const seenSections = new Set(
      analyticsPayloads
        .filter((p) => p.event === "paywall_locked_section_viewed")
        .map(
          (p) =>
            (p.properties as Record<string, unknown> | undefined)?.section as
              | string
              | undefined,
        )
        .filter((s): s is string => typeof s === "string"),
    );
    expect(seenSections.has("visa_pathway")).toBe(true);
    expect(seenSections.size).toBeGreaterThanOrEqual(2);
  });

  test("does not show the lock overlay for users with Pro access", async ({
    page,
    context,
  }) => {
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "test-user-1",
            email: "pro@test.local",
            hasProAccess: true,
            stripeSubscriptionId: "sub_test_pro",
          },
        }),
      }),
    );

    let lockedAnalyticsCount = 0;
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (body.event === "paywall_locked_section_viewed") {
          lockedAnalyticsCount += 1;
        }
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/country/spain");

    const visaSection = page.getByTestId("locked-section-visa_pathway");
    await expect(visaSection).toBeVisible();
    await expect(visaSection).toHaveAttribute("data-state", "unlocked");

    // No overlay, no CTA, no analytics for paying users.
    await expect(
      page.getByTestId("locked-overlay-visa_pathway"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("locked-cta-visa_pathway"),
    ).toHaveCount(0);

    // Give any deferred analytics a beat to fire — none should.
    await page.waitForTimeout(500);
    expect(lockedAnalyticsCount).toBe(0);
  });
});
