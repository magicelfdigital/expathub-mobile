import { useNavigate } from "react-router-dom";
import { trackInitiateCheckout, trackStartTrial } from "@/lib/pixel";

const ANNUAL_PRICE_USD = 89;
const MONTHLY_PRICE_USD = 14.99;

export default function Pricing() {
  const navigate = useNavigate();

  function handleStartTrial() {
    trackStartTrial({ value: 0, currency: "USD", plan: "annual", source: "web_pricing" });
    navigate("/start");
  }

  function handleSubscribeMonthly() {
    trackInitiateCheckout({ funnel: "monthly_subscription", source: "web_pricing" });
    navigate("/account?intent=subscribe&plan=monthly");
  }

  return (
    <section
      data-testid="page-pricing"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Pricing</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        Stripe Checkout lands with a follow-up task. The CTAs below capture
        intent now so we can warm up Meta retargeting audiences.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-6" data-testid="card-plan-free">
          <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Free
          </div>
          <div className="mt-2 font-display text-3xl">$0</div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Country overviews, readiness quiz, basic shortlist.
          </p>
        </div>
        <div className="card p-6" data-testid="card-plan-monthly">
          <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Monthly Explorer
          </div>
          <div className="mt-2 font-display text-3xl">${MONTHLY_PRICE_USD}/mo</div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Full guides, planner, vendor directory, compare matrix.
          </p>
          <button
            type="button"
            onClick={handleSubscribeMonthly}
            className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--color-ink)", color: "white" }}
            data-testid="button-subscribe-monthly"
          >
            Subscribe monthly
          </button>
        </div>
        <div
          className="card p-6"
          style={{ borderColor: "var(--color-primary)" }}
          data-testid="card-plan-annual"
        >
          <div
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-primary)" }}
          >
            Annual Pathfinder
          </div>
          <div className="mt-2 font-display text-3xl">${ANNUAL_PRICE_USD}/yr</div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            14-day free trial. Everything in Monthly Explorer, save ~50%.
          </p>
          <button
            type="button"
            onClick={handleStartTrial}
            className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--color-primary)", color: "white" }}
            data-testid="button-start-trial"
          >
            Start 14-day free trial
          </button>
        </div>
      </div>
    </section>
  );
}
