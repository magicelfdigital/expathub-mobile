/**
 * Pure predicates and orchestration helpers for the v1.4 conversion lifts.
 *
 * Both the predicates and the orchestration helpers below are imported
 * directly by the components that ship the conversion-lift UX
 * (`ProPaywall`, `CancellationModal`). The same function the production
 * code path calls is the same function the unit tests call — no
 * "simulated" behaviour, no parallel implementation in tests.
 */

export type ReverseTrialState = {
  /** True when the user already has Pro (sub or sandbox) — never grant. */
  hasFullAccess: boolean;
  /** True when a reverse trial is currently within its 48h window. */
  reverseTrialActive: boolean;
  /** True when this user has already burned their one-shot reverse trial. */
  reverseTrialUsed: boolean;
};

/**
 * Mobile ProPaywall — whether dismissing the paywall should grant the
 * 48h reverse trial. Mirrors the gate in
 * `src/components/ProPaywall.tsx::handleClose`.
 */
export function shouldGrantReverseTrialOnDismiss(
  state: ReverseTrialState,
): boolean {
  if (state.hasFullAccess) return false;
  if (state.reverseTrialActive) return false;
  if (state.reverseTrialUsed) return false;
  return true;
}

export type CancellationStep = "exit_offer" | "before_you_go";

export type ExitOfferEligibility = {
  /** Backend eligibility check result; `null`/`undefined` ⇒ not eligible. */
  eligible?: boolean | null;
};

/**
 * Mobile CancellationModal — which step the modal should open on. When
 * the user is eligible for the 50% × 3 months exit offer, we open on
 * `exit_offer`; otherwise we go straight to `before_you_go`.
 */
export function getInitialCancellationStep(
  exitOffer?: ExitOfferEligibility | null,
): CancellationStep {
  return exitOffer?.eligible ? "exit_offer" : "before_you_go";
}

export type ToastBusPayload = {
  message: string;
  variant?: "success" | "info";
  durationMs?: number;
};

export type ApplyReverseTrialDeps = {
  state: ReverseTrialState;
  startReverseTrial: () => Promise<unknown>;
  showToast: (payload: ToastBusPayload) => void;
  /** Optional logger so callers can wire console.log without rebuilding the side-effect. */
  onError?: (err: unknown) => void;
};

/**
 * Mobile ProPaywall handler — applies the reverse-trial side effect on
 * paywall dismiss. Used by `ProPaywall.handleClose` so the component
 * does not duplicate this orchestration. Returns `true` when the trial
 * was granted, `false` when the gate skipped the grant.
 */
export async function applyReverseTrialOnDismiss(
  deps: ApplyReverseTrialDeps,
): Promise<boolean> {
  if (!shouldGrantReverseTrialOnDismiss(deps.state)) return false;
  try {
    await deps.startReverseTrial();
    deps.showToast({
      message: "Enjoy 48 hours of full access — on us.",
      variant: "success",
      durationMs: 3200,
    });
    return true;
  } catch (err) {
    deps.onError?.(err);
    return false;
  }
}

export type ExitOfferAction = "shown" | "accept" | "decline";

/**
 * Property bag shape compatible with `src/lib/analytics.ts::trackEvent`
 * — the production analytics dispatcher only accepts JSON-scalar values,
 * so this helper uses the same shape rather than `Record<string, unknown>`.
 */
export type ExitOfferAnalyticsProps = Record<
  string,
  string | number | boolean | undefined
>;

export type ExitOfferAnalyticsDeps = {
  subscriptionId: string | null | undefined;
  trackEvent: (
    name:
      | "exit_offer_shown"
      | "exit_offer_accepted"
      | "exit_offer_declined",
    properties: ExitOfferAnalyticsProps,
  ) => void;
};

/**
 * Mobile CancellationModal — emits the analytics event for an exit-offer
 * step transition with the canonical payload shape. Both
 * `CancellationModal` and the unit harness call this directly.
 */
export function trackExitOfferAction(
  action: ExitOfferAction,
  deps: ExitOfferAnalyticsDeps,
): void {
  const eventName =
    action === "shown"
      ? "exit_offer_shown"
      : action === "accept"
      ? "exit_offer_accepted"
      : "exit_offer_declined";
  deps.trackEvent(eventName, {
    surface: "mobile_cancellation_modal",
    subscriptionId: deps.subscriptionId ?? "none",
  });
}
