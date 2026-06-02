import { test, expect } from "playwright/test";
import type { BrowserContext, Page } from "playwright/test";

/**
 * Web /start save-your-progress recovery modal coverage.
 *
 * The /start funnel shows a "save your progress" modal after the 5th
 * question when the visitor has answered "no" 3+ times — mirroring the
 * mobile QuizSaveModal trigger so we can recover stalled visitors who
 * would otherwise abandon at the email gate.
 *
 * Asserts the contract end-to-end:
 *  1. With 3+ "no" answers, the modal renders and `quiz_save_shown`
 *     fires with the expected payload.
 *  2. Submitting the email POSTs `/api/auth/quiz-lead` with
 *     `source: "web_funnel_save"` (so the welcome-email sequence picks
 *     it up) and emits `quiz_save_submitted`.
 *  3. Submitting also fires the Meta Pixel `Lead` event in the real
 *     browser (via react-facebook-pixel → window.fbq), and never on a
 *     failed save. The raw email must never appear in the Pixel payload.
 *  4. With <3 "no" answers, the modal does NOT render and no
 *     `quiz_save_shown` event fires.
 *  5. Closing the modal emits `quiz_save_dismissed` with
 *     `submitted: false` and the user is advanced to the email gate
 *     instead of being stranded on the last question.
 */

// react-facebook-pixel proxies every Pixel call through `window.fbq`. The
// unit test (web/src/components/__tests__/QuizSaveModal.test.tsx) mocks the
// whole `@/lib/pixel` module, so it can't catch a regression where Pixel
// init breaks or the real fbq path stops firing. Here we install a stub
// `window.fbq` *before any page script runs* so the genuine
// trackLead -> ReactPixel.track("Lead") -> fbq("track","Lead",...) chain
// executes end-to-end and gets recorded — no external connect.facebook.net
// load required. Because react-facebook-pixel reads `!!window.fbq` at module
// import time, a pre-existing stub also makes it treat the Pixel as
// initialised, so calls flow through even though the build uses a fake id.
async function installPixelRecorder(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as {
      fbq?: unknown;
      _fbq?: unknown;
      __pixelCalls?: unknown[][];
    };
    if (w.__pixelCalls) return;
    w.__pixelCalls = [];
    const fbq = (...args: unknown[]) => {
      w.__pixelCalls!.push(args);
    };
    // Mirror the shape react-facebook-pixel expects of an existing fbq.
    (fbq as unknown as { queue: unknown[] }).queue = [];
    (fbq as unknown as { loaded: boolean }).loaded = true;
    (fbq as unknown as { version: string }).version = "2.0";
    (fbq as unknown as { push: unknown }).push = fbq;
    w.fbq = fbq;
    w._fbq = fbq;
  });
}

// Returns the params object of every fbq("track", "Lead", params) call so
// far. An empty array means the Meta Lead signal never fired.
async function leadPixelParams(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const calls =
      (window as unknown as { __pixelCalls?: unknown[][] }).__pixelCalls ?? [];
    return calls
      .filter((c) => c[0] === "track" && c[1] === "Lead")
      .map((c) => c[2] ?? null);
  });
}

test.describe("Quiz save-your-progress modal", () => {
  test("modal appears after Q5 with 3+ 'no' answers, captures email, advances", async ({
    page,
    context,
  }) => {
    // Record the real Meta Pixel calls before any page script runs.
    await installPixelRecorder(context);

    // Force-anonymous so we don't depend on whatever session may already
    // be in the dev DB.
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null }),
      }),
    );

    const analyticsPayloads: Array<Record<string, unknown>> = [];
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        analyticsPayloads.push(body);
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // Capture the soft-save lead POST so we can assert the source string
    // the welcome-email sequence relies on.
    const quizLeadBodies: Array<Record<string, unknown>> = [];
    await context.route("**/api/auth/quiz-lead", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        quizLeadBodies.push(body);
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/start");
    await expect(page.getByTestId("quiz-intro")).toBeVisible();
    await page.getByTestId("quiz-start").click();

    // Answer Q1, Q2, Q3 with "no" so noCount hits the threshold.
    await page.getByTestId("quiz-question-1").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-2").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-3").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    // Q5 with "yes" — noCount stays at 3, still >= threshold.
    await page.getByTestId("quiz-question-5").waitFor();
    await page.getByTestId("quiz-answer-yes").click();
    // Q9 (region) — answering this is the trigger for the prompt because
    // it lands the user on currentIndex === 4 (the 5th funnel slot).
    await page.getByTestId("quiz-question-9").waitFor();
    await page.getByTestId("quiz-answer-southern_europe").click();

    // Modal must render in the form state, not the success state.
    await expect(page.getByTestId("quiz-save-modal")).toBeVisible();
    await expect(page.getByTestId("quiz-save-form")).toBeVisible();
    await expect(page.getByTestId("quiz-save-success")).toHaveCount(0);

    // quiz_save_shown should have fired with the same shape mobile uses.
    await expect
      .poll(
        () =>
          analyticsPayloads.some(
            (p) =>
              p.event === "quiz_save_shown" &&
              (p.properties as Record<string, unknown> | undefined)
                ?.questionIndex === 4 &&
              (p.properties as Record<string, unknown> | undefined)
                ?.noCount === 3,
          ),
        { timeout: 5_000, message: "quiz_save_shown not fired" },
      )
      .toBe(true);

    const shownProps = (
      analyticsPayloads.find((p) => p.event === "quiz_save_shown")!
        .properties as Record<string, unknown>
    );
    // The pixel module tags every analytics event with surface: "web".
    expect(shownProps.surface).toBe("web");

    // Submit the email — this is the recovery moment.
    const testEmail = `qsmtest+${Date.now()}@example.local`;
    await page.getByTestId("quiz-save-email").fill(testEmail);
    await page.getByTestId("quiz-save-submit").click();

    // Success state appears once the lead has been written.
    await expect(page.getByTestId("quiz-save-success")).toBeVisible();

    // The lead POST must use the soft-save source so the welcome email
    // sequence trigger picks it up.
    await expect
      .poll(() => quizLeadBodies.length, { timeout: 5_000 })
      .toBeGreaterThan(0);
    const lead = quizLeadBodies[0];
    expect(lead.email).toBe(testEmail);
    expect(lead.source).toBe("web_funnel_save");
    // A readiness level is required by the endpoint — we send the same
    // blocker sentinel the mobile modal uses so the rows are consistent
    // across surfaces.
    expect(lead.readinessLevel).toBe("quiz_save_blockers");

    // quiz_save_submitted should have fired with the noCount.
    await expect
      .poll(
        () =>
          analyticsPayloads.some(
            (p) =>
              p.event === "quiz_save_submitted" &&
              (p.properties as Record<string, unknown> | undefined)
                ?.noCount === 3,
          ),
        { timeout: 5_000, message: "quiz_save_submitted not fired" },
      )
      .toBe(true);

    // The Meta Pixel `Lead` must fire in the real browser after the save —
    // the signal Meta's App Promotion / Conversions campaigns optimise on.
    // This is the part the module-mocking unit test cannot prove.
    await expect
      .poll(async () => (await leadPixelParams(page)).length, {
        timeout: 5_000,
        message: "Meta Pixel Lead never fired after successful save",
      })
      .toBe(1);

    const leadParams = (await leadPixelParams(page))[0] as Record<
      string,
      unknown
    >;
    expect(leadParams.source).toBe("quiz_save");
    expect(leadParams.noCount).toBe(3);

    // PII guardrail: the raw email must never leave the device via the Pixel.
    // Stringify the entire recorded fbq call log, not just the Lead params,
    // so we catch the email leaking into any Pixel call.
    const allPixelCalls = await page.evaluate(
      () =>
        (window as unknown as { __pixelCalls?: unknown[][] }).__pixelCalls ?? [],
    );
    expect(JSON.stringify(allPixelCalls)).not.toContain(testEmail);

    // "See my match" advances the flow rather than stranding the user.
    await page.getByTestId("quiz-save-continue").click();
    await expect(page.getByTestId("quiz-save-modal")).toHaveCount(0);
    // Calculating spinner is brief (~900ms) then the email gate appears.
    await expect(page.getByTestId("quiz-email-gate")).toBeVisible({
      timeout: 4_000,
    });
  });

  test("modal does NOT appear when fewer than 3 'no' answers were given", async ({
    page,
    context,
  }) => {
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null }),
      }),
    );

    let savePromptShownCount = 0;
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (body.event === "quiz_save_shown") savePromptShownCount += 1;
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/start");
    await expect(page.getByTestId("quiz-intro")).toBeVisible();
    await page.getByTestId("quiz-start").click();

    // Only one "no" — threshold (3) not met.
    await page.getByTestId("quiz-question-1").waitFor();
    await page.getByTestId("quiz-answer-yes").click();
    await page.getByTestId("quiz-question-2").waitFor();
    await page.getByTestId("quiz-answer-yes").click();
    await page.getByTestId("quiz-question-3").waitFor();
    await page.getByTestId("quiz-answer-yes").click();
    await page.getByTestId("quiz-question-5").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-9").waitFor();
    await page.getByTestId("quiz-answer-southern_europe").click();

    // Modal stays hidden, flow goes straight to the email gate.
    await expect(page.getByTestId("quiz-save-modal")).toHaveCount(0);
    await expect(page.getByTestId("quiz-email-gate")).toBeVisible({
      timeout: 4_000,
    });
    expect(savePromptShownCount).toBe(0);
  });

  test("dismissing the modal fires quiz_save_dismissed and advances the flow", async ({
    page,
    context,
  }) => {
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null }),
      }),
    );

    const analyticsPayloads: Array<Record<string, unknown>> = [];
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        analyticsPayloads.push(body);
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/start");
    await page.getByTestId("quiz-start").click();

    // 4 "no" answers — well above threshold, modal will appear.
    await page.getByTestId("quiz-question-1").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-2").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-3").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-5").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-9").waitFor();
    await page.getByTestId("quiz-answer-southern_europe").click();

    await expect(page.getByTestId("quiz-save-modal")).toBeVisible();

    // Dismiss via the × button (the user explicitly walked away).
    await page.getByTestId("quiz-save-close").click();

    await expect
      .poll(
        () =>
          analyticsPayloads.some(
            (p) =>
              p.event === "quiz_save_dismissed" &&
              (p.properties as Record<string, unknown> | undefined)
                ?.submitted === false,
          ),
        { timeout: 5_000, message: "quiz_save_dismissed not fired" },
      )
      .toBe(true);

    // User is not stranded on the answered question — they end up at
    // the regular email gate.
    await expect(page.getByTestId("quiz-save-modal")).toHaveCount(0);
    await expect(page.getByTestId("quiz-email-gate")).toBeVisible({
      timeout: 4_000,
    });
  });

  test("a failed save does NOT fire the Meta Pixel Lead (no false ad signal)", async ({
    page,
    context,
  }) => {
    await installPixelRecorder(context);

    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null }),
      }),
    );

    const analyticsPayloads: Array<Record<string, unknown>> = [];
    await context.route("**/api/analytics", async (route) => {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        analyticsPayloads.push(body);
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // The lead save fails server-side — the modal must surface an error and
    // the Pixel `Lead` must NOT fire, or Meta would optimise toward a
    // conversion that never actually happened.
    await context.route("**/api/auth/quiz-lead", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      }),
    );

    await page.goto("/start");
    await expect(page.getByTestId("quiz-intro")).toBeVisible();
    await page.getByTestId("quiz-start").click();

    // 3 "no" answers reach the threshold and open the modal.
    await page.getByTestId("quiz-question-1").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-2").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-3").waitFor();
    await page.getByTestId("quiz-answer-no").click();
    await page.getByTestId("quiz-question-5").waitFor();
    await page.getByTestId("quiz-answer-yes").click();
    await page.getByTestId("quiz-question-9").waitFor();
    await page.getByTestId("quiz-answer-southern_europe").click();

    await expect(page.getByTestId("quiz-save-modal")).toBeVisible();
    await expect(page.getByTestId("quiz-save-form")).toBeVisible();

    const testEmail = `qsmfail+${Date.now()}@example.local`;
    await page.getByTestId("quiz-save-email").fill(testEmail);
    await page.getByTestId("quiz-save-submit").click();

    // The failure surfaces as an inline error, and the success state never
    // appears.
    await expect(page.getByTestId("quiz-save-error")).toBeVisible();
    await expect(page.getByTestId("quiz-save-success")).toHaveCount(0);

    // No Meta Lead signal, ever — give any fire-and-forget call a beat to
    // land so this isn't a false negative.
    await page.waitForTimeout(500);
    expect(await leadPixelParams(page)).toEqual([]);

    // The internal submitted event must also stay silent on failure.
    expect(
      analyticsPayloads.some((p) => p.event === "quiz_save_submitted"),
    ).toBe(false);
  });
});
