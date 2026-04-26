export default function Start() {
  return (
    <section
      data-testid="page-start"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Take the readiness quiz</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        The web quiz funnel will land in a follow-up task. For now, this is the
        placeholder mount point — wire your campaign links to <code>/start</code>
        with confidence.
      </p>
    </section>
  );
}
