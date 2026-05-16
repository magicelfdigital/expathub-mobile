import { test, expect } from "playwright/test";

/**
 * Delete-account confirmation dialog coverage (Task #142).
 *
 * Previously the account screen on web used a native `window.confirm`
 * pop-up to confirm account deletion (the last destructive action on
 * the screen still doing so after Tasks #129 / #137 / #141 migrated
 * the plan-switch and plan-reset flows to branded in-app dialogs).
 *
 * This spec drives the new branded confirmation end-to-end against
 * the Expo web bundle:
 *   1. Pre-seed `hasSeenOnboarding` and a dev promo code so the
 *      account screen renders without going through onboarding /
 *      paywall flows.
 *   2. Land on `/account`.
 *   3. Tap "Delete Account" → assert the branded modal (testID
 *      `delete-account-overlay`) appears with both action buttons,
 *      NOT a browser-native `window.confirm` (failOnNativeDialog
 *      registers a listener that would fail the test if one did).
 *   4. Cancel → modal hides, no DELETE request was fired.
 *   5. Re-open → confirm → modal closes and the DELETE /api/account
 *      request fires. This is the load-bearing assertion: it proves
 *      the confirm wiring still calls `performDeleteAccount`.
 *
 * Mirrors the surrounding switch-plan / reset-plan dialog specs
 * (see tests/e2e/switch-plan-dialog.spec.ts) so the test scaffolding
 * stays consistent.
 */

const EXPO_BASE_URL =
  process.env.PLAYWRIGHT_EXPO_BASE_URL ?? "http://localhost:8081";

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

const PROMO_CODE_KEY = "promo_code_redeemed";
const PROMO_CODE = "EXPATHUB-REVIEW-2026";

async function failOnNativeDialog(page: import("playwright/test").Page) {
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
    throw new Error(
      `Unexpected native browser dialog: type=${dialog.type()} message=${dialog.message()}. ` +
        "The delete-account flow must use the in-app branded dialog, not window.confirm.",
    );
  });
}

async function seedAndRouteContext(
  context: import("playwright/test").BrowserContext,
  deleteCounter: { count: number },
) {
  await context.addInitScript(
    ({ promoKey, promoValue }) => {
      try {
        window.localStorage.setItem("hasSeenOnboarding", "true");
        window.localStorage.setItem(promoKey, promoValue);
      } catch {
        // ignore
      }
    },
    { promoKey: PROMO_CODE_KEY, promoValue: PROMO_CODE },
  );

  // Catch-all for the rest of the /api/** traffic (analytics, auth/me,
  // bookmarks, etc). Registered first so the more specific handlers
  // below take precedence — Playwright matches routes in reverse
  // registration order.
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
    return route.fulfill(jsonResponse({ ok: true }));
  });

  await context.route("**/api/bookmarks", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
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
  await context.route("**/api/auth/me", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
    return route.fulfill(jsonResponse({ user: null }));
  });

  // The endpoint under test. Count DELETE invocations so the spec can
  // assert that Cancel does not fire it and Confirm does.
  await context.route("**/api/account", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
    if (req.method() === "DELETE") {
      deleteCounter.count += 1;
      return route.fulfill(jsonResponse({ ok: true }));
    }
    return route.fulfill(jsonResponse({ ok: true }));
  });
}

test.describe("Delete-account confirmation dialog (web)", () => {
  test.use({ baseURL: EXPO_BASE_URL });

  test("cancel does nothing; confirm fires DELETE /api/account", async ({
    page,
    context,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const deleteCounter = { count: 0 };
    await failOnNativeDialog(page);
    await seedAndRouteContext(context, deleteCounter);

    await page.goto("/account", { waitUntil: "domcontentloaded" });

    // The "Delete Account" row renders regardless of auth state.
    const deleteBtn = page
      .getByText("Delete Account", { exact: true })
      .first();
    await expect(deleteBtn).toBeVisible({ timeout: TEST_TIMEOUT_MS });

    // 1. Open the branded dialog.
    await deleteBtn.click();

    const overlay = page.getByTestId("delete-account-overlay");
    const cancelBtn = page.getByTestId("delete-account-cancel");
    const confirmBtn = page.getByTestId("delete-account-confirm");

    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(cancelBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();

    // 2. Cancel → modal hides, no DELETE call fired.
    await cancelBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
    expect(deleteCounter.count).toBe(0);

    // 3. Re-open → confirm → expect DELETE /api/account to fire and
    //    the modal to close.
    await deleteBtn.click();
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    await expect
      .poll(() => deleteCounter.count, {
        timeout: 10_000,
        message:
          "expected DELETE /api/account to be called exactly once after confirming",
      })
      .toBe(1);
  });
});
