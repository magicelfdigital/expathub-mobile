import { useState } from "react";
import { webApiClient } from "@/lib/api";
import { trackAddToCart, trackInitiateCheckout, trackStartTrial } from "@/lib/pixel";
import { useAbVariants } from "@/hooks/useAbVariants";

const MONTHLY_PRICE_USD = 14.99;

type Plan = "monthly" | "annual";

export default function Pricing() {
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { variants, isLoading } = useAbVariants();

  // ── Variant-driven copy & price ──────────────────────────────────────
  // Annual price toggles between the $89 control and the $99 treatment.
  const annualPrice = variants.annual.priceUsd;
  const monthlyHeroLine = `14-day free trial, then $${MONTHLY_PRICE_USD}/month.`;
  const monthlyCta = "Start 14-day free trial";
  const annualCta = "Start 14-day free trial";
  const headerSubtitle =
    "Two plans, both with a 14-day free trial. Cancel anytime — you won't be charged until the trial ends.";

  async function startCheckout(plan: Plan) {
    if (busy) return;
    setError(null);
    setBusy(plan);

    try {
      const variantProps = {
        annual_variant: variants.annual.variant,
        session_id: variants.sessionId,
      };
      // Mid-funnel Meta signal — fires on plan tap, before the Stripe
      // Checkout redirect. Pairs with `AddToCart` on the mobile paywall so
      // App Promotion campaigns get the same intent step across surfaces.
      trackAddToCart({
        plan,
        source: "web_pricing",
        ...variantProps,
      });
      if (plan === "annual") {
        trackStartTrial({
          value: 0,
          currency: "USD",
          plan: "annual",
          source: "web_pricing",
          ...variantProps,
        });
      } else {
        trackInitiateCheckout({
          funnel: "monthly_subscription",
          source: "web_pricing",
          ...variantProps,
        });
      }

      const { url } = await webApiClient.stripe.checkout(plan);
      if (url) {
        window.location.href = url;
      } else {
        setError("Couldn't start checkout. Please try again.");
      }
    } catch (e: any) {
      const status = e?.status;
      if (status === 503) {
        setError("Web checkout is being set up. In the meantime, please subscribe inside the ExpatHub mobile app.");
      } else {
        setError(e?.message ?? "Couldn't start checkout. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      data-testid="page-pricing"
      data-annual-variant={variants.annual.variant}
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Pricing</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        {headerSubtitle}
      </p>

      {error ? (
        <div
          className="mt-6 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--color-gold)", background: "var(--color-gold-soft, #FFF6E5)", color: "var(--color-ink)" }}
          data-testid="pricing-error"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div
          className="card relative p-6"
          style={{ borderColor: "var(--color-teal, var(--color-primary))", borderWidth: 2 }}
          data-testid="card-plan-annual"
        >
          <div
            className="absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
            style={{ background: "var(--color-teal, var(--color-primary))", color: "white" }}
          >
            {variants.annual.variant === "annual_99" ? "Best value" : "Save 50% · Best value"}
          </div>
          <div
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-teal, var(--color-primary))" }}
          >
            Annual Pathfinder
          </div>
          <div
            data-testid="pricing-annual-amount"
            className="mt-2 font-display text-4xl"
          >
            ${annualPrice}/yr
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            14-day free trial, then ${annualPrice}/year.
          </p>
          <ul className="mt-4 space-y-1 text-sm text-[var(--color-ink)]">
            <li>• Full Decision Briefs for all 11 launch countries</li>
            <li>• Relocation planner with country checklists</li>
            <li>• Compare matrix, vendor directory, saved resources</li>
            <li>• Save vs monthly</li>
          </ul>
          <button
            type="button"
            onClick={() => startCheckout("annual")}
            disabled={busy !== null || isLoading}
            className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--color-teal, var(--color-primary))", color: "white" }}
            data-testid="button-start-trial"
          >
            {busy === "annual" ? "Starting…" : annualCta}
          </button>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Cancel anytime before day 14 — you won't be charged.
          </p>
        </div>

        <div className="card p-6" data-testid="card-plan-monthly">
          <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Monthly Explorer
          </div>
          <div
            data-testid="pricing-monthly-amount"
            className="mt-2 font-display text-4xl"
          >
            ${MONTHLY_PRICE_USD}/mo
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {monthlyHeroLine}
          </p>
          <ul className="mt-4 space-y-1 text-sm text-[var(--color-ink)]">
            <li>• Full Decision Briefs for all 11 launch countries</li>
            <li>• Relocation planner with country checklists</li>
            <li>• Compare matrix, vendor directory, saved resources</li>
          </ul>
          <button
            type="button"
            onClick={() => startCheckout("monthly")}
            disabled={busy !== null || isLoading}
            className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--color-ink)", color: "white" }}
            data-testid="button-subscribe-monthly"
          >
            {busy === "monthly" ? "Starting…" : monthlyCta}
          </button>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Cancel anytime before day 14 — you won't be charged.
          </p>
        </div>
      </div>

      <div
        className="mt-8 flex items-baseline justify-between gap-3 border-t pt-5"
        style={{ borderColor: "var(--color-border, #E5E5E5)" }}
        data-testid="row-plan-free"
      >
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Free
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Country overviews, readiness quiz, basic shortlist — no card required.
          </p>
        </div>
        <div className="font-display text-2xl text-[var(--color-ink-muted)]">$0</div>
      </div>
    </section>
  );
}
