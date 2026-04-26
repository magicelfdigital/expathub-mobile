import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { trackLockedSectionViewed } from "@/lib/pixel";

type Props = {
  title: string;
  sectionKey: string;
  countrySlug?: string;
  teaser?: ReactNode;
  children: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  /** When true, the user has Pro access (or sandbox/trial) — render children fully unblurred. */
  userHasAccess?: boolean;
  /** When true, the section is gated as Premium content (default true). Set false to render unconditionally. */
  isPremium?: boolean;
  /** Headline shown inside the lock overlay (defaults to "Unlock {title}"). */
  lockedHeadline?: string;
  /** 4–5 bullet points shown inside the lock overlay describing what's gated. */
  lockedBullets?: string[];
};

export default function LockedSection({
  title,
  sectionKey,
  countrySlug,
  teaser,
  children,
  ctaHref = "/pricing",
  ctaLabel = "Start 14-day free trial",
  userHasAccess = false,
  isPremium = true,
  lockedHeadline,
  lockedBullets,
}: Props) {
  const firedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const locked = isPremium && !userHasAccess;

  useEffect(() => {
    if (!locked || firedRef.current) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      firedRef.current = true;
      trackLockedSectionViewed({
        section: sectionKey,
        country: countrySlug ?? "none",
      });
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            trackLockedSectionViewed({
              section: sectionKey,
              country: countrySlug ?? "none",
            });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sectionKey, countrySlug, locked]);

  if (!locked) {
    return (
      <section
        data-testid={`locked-section-${sectionKey}`}
        data-state="unlocked"
        className="card p-6"
      >
        <h3 className="font-display text-2xl">{title}</h3>
        {teaser ? (
          <div className="mt-3 text-sm text-[var(--color-ink-muted)]">{teaser}</div>
        ) : null}
        <div className="mt-4">{children}</div>
      </section>
    );
  }

  const overlayHeadline = lockedHeadline ?? `Unlock ${title}`;
  const bullets =
    lockedBullets && lockedBullets.length > 0
      ? lockedBullets
      : [
          "Concrete numbers, not generalities",
          "Step-by-step process with timelines",
          "Common pitfalls and how to avoid them",
          "Direct links to the official sources",
        ];

  return (
    <section
      ref={containerRef}
      data-testid={`locked-section-${sectionKey}`}
      data-state="locked"
      className="card relative overflow-hidden p-6"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display text-2xl">{title}</h3>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--color-ink-muted)]/30 px-2 py-0.5 text-xs uppercase tracking-wider text-[var(--color-ink-muted)]"
          aria-label="Pro section"
        >
          <span aria-hidden="true">🔒</span> Pro
        </span>
      </div>

      {teaser ? (
        <div className="mt-3 text-sm text-[var(--color-ink-muted)]">
          {teaser}
        </div>
      ) : null}

      {/* First ~80px of the real content shows as a free preview, then a
          gradient masks the rest and the locked-content overlay takes over. */}
      <div
        data-testid={`locked-preview-${sectionKey}`}
        className="relative mt-4 max-h-[80px] overflow-hidden text-sm leading-relaxed"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
        }}
      >
        {children}
      </div>

      <div
        data-testid={`locked-overlay-${sectionKey}`}
        className="mt-4 rounded-xl border border-[var(--color-gold)]/40 bg-[var(--color-paper)] p-5"
      >
        <p className="font-display text-lg leading-snug text-[var(--color-ink)]">
          {overlayHeadline}
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--color-ink)]">
          {bullets.slice(0, 5).map((b, idx) => (
            <li key={idx} className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--color-gold)]">
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Link
            to={ctaHref}
            data-testid={`locked-cta-${sectionKey}`}
            className="btn-primary"
            onClick={() => {
              try {
                trackLockedSectionViewed({
                  section: sectionKey,
                  country: countrySlug ?? "none",
                  cta_clicked: 1,
                });
              } catch {}
            }}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
