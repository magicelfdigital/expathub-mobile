import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@/hooks/useUser";
import { trackSubscribe } from "@/lib/pixel";

export default function Account() {
  const { user, isLoading } = useUser();
  const [params, setParams] = useSearchParams();
  const firedRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

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

  async function openStripePortal() {
    setOpening(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("portal_request_failed");
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!data?.url) throw new Error("no_portal_url");
      window.location.href = data.url;
    } catch {
      setPortalError("We couldn't open the billing portal. Please try again shortly.");
    } finally {
      setOpening(false);
    }
  }

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
            onClick={openStripePortal}
            disabled={opening}
            className="mt-4 text-sm text-[var(--color-ink-muted)] underline disabled:opacity-50"
            data-testid="manage-subscription-btn"
          >
            {opening ? "Opening billing portal…" : "Manage or cancel subscription"}
          </button>
        ) : null}
        {portalError ? (
          <div className="mt-3 text-sm text-[var(--color-ink-muted)]">
            {portalError}
          </div>
        ) : null}
      </div>
    </section>
  );
}
