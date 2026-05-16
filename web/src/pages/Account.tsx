import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@/hooks/useUser";
import { trackSubscribe } from "@/lib/pixel";
import CancellationFlow from "@/components/CancellationFlow";

export default function Account() {
  const { user, isLoading } = useUser();
  const [params, setParams] = useSearchParams();
  const firedRef = useRef(false);
  const [showCancel, setShowCancel] = useState(false);

  // The Stripe customer id is *not* read on the client anymore — the server
  // derives it from the authenticated session when opening the billing
  // portal (see /api/stripe/portal). Only the subscription id is needed
  // here to look up the exit-offer eligibility.
  const userAny = user as
    | (typeof user & { stripeSubscriptionId?: string })
    | null;
  const subscriptionId = userAny?.stripeSubscriptionId ?? "";

  useEffect(() => {
    if (firedRef.current) return;
    if (params.get("subscribed") !== "true") return;
    firedRef.current = true;

    const plan = params.get("plan") ?? "unknown";
    const valueStr = params.get("value");
    const value = valueStr ? Number(valueStr) : 0;
    const annualVariant = params.get("av");

    trackSubscribe({
      value: Number.isFinite(value) ? value : 0,
      currency: params.get("currency") ?? "USD",
      plan,
      source: "web_checkout_success",
      ...(annualVariant ? { annual_variant: annualVariant } : {}),
    });

    // Server-side conversion record for the A/B reporting dashboard. The
    // server reads the eh_sid cookie + DB assignment to attribute this to
    // the right variant — we just hand it the plan + revenue.
    void fetch("/api/ab/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        plan,
        revenue: Number.isFinite(value) ? value : 0,
      }),
    }).catch(() => {});

    const next = new URLSearchParams(params);
    next.delete("subscribed");
    next.delete("plan");
    next.delete("value");
    next.delete("currency");
    next.delete("sid");
    next.delete("av");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <section
      data-testid="page-account"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Account</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        Web account UI — sign-in, manage subscription, request a refund —
        arrives with later tasks. This page reads the session via the shared
        <code className="mx-1">useUser</code> hook so other tasks can build on it.
      </p>
      <div
        className="card mt-6 max-w-md p-6"
        data-testid="account-status"
      >
        <div className="text-sm uppercase tracking-wider text-[var(--color-ink-muted)]">
          Session
        </div>
        <div className="mt-2 font-display text-2xl">
          {isLoading ? "Checking…" : user ? user.email ?? "Signed in" : "Anonymous"}
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="mt-4 text-sm text-[var(--color-ink-muted)] underline"
            data-testid="manage-subscription-btn"
          >
            Manage or cancel subscription
          </button>
        ) : null}
      </div>

      <CancellationFlow
        open={showCancel}
        subscriptionId={subscriptionId || undefined}
        onClose={() => setShowCancel(false)}
      />
    </section>
  );
}
