import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section
      data-testid="page-not-found"
      className="container-page py-16 sm:py-24 text-center"
    >
      <div className="mx-auto max-w-md">
        <div
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-primary)" }}
        >
          404
        </div>
        <h1 className="mt-2 font-display text-4xl">Page not found</h1>
        <p className="mt-3 text-[var(--color-ink-muted)]">
          The page you're looking for has moved or never existed.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          Back to home
        </Link>
      </div>
    </section>
  );
}
