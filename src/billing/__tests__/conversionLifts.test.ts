/**
 * Mobile-side coverage for the v1.4 conversion lifts.
 *
 * The components that ship the UX (`ProPaywall`, `CancellationModal`)
 * delegate every conversion-lift decision and side effect to the
 * exported helpers in `src/lib/conversionLifts.ts`:
 *
 *   - `shouldGrantReverseTrialOnDismiss` — pure predicate
 *   - `getInitialCancellationStep`        — pure predicate
 *   - `applyReverseTrialOnDismiss`        — orchestration helper called
 *     directly by `ProPaywall.handleClose`
 *   - `trackExitOfferAction`              — analytics helper called
 *     directly by `CancellationModal` for shown/accept/decline
 *
 * The tests below import those same exports — so a regression in the
 * gate, the orchestration ordering, or the analytics payload shape
 * fails this suite without us needing to mount the full RN component
 * tree. The components hold no duplicated copy of the logic.
 */

import {
  applyReverseTrialOnDismiss,
  getInitialCancellationStep,
  shouldGrantReverseTrialOnDismiss,
  trackExitOfferAction,
} from "../../lib/conversionLifts";

describe("shouldGrantReverseTrialOnDismiss (mobile ProPaywall predicate)", () => {
  it("grants the trial on first dismiss for a non-paying user", () => {
    expect(
      shouldGrantReverseTrialOnDismiss({
        hasFullAccess: false,
        reverseTrialActive: false,
        reverseTrialUsed: false,
      }),
    ).toBe(true);
  });

  it("does NOT grant when the user already has full Pro access", () => {
    expect(
      shouldGrantReverseTrialOnDismiss({
        hasFullAccess: true,
        reverseTrialActive: false,
        reverseTrialUsed: false,
      }),
    ).toBe(false);
  });

  it("does NOT grant while a reverse trial is currently active", () => {
    expect(
      shouldGrantReverseTrialOnDismiss({
        hasFullAccess: false,
        reverseTrialActive: true,
        reverseTrialUsed: true,
      }),
    ).toBe(false);
  });

  it("does NOT grant a second trial after the first has been used", () => {
    expect(
      shouldGrantReverseTrialOnDismiss({
        hasFullAccess: false,
        reverseTrialActive: false,
        reverseTrialUsed: true,
      }),
    ).toBe(false);
  });
});

describe("getInitialCancellationStep (mobile CancellationModal predicate)", () => {
  it("opens on the exit-offer step when the user is eligible", () => {
    expect(getInitialCancellationStep({ eligible: true })).toBe("exit_offer");
  });

  it("skips straight to before_you_go when not eligible", () => {
    expect(getInitialCancellationStep({ eligible: false })).toBe(
      "before_you_go",
    );
  });

  it("treats a null exit-offer config as not eligible", () => {
    expect(getInitialCancellationStep(null)).toBe("before_you_go");
  });

  it("treats an undefined exit-offer config as not eligible", () => {
    expect(getInitialCancellationStep(undefined)).toBe("before_you_go");
  });

  it("treats null eligibility as not eligible", () => {
    expect(getInitialCancellationStep({ eligible: null })).toBe(
      "before_you_go",
    );
  });
});

describe("applyReverseTrialOnDismiss (the function ProPaywall calls)", () => {
  it("grants the trial AND surfaces a toast on first dismiss", async () => {
    const startReverseTrial = jest
      .fn<Promise<{ ok: boolean; expiresAt: number }>, []>()
      .mockResolvedValue({ ok: true, expiresAt: Date.now() + 1 });
    const showToast = jest.fn();

    const granted = await applyReverseTrialOnDismiss({
      state: {
        hasFullAccess: false,
        reverseTrialActive: false,
        reverseTrialUsed: false,
      },
      startReverseTrial,
      showToast,
    });

    expect(granted).toBe(true);
    expect(startReverseTrial).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);

    // The toast call ordering matters — the trial must be granted
    // *before* the toast appears so the entitlement is live by the
    // time the user notices the confirmation.
    const startOrder = startReverseTrial.mock.invocationCallOrder[0];
    const toastOrder = showToast.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(toastOrder);

    const payload = showToast.mock.calls[0][0];
    expect(payload.message).toBe("Enjoy 48 hours of full access — on us.");
    expect(payload.variant).toBe("success");
    expect(payload.durationMs).toBe(3200);
  });

  it("does NOT grant or toast for paying users", async () => {
    const startReverseTrial = jest.fn();
    const showToast = jest.fn();

    const granted = await applyReverseTrialOnDismiss({
      state: {
        hasFullAccess: true,
        reverseTrialActive: false,
        reverseTrialUsed: false,
      },
      startReverseTrial,
      showToast,
    });

    expect(granted).toBe(false);
    expect(startReverseTrial).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does NOT regrant on the second dismiss after the trial was used", async () => {
    const startReverseTrial = jest.fn();
    const showToast = jest.fn();

    const granted = await applyReverseTrialOnDismiss({
      state: {
        hasFullAccess: false,
        reverseTrialActive: false,
        reverseTrialUsed: true,
      },
      startReverseTrial,
      showToast,
    });

    expect(granted).toBe(false);
    expect(startReverseTrial).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does NOT grant while a reverse trial is currently active", async () => {
    const startReverseTrial = jest.fn();
    const showToast = jest.fn();

    const granted = await applyReverseTrialOnDismiss({
      state: {
        hasFullAccess: false,
        reverseTrialActive: true,
        reverseTrialUsed: true,
      },
      startReverseTrial,
      showToast,
    });

    expect(granted).toBe(false);
    expect(startReverseTrial).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("swallows startReverseTrial errors without throwing and does NOT toast on failure", async () => {
    const startReverseTrial = jest
      .fn<Promise<unknown>, []>()
      .mockRejectedValue(new Error("rc unavailable"));
    const showToast = jest.fn();
    const onError = jest.fn();

    const granted = await applyReverseTrialOnDismiss({
      state: {
        hasFullAccess: false,
        reverseTrialActive: false,
        reverseTrialUsed: false,
      },
      startReverseTrial,
      showToast,
      onError,
    });

    expect(granted).toBe(false);
    expect(startReverseTrial).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const errArg = onError.mock.calls[0][0] as Error;
    expect(errArg.message).toBe("rc unavailable");
  });
});

describe("trackExitOfferAction (the function CancellationModal calls)", () => {
  type TrackEventDep = Parameters<typeof trackExitOfferAction>[1]["trackEvent"];
  function makeTrackEvent(): jest.MockedFunction<TrackEventDep> {
    return jest.fn() as unknown as jest.MockedFunction<TrackEventDep>;
  }

  it("emits exit_offer_shown with the canonical mobile payload", () => {
    const trackEvent = makeTrackEvent();
    trackExitOfferAction("shown", {
      subscriptionId: "sub_xyz",
      trackEvent,
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("exit_offer_shown", {
      surface: "mobile_cancellation_modal",
      subscriptionId: "sub_xyz",
    });
  });

  it("emits exit_offer_accepted on accept", () => {
    const trackEvent = makeTrackEvent();
    trackExitOfferAction("accept", {
      subscriptionId: "sub_xyz",
      trackEvent,
    });
    expect(trackEvent).toHaveBeenCalledWith("exit_offer_accepted", {
      surface: "mobile_cancellation_modal",
      subscriptionId: "sub_xyz",
    });
  });

  it("emits exit_offer_declined on decline", () => {
    const trackEvent = makeTrackEvent();
    trackExitOfferAction("decline", {
      subscriptionId: "sub_xyz",
      trackEvent,
    });
    expect(trackEvent).toHaveBeenCalledWith("exit_offer_declined", {
      surface: "mobile_cancellation_modal",
      subscriptionId: "sub_xyz",
    });
  });

  it("falls back to the 'none' subscriptionId placeholder when missing", () => {
    const trackEvent = makeTrackEvent();
    trackExitOfferAction("shown", {
      subscriptionId: null,
      trackEvent,
    });
    trackExitOfferAction("accept", {
      subscriptionId: undefined,
      trackEvent,
    });
    expect(trackEvent).toHaveBeenNthCalledWith(1, "exit_offer_shown", {
      surface: "mobile_cancellation_modal",
      subscriptionId: "none",
    });
    expect(trackEvent).toHaveBeenNthCalledWith(2, "exit_offer_accepted", {
      surface: "mobile_cancellation_modal",
      subscriptionId: "none",
    });
  });
});
