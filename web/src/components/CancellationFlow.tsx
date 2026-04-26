import { useEffect, useState } from "react";
import { webApiClient } from "@/lib/api";
import {
  trackExitOfferShown,
  trackExitOfferAccepted,
  trackExitOfferDeclined,
} from "@/lib/pixel";

type Props = {
  open: boolean;
  subscriptionId?: string;
  onClose: () => void;
};

type Stage = "loading" | "offer" | "confirm" | "accepted" | "error";

export default function CancellationFlow({
  open,
  subscriptionId,
  onClose,
}: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!subscriptionId) {
      setStage("confirm");
      return;
    }
    let cancelled = false;
    setStage("loading");
    webApiClient
      .get<{ eligible: boolean; alreadyShown: boolean }>(
        `/api/subscription/exit-offer/eligibility?subscriptionId=${encodeURIComponent(subscriptionId)}`,
      )
      .then((r) => {
        if (cancelled) return;
        if (r?.eligible) {
          setStage("offer");
          trackExitOfferShown({ subscriptionId, source: "web_cancel" });
          // best-effort 'shown' record
          webApiClient
            .post("/api/subscription/exit-offer", {
              subscriptionId,
              action: "shown",
            })
            .catch(() => {});
        } else {
          setStage("confirm");
        }
      })
      .catch(() => {
        if (!cancelled) setStage("confirm");
      });
    return () => {
      cancelled = true;
    };
  }, [open, subscriptionId]);

  if (!open) return null;

  // Open the Stripe billing portal. The server derives the Stripe customer id
  // from the authenticated session — the client never sends one.
  async function goToPortal() {
    setWorking(true);
    try {
      const r = await webApiClient.stripe.portal();
      if (r?.url) {
        window.location.href = r.url;
        return;
      }
      setErrorMsg("Could not open the billing portal.");
      setStage("error");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not open the billing portal.");
      setStage("error");
    } finally {
      setWorking(false);
    }
  }

  async function acceptOffer() {
    if (!subscriptionId) return;
    setWorking(true);
    setErrorMsg(null);
    try {
      await webApiClient.post("/api/subscription/exit-offer", {
        subscriptionId,
        action: "accept",
      });
      trackExitOfferAccepted({ subscriptionId });
      setStage("accepted");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not apply the offer. Please try again.");
      setStage("error");
    } finally {
      setWorking(false);
    }
  }

  // Per the conversion-lift spec, the secondary CTA on the offer card
  // ("No thanks, continue to cancel") records the decline and immediately
  // sends the user into the Stripe billing portal — not into an
  // intermediate confirmation step.
  async function declineOffer() {
    if (subscriptionId) {
      try {
        await webApiClient.post("/api/subscription/exit-offer", {
          subscriptionId,
          action: "decline",
        });
      } catch {}
      trackExitOfferDeclined({ subscriptionId });
    }
    await goToPortal();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="cancellation-flow"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
    >
      <div className="card w-full max-w-md p-6">
        {stage === "loading" ? (
          <div data-testid="cancel-loading">
            <h2 className="font-display text-2xl">One moment…</h2>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Checking your subscription details.
            </p>
          </div>
        ) : null}

        {stage === "offer" ? (
          <div data-testid="cancel-offer">
            <h2 className="font-display text-2xl">Wait — 50% off your next 3 months?</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              We get it. Before you cancel, here's a one-time offer: keep ExpatHub
              Pro at <strong>50% off</strong> for the next three billing periods.
              Cancel anytime.
            </p>
            <ul className="mt-4 space-y-1 text-sm">
              <li>✓ Keep your saved countries and notes</li>
              <li>✓ Keep all comparison and Decision Brief access</li>
              <li>✓ Discount applies automatically — no code needed</li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={acceptOffer}
                disabled={working}
                data-testid="cancel-offer-accept"
              >
                {working ? "Applying…" : "Yes, keep me at 50% off"}
              </button>
              <button
                type="button"
                className="text-sm text-[var(--color-ink-muted)] underline"
                onClick={declineOffer}
                disabled={working}
                data-testid="cancel-offer-decline"
              >
                {working ? "Opening…" : "No thanks, continue to cancel"}
              </button>
            </div>
          </div>
        ) : null}

        {stage === "accepted" ? (
          <div data-testid="cancel-offer-success">
            <h2 className="font-display text-2xl">You're all set 🎉</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              The 50% discount has been applied to your next three billing
              periods. Nothing else for you to do.
            </p>
            <button type="button" className="btn-primary mt-6 w-full" onClick={onClose}>
              Back to my account
            </button>
          </div>
        ) : null}

        {stage === "confirm" ? (
          <div data-testid="cancel-confirm">
            <h2 className="font-display text-2xl">Cancel my subscription</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              You'll keep access until the end of your current billing period.
              Manage and confirm cancellation in the secure billing portal.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={goToPortal}
                disabled={working}
                data-testid="cancel-confirm-portal"
              >
                {working ? "Opening…" : "Open billing portal"}
              </button>
              <button
                type="button"
                className="text-sm text-[var(--color-ink-muted)] underline"
                onClick={onClose}
              >
                Never mind
              </button>
            </div>
          </div>
        ) : null}

        {stage === "error" ? (
          <div data-testid="cancel-error">
            <h2 className="font-display text-2xl">Hmm, something went wrong</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              {errorMsg ?? "Please try again, or contact support."}
            </p>
            <button type="button" className="btn-primary mt-6 w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
