import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@/hooks/useUser";
import { trackSubscribe } from "@/lib/pixel";

export default function Account() {
  const { user, isLoading } = useUser();
  const [params, setParams] = useSearchParams();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (params.get("subscribed") !== "true") return;
    firedRef.current = true;

    const plan = params.get("plan") ?? "unknown";
    const valueStr = params.get("value");
    const value = valueStr ? Number(valueStr) : 0;

    trackSubscribe({
      value: Number.isFinite(value) ? value : 0,
      currency: params.get("currency") ?? "USD",
      plan,
      source: "web_checkout_success",
    });

    const next = new URLSearchParams(params);
    next.delete("subscribed");
    next.delete("plan");
    next.delete("value");
    next.delete("currency");
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
      </div>
    </section>
  );
}
