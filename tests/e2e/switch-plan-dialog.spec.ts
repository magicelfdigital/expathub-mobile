import { test, expect } from "playwright/test";

/**
 * Switch-plan confirmation dialog coverage (Task #129).
 *
 * Task #100 replaced the native `window.confirm` with a styled in-app
 * `SwitchPlanDialog` (rendered by `PlanProvider`) when a paid web user
 * tries to start a plan for a country other than the one they already
 * have active. The native (iOS/Android) `Alert.alert` path is covered
 * by Jest tests around `PlanContext`, but the web `Modal`-based dialog
 * was previously only exercised manually.
 *
 * This spec drives the dialog end-to-end on the Expo web bundle:
 *   1. Pre-seed `expathub_plan` localStorage so the user already has an
 *      active plan for Portugal, and pre-seed a dev promo code so
 *      `EntitlementContext` grants `hasFullAccess` without going
 *      through paywall / RC / Stripe.
 *   2. Land on `/country/spain/planner`. Because Spain ≠ active plan
 *      country, the planner renders the "Focus on Spain" CTA.
 *   3. Tap the CTA → assert the branded modal (testID
 *      `switch-plan-overlay`) appears with both action buttons, NOT a
 *      browser-native `window.confirm` (Playwright would otherwise
 *      have to register a `page.on("dialog")` handler).
 *   4. Cancel → modal closes, active plan stays on Portugal.
 *   5. Tap CTA again → modal re-appears → confirm → modal closes and
 *      the persisted plan state flips to Spain. This is the load-
 *      bearing assertion: it proves the confirm wiring still calls
 *      `doStartPlan`, which is what fires `plan_focus_started` and
 *      resets `completedSteps`.
 *
 * Why a separate baseURL: the React+Vite SPA at port 5000 doesn't
 * include the planner pages — those live in the Expo Router app
 * (`app/(tabs)/(home)/country/[slug]/planner.tsx`), which on web is
 * served by the Expo dev server on port 8081. Mirrors the setup in
 * `tests/e2e/worksheet-signup-submit.spec.ts`.
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

// Keep in sync with PlanContext.STORAGE_KEY / EntitlementContext.PROMO_CODE_KEY.
const PLAN_STORAGE_KEY = "expathub_plan";
const PROMO_CODE_KEY = "promo_code_redeemed";
const PROMO_CODE = "EXPATHUB-REVIEW-2026";

// The Portugal "d7" pathway key and Spain "nlv" pathway key both live
// in `data/pathways.ts` — using real keys keeps the test honest if a
// future refactor renames or removes them.
const PORTUGAL_PATHWAY_KEY = "d7";
const SPAIN_PATHWAY_KEY = "nlv";

// Shared setup helpers so the planner-surface test (Task #129) and the
// account-surface test (Task #137) stay identically configured.
async function failOnNativeDialog(page: import("playwright/test").Page) {
  // If the dialog regresses to `window.confirm`, this listener will
  // auto-accept it and the post-confirm assertion would still pass —
  // which would silently mask the regression we're guarding against.
  // Instead, fail loudly if any native dialog appears.
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
    throw new Error(
      `Unexpected native browser dialog: type=${dialog.type()} message=${dialog.message()}. ` +
        "The switch-plan flow must use the in-app SwitchPlanDialog, not window.confirm.",
    );
  });
}

async function seedAndRouteContext(
  context: import("playwright/test").BrowserContext,
) {
  // Pre-seed localStorage BEFORE any app code runs:
  //   - hasSeenOnboarding skips the onboarding gate redirect.
  //   - promo_code_redeemed grants hasFullAccess via the dev-only
  //     promo path in EntitlementContext.refresh().
  //   - expathub_plan gives the user an active Portugal plan so
  //     attempting to switch to Spain triggers the switch confirmation
  //     instead of starting fresh.
  await context.addInitScript(
    ({ planKey, planValue, promoKey, promoValue }) => {
      try {
        window.localStorage.setItem("hasSeenOnboarding", "true");
        window.localStorage.setItem(promoKey, promoValue);
        window.localStorage.setItem(planKey, planValue);
      } catch {
        // localStorage may be unavailable in some contexts; ignore.
      }
    },
    {
      planKey: PLAN_STORAGE_KEY,
      planValue: JSON.stringify({
        activeCountrySlug: "portugal",
        activePathwayId: PORTUGAL_PATHWAY_KEY,
        completedSteps: [],
        hasPets: false,
      }),
      promoKey: PROMO_CODE_KEY,
      promoValue: PROMO_CODE,
    },
  );

  // Catch-all for the rest of the /api/** traffic the app fires on
  // mount (analytics, bookmarks, notes, auth/me, entitlements, etc.).
  // Registered first so the specific handlers below take precedence —
  // Playwright matches routes in reverse registration order.
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
    return route.fulfill(jsonResponse({ ok: true }));
  });

  // BookmarkProvider expects arrays from these endpoints — returning
  // `{ ok: true }` would crash it and trigger ErrorBoundary, which
  // would navigate the app away from the screen under test.
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

  // Anonymous session — the planner's "Focus on …" CTA renders for
  // any paid user regardless of auth, and the promo code path in
  // EntitlementContext.refresh() short-circuits before the token
  // check, so an unauthenticated user with the promo flag still
  // gets hasFullAccess === true. The account screen also tolerates
  // an unauthenticated session (shows "Not signed in" but still
  // renders the active-plan card from local state).
  await context.route("**/api/auth/me", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill(corsPreflight());
    }
    return route.fulfill(jsonResponse({ user: null }));
  });
}

test.describe("Switch-plan confirmation dialog (web)", () => {
  test.use({ baseURL: EXPO_BASE_URL });

  test("cancel keeps the active plan; confirm switches it", async ({
    page,
    context,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await failOnNativeDialog(page);
    await seedAndRouteContext(context);

    // 1. Land directly on the Spain planner — different country than
    //    the seeded active plan, so the "Focus on Spain" CTA renders.
    await page.goto("/country/spain/planner", {
      waitUntil: "domcontentloaded",
    });

    // React Native Web renders <Pressable> as a <div> without an
    // implicit ARIA role, so getByRole("button") wouldn't match.
    // Anchor on the visible CTA text and take .first() so we don't
    // collide with the SAME "Focus on Spain" label that later appears
    // on the dialog's confirm button — the CTA is rendered above the
    // modal in DOM order, so .first() reliably points at the CTA even
    // while the dialog is open.
    const focusButton = page
      .getByText("Focus on Spain", { exact: true })
      .first();
    await expect(focusButton).toBeVisible({ timeout: TEST_TIMEOUT_MS });

    // 2. Tap the CTA → branded modal appears (testIDs come from
    //    `SwitchPlanDialog` in src/contexts/PlanContext.tsx).
    await focusButton.click();

    const overlay = page.getByTestId("switch-plan-overlay");
    const cancelBtn = page.getByTestId("switch-plan-cancel");
    const confirmBtn = page.getByTestId("switch-plan-confirm");

    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(cancelBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();

    // The confirm button label should be personalised to the target
    // country — this is what gives the dialog its calm, advisory feel
    // versus a generic "OK" / "Cancel" browser confirm.
    await expect(confirmBtn).toHaveText(/Focus on Spain/);

    // 3. Cancel path: modal closes, persisted plan stays on Portugal,
    //    no plan_focus_started analytics side-effect (verified
    //    indirectly via the unchanged active country).
    await cancelBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    const planAfterCancel = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      PLAN_STORAGE_KEY,
    );
    expect(planAfterCancel).not.toBeNull();
    const parsedAfterCancel = JSON.parse(planAfterCancel as string);
    expect(parsedAfterCancel.activeCountrySlug).toBe("portugal");
    expect(parsedAfterCancel.activePathwayId).toBe(PORTUGAL_PATHWAY_KEY);

    // 4. Confirm path: re-open the dialog, confirm, then assert the
    //    persisted plan state actually flipped to Spain. If the
    //    confirm wiring (handleConfirmSwitch → doStartPlan) ever
    //    regresses, this assertion fails.
    await focusButton.click();
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            PLAN_STORAGE_KEY,
          );
          if (!raw) return null;
          try {
            return (JSON.parse(raw) as { activeCountrySlug?: string })
              .activeCountrySlug ?? null;
          } catch {
            return null;
          }
        },
        {
          timeout: 10_000,
          message:
            "expected expathub_plan.activeCountrySlug to flip to 'spain' after confirming the switch",
        },
      )
      .toBe("spain");

    const planAfterConfirm = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      PLAN_STORAGE_KEY,
    );
    const parsedAfterConfirm = JSON.parse(planAfterConfirm as string);
    expect(parsedAfterConfirm.activePathwayId).toBe(SPAIN_PATHWAY_KEY);
    // doStartPlan resets progress when switching countries.
    expect(parsedAfterConfirm.completedSteps).toEqual([]);
  });

  // Task #137 — cover the second surface that triggers SwitchPlanDialog:
  // the account screen's "Switch or reset" plan-switcher sheet. This row
  // calls `startPlan(slug, firstPathway.key, name)` (app/account.tsx
  // `handlePickSwitchCountry`), and if the country name or pathway
  // wiring regresses here the planner-surface spec above wouldn't notice.
  test("account screen plan switcher opens the same branded dialog", async ({
    page,
    context,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await failOnNativeDialog(page);
    await seedAndRouteContext(context);

    // 1. Land on the account screen. The active-plan card + "Switch or
    //    reset" link render purely from the seeded `expathub_plan`
    //    localStorage entry — no auth required.
    await page.goto("/account", { waitUntil: "domcontentloaded" });

    const switchLink = page.getByTestId("account-active-plan-switch");
    await expect(switchLink).toBeVisible({ timeout: TEST_TIMEOUT_MS });

    // 2. Open the plan-switcher sheet → tap the Spain row.
    await switchLink.click();
    const sheet = page.getByTestId("account-plan-switch-sheet");
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const spainRow = page.getByTestId("account-plan-switch-country-spain");
    await expect(spainRow).toBeVisible();
    await spainRow.click();

    // handlePickSwitchCountry dismisses the sheet, then calls
    // startPlan via setTimeout(0) — the SwitchPlanDialog should
    // appear because Portugal ≠ Spain.
    const overlay = page.getByTestId("switch-plan-overlay");
    const cancelBtn = page.getByTestId("switch-plan-cancel");
    const confirmBtn = page.getByTestId("switch-plan-confirm");

    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(cancelBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();
    // Personalised label proves the country name made it through
    // handlePickSwitchCountry → startPlan → SwitchPlanDialog.
    await expect(confirmBtn).toHaveText(/Focus on Spain/);

    // 3. Cancel preserves the Portugal plan.
    await cancelBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    const planAfterCancel = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      PLAN_STORAGE_KEY,
    );
    expect(planAfterCancel).not.toBeNull();
    const parsedAfterCancel = JSON.parse(planAfterCancel as string);
    expect(parsedAfterCancel.activeCountrySlug).toBe("portugal");
    expect(parsedAfterCancel.activePathwayId).toBe(PORTUGAL_PATHWAY_KEY);

    // 4. Re-open the switcher, pick Spain again, confirm → persisted
    //    active country flips to Spain with reset progress.
    await switchLink.click();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await spainRow.click();
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            PLAN_STORAGE_KEY,
          );
          if (!raw) return null;
          try {
            return (
              (JSON.parse(raw) as { activeCountrySlug?: string })
                .activeCountrySlug ?? null
            );
          } catch {
            return null;
          }
        },
        {
          timeout: 10_000,
          message:
            "expected expathub_plan.activeCountrySlug to flip to 'spain' after confirming from the account switcher",
        },
      )
      .toBe("spain");

    const planAfterConfirm = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      PLAN_STORAGE_KEY,
    );
    const parsedAfterConfirm = JSON.parse(planAfterConfirm as string);
    expect(parsedAfterConfirm.activePathwayId).toBe(SPAIN_PATHWAY_KEY);
    expect(parsedAfterConfirm.completedSteps).toEqual([]);
  });
});
