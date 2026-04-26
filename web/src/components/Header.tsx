import { Link, NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/pricing", label: "Pricing" },
  { to: "/start", label: "Take the quiz" },
  { to: "/account", label: "Account" },
];

export default function Header() {
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur"
    >
      <div className="container-page flex items-center justify-between py-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-xl font-semibold text-[var(--color-navy)]"
          data-testid="site-logo"
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: "var(--color-primary)" }}
          >
            E
          </span>
          ExpatHub
        </Link>
        <nav className="hidden gap-6 sm:flex" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`nav-link-${item.to.replace(/\//g, "") || "home"}`}
              className={({ isActive }) =>
                `text-sm font-medium transition ${
                  isActive
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-navy)]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/pricing"
          className="btn btn-primary hidden sm:inline-flex"
          data-testid="header-cta"
        >
          Get Pro
        </Link>
      </div>
    </header>
  );
}
