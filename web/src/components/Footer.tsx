import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-[var(--color-border)] bg-[var(--color-cream)]"
    >
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <div className="font-display text-lg font-semibold text-[var(--color-navy)]">
            ExpatHub
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            ExpatHub is built by Magic Elf Digital. Educational content only —
            not legal, tax, or immigration advice.
          </p>
        </div>
        <nav
          className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3"
          aria-label="Footer"
        >
          <Link to="/pricing" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Pricing
          </Link>
          <Link to="/start" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Quiz
          </Link>
          <Link to="/account" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Account
          </Link>
          <Link to="/privacy" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Privacy
          </Link>
          <Link to="/terms" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Terms
          </Link>
          <Link to="/data-delete" className="text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]">
            Data deletion
          </Link>
        </nav>
      </div>
      <div className="border-t border-[var(--color-border)]/60 py-4 text-center text-xs text-[var(--color-ink-muted)]">
        &copy; {new Date().getFullYear()} Magic Elf Digital. All rights reserved.
      </div>
    </footer>
  );
}
