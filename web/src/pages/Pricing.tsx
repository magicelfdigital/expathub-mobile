export default function Pricing() {
  return (
    <section
      data-testid="page-pricing"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Pricing</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        Pricing details, free-trial flow, and Stripe Checkout will land in a
        follow-up task. This page is the placeholder mount point.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Free
          </div>
          <div className="mt-2 font-display text-3xl">$0</div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Country overviews, readiness quiz, basic shortlist.
          </p>
        </div>
        <div className="card p-6" style={{ borderColor: "var(--color-primary)" }}>
          <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-primary)" }}>
            Pro
          </div>
          <div className="mt-2 font-display text-3xl">Coming soon</div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Full guides, planner, vendor directory, compare matrix.
          </p>
        </div>
      </div>
    </section>
  );
}
