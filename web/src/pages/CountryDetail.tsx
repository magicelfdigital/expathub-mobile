import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import LockedSection from "@/components/LockedSection";
import { useUser, userHasProAccess } from "@/hooks/useUser";

type CountryFact = {
  name: string;
  flag: string;
  region: string;
  popular?: boolean;
  matchScore: number;
  brief: string;
  highlights: [string, string, string];
};

const COUNTRY_FACTS: Record<string, CountryFact> = {
  spain: {
    name: "Spain",
    flag: "🇪🇸",
    region: "Europe",
    popular: true,
    matchScore: 92,
    brief:
      "Spain rewards remote workers and retirees, but the digital nomad visa, NIE timing, and autonomo tax brackets quietly trip up most newcomers in the first 90 days.",
    highlights: [
      "Digital Nomad Visa offers a 24% flat tax for up to 5 years for qualifying remote workers.",
      "Public healthcare (Seguridad Social) is excellent once enrolled — but private cover is required for the first year on most visas.",
      "Coastal cities (Valencia, Málaga) cost 35–45% less than Madrid or Barcelona for the same lifestyle.",
    ],
  },
  portugal: {
    name: "Portugal",
    flag: "🇵🇹",
    region: "Europe",
    popular: true,
    matchScore: 90,
    brief:
      "Portugal still tops most lists, but the D7, D8 (digital nomad), and HQA visas now route applicants through very different timelines and tax outcomes.",
    highlights: [
      "D8 Digital Nomad Visa requires ~€3,480/mo in remote income and grants a 5-year path to permanent residency.",
      "NHR 2.0 (the IFICI regime) replaced the old NHR — eligibility is now narrower and tied to qualifying scientific/tech roles.",
      "Lisbon rents have risen ~40% in 3 years; Porto, Braga, and the Silver Coast remain materially cheaper.",
    ],
  },
  mexico: {
    name: "Mexico",
    flag: "🇲🇽",
    region: "North America",
    popular: true,
    matchScore: 86,
    brief:
      "Easy on entry, complicated on residency. The temporary→permanent path, INM appointment delays, and CFE/FM3 timing decide whether your move is smooth or stuck.",
    highlights: [
      "Temporary Resident visa requires ~$4,400/mo income or ~$73,000 in savings (figures move with UMA).",
      "INM consular appointments in the US can take 3–6 months — start the visa abroad, not in-country.",
      "CDMX, Guadalajara, and Mérida have the deepest expat infrastructure; Playa/Tulum are short-stay friendly but visa-fragile.",
    ],
  },
  "costa-rica": {
    name: "Costa Rica",
    flag: "🇨🇷",
    region: "Central America",
    popular: true,
    matchScore: 84,
    brief:
      "Pensionado, Rentista, and Inversionista each have different income rules and dependent rights — and CAJA enrollment is non-negotiable once you land.",
    highlights: [
      "Pensionado needs $1,000/mo lifetime pension; Rentista needs $2,500/mo for 2 years (or $60k bank deposit).",
      "CAJA enrollment (~7–11% of declared income) is mandatory and unlocks the public healthcare system.",
      "Central Valley (Atenas, Grecia, Escazú) has the best balance of climate, healthcare, and bilingual infrastructure.",
    ],
  },
  thailand: {
    name: "Thailand",
    flag: "🇹🇭",
    region: "Asia",
    popular: true,
    matchScore: 81,
    brief:
      "DTV, LTR, and Elite visas have wildly different cost/benefit profiles. The wrong choice locks you out of work eligibility for years.",
    highlights: [
      "DTV (Destination Thailand Visa) gives 5-year multi-entry, 180-day stays — but no in-country work for Thai employers.",
      "LTR Visa offers a 17% flat tax on Thai-sourced income and skips the 90-day reporting requirement.",
      "Chiang Mai costs ~40% less than Bangkok with comparable healthcare access for chronic-care residents.",
    ],
  },
  france: {
    name: "France",
    flag: "🇫🇷",
    region: "Europe",
    popular: true,
    matchScore: 79,
    brief:
      "Long-stay visas, OFII validation, prefecture appointments, and the carte de séjour renewal cycle determine whether year two is calm or a scramble.",
    highlights: [
      "VLS-TS Visiteur requires ~€18,500/yr in passive income and explicitly forbids local employment.",
      "Talent Passport (Passeport Talent) is the cleanest route for founders and salaried tech roles — 4-year card, family included.",
      "Outside Paris/Côte d'Azur, monthly costs drop by 30–45% with no loss of healthcare quality.",
    ],
  },
};

const FALLBACK_FACT: CountryFact = {
  name: "this country",
  flag: "🌍",
  region: "—",
  matchScore: 75,
  brief:
    "We're building the full Decision Brief for this country. The free overview shows the basics; Pro unlocks the visa, cost, healthcare, and schools pages.",
  highlights: [
    "Visa pathway and timelines available in the Pro Decision Brief.",
    "City-by-city cost of living and healthcare access available in Pro.",
    "Schools, LGBTQ+ index, and tax implications available in Pro.",
  ],
};

export default function CountryDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const fact = useMemo<CountryFact>(
    () => COUNTRY_FACTS[slug] ?? { ...FALLBACK_FACT, name: slug.replace(/-/g, " ") },
    [slug],
  );
  const { user } = useUser();
  const hasAccess = userHasProAccess(user);

  return (
    <section
      data-testid="page-country-detail"
      className="container-page py-10 sm:py-16"
    >
      <nav className="mb-4 text-sm text-[var(--color-ink-muted)]">
        <Link to="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span>{fact.name}</span>
      </nav>

      <header className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden="true">
          {fact.flag}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-4xl capitalize">{fact.name}</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">{fact.region}</p>
        </div>
      </header>

      <div
        data-testid="country-teaser"
        className="card mt-6 max-w-3xl border-2 border-[var(--color-gold)]/30 bg-[var(--color-paper)] p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div
            data-testid="country-match-score"
            className="inline-flex items-baseline gap-1 rounded-full bg-[var(--color-gold)]/15 px-4 py-1.5 font-display text-[var(--color-ink)]"
          >
            <span className="text-xl font-semibold">{fact.matchScore}</span>
            <span className="text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">
              / 100 match
            </span>
          </div>
          <span className="text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">
            Free preview
          </span>
        </div>

        <p
          data-testid="country-brief"
          className="mt-4 text-base leading-relaxed text-[var(--color-ink)]"
        >
          {fact.brief}
        </p>

        <ul
          data-testid="country-highlights"
          className="mt-5 space-y-3 border-t border-[var(--color-ink-muted)]/15 pt-5"
        >
          {fact.highlights.map((h, idx) => (
            <li
              key={idx}
              className="flex gap-3 text-sm leading-relaxed text-[var(--color-ink)]"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/25 font-display text-[11px] font-semibold text-[var(--color-ink)]"
              >
                {idx + 1}
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      {!hasAccess ? (
        <aside
          data-testid="country-roadmap-unlock"
          className="card mt-10 border-2 border-[var(--color-gold)]/40 bg-[var(--color-paper)] p-6 sm:p-8"
        >
          <h2 className="font-display text-2xl sm:text-3xl">
            Unlock your full {fact.name} roadmap
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm leading-relaxed sm:grid-cols-2">
            <li>• Visa pathway, document checklists, and renewal timing</li>
            <li>• Cost of living for the 4 cities expats actually move to</li>
            <li>• Healthcare access — public enrollment + private premiums</li>
            <li>• LGBTQ+ index and on-the-ground legal protections</li>
            <li>• International + bilingual schools by city with tuition bands</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to="/pricing"
              className="btn-primary"
              data-testid="country-roadmap-cta"
            >
              Start 14-day free trial
            </Link>
            <span className="text-xs text-[var(--color-ink-muted)]">
              No charge for 14 days · Cancel anytime
            </span>
          </div>
        </aside>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LockedSection
          title="Visa pathway"
          sectionKey="visa_pathway"
          countrySlug={slug}
          userHasAccess={hasAccess}
          teaser="Step-by-step routes, document checklists, sponsorship requirements, and which visa quietly closes doors to permanent residency."
          lockedHeadline={`Unlock the full ${fact.name} visa pathway`}
          lockedBullets={[
            "Step-by-step pre-application: tax residency, savings runway, dependents",
            "Consulate filing: every form, apostille, biometric, and fee",
            "In-country activation: NIE/INM/prefecture, address registration",
            "Year-1 renewal triggers and what keeps you compliant",
            "Timeline to PR/citizenship — exclusions and family routes",
          ]}
        >
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>1. Pre-application: tax residency check, savings runway, dependents</li>
            <li>2. Consulate filing: forms, apostilles, biometrics, fees</li>
            <li>3. In-country activation: NIE/INM/prefecture, address registration</li>
            <li>4. Year-1 renewal: what triggers re-review, how to stay compliant</li>
            <li>5. Path to PR/citizenship: timeline, exclusions, family routes</li>
          </ul>
        </LockedSection>

        <LockedSection
          title="Cost of living by city"
          sectionKey="cost_by_city"
          countrySlug={slug}
          userHasAccess={hasAccess}
          teaser="Side-by-side monthly budgets for the 4 cities expats actually move to — rent, utilities, groceries, transport, and healthcare premiums."
          lockedHeadline="See real budgets for the 4 cities expats actually pick"
          lockedBullets={[
            "Median 1-bed rent in each neighborhood (not citywide averages)",
            "Utilities, groceries, and transport baselined to expat lifestyle",
            "Private healthcare premiums by age band",
            "Childcare, schooling, and English-speaking GP access",
            "Total monthly run-rate for a single, couple, or family of four",
          ]}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-ink-muted)]">
                <th className="pb-2">City</th>
                <th className="pb-2">Rent (1BR)</th>
                <th className="pb-2">Total / mo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-ink-muted)]/10">
              <tr><td className="py-2">City A</td><td>$900</td><td>$1,800</td></tr>
              <tr><td className="py-2">City B</td><td>$1,100</td><td>$2,200</td></tr>
              <tr><td className="py-2">City C</td><td>$700</td><td>$1,500</td></tr>
              <tr><td className="py-2">City D</td><td>$1,400</td><td>$2,700</td></tr>
            </tbody>
          </table>
        </LockedSection>

        <LockedSection
          title="LGBTQ+ index & legal protections"
          sectionKey="lgbtq_index"
          countrySlug={slug}
          userHasAccess={hasAccess}
          teaser="Marriage recognition, anti-discrimination law, parental rights, gender marker change, and on-the-ground safety — by region."
          lockedHeadline="Know the law and the on-the-ground reality"
          lockedBullets={[
            "Marriage equality and partnership recognition for foreign-issued unions",
            "Adoption and parental rights for same-sex parents",
            "Anti-discrimination law in employment, housing, and healthcare",
            "Gender marker change: process, documents, and timing",
            "Regional safety differences (capital vs. coast vs. interior)",
          ]}
        >
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>Marriage equality: Yes / partial / no</li>
            <li>Adoption rights: full / restricted</li>
            <li>Anti-discrimination law: employment, housing, healthcare</li>
            <li>Gender marker change: process and timing</li>
            <li>Regional safety differences</li>
          </ul>
        </LockedSection>

        <LockedSection
          title="Healthcare access"
          sectionKey="healthcare"
          countrySlug={slug}
          userHasAccess={hasAccess}
          teaser="Public vs. private system, residency requirements for enrollment, English-speaking providers, and what private insurance actually costs at your age."
          lockedHeadline="What healthcare actually costs and how fast you can enroll"
          lockedBullets={[
            "Public system enrollment timeline and the residency status it requires",
            "Private insurance baseline premiums by age band",
            "Specialist wait times by city",
            "Pharmacy access for ongoing prescriptions you bring with you",
            "Maternity, mental health, and dental coverage gaps",
          ]}
        >
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>Public system enrollment timeline</li>
            <li>Private insurance baseline by age band</li>
            <li>Specialist wait times by city</li>
            <li>Pharmacy access for ongoing prescriptions</li>
            <li>Maternity, mental health, and dental coverage</li>
          </ul>
        </LockedSection>

        <LockedSection
          title="Schools (international + local)"
          sectionKey="schools"
          countrySlug={slug}
          userHasAccess={hasAccess}
          teaser="IB, British, American, French, and bilingual options ranked by city, with annual tuition bands and admission timelines."
          lockedHeadline={`Match the right school to your ${fact.name} city and visa`}
          lockedBullets={[
            "IB schools by city with annual tuition bands",
            "British / American curriculum options and recognition outside the country",
            "Bilingual and local-school enrollment paths for non-native speakers",
            "Special-needs support availability and waitlists",
            "Application timing relative to your visa and arrival window",
          ]}
        >
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>IB schools by city with tuition bands</li>
            <li>British / American curriculum options</li>
            <li>Bilingual & local-school enrollment paths</li>
            <li>Special-needs support availability</li>
            <li>Application timing relative to your visa</li>
          </ul>
        </LockedSection>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <Link to="/pricing" className="btn-primary" data-testid="country-detail-cta-pricing">
          See plans
        </Link>
        <Link to="/start" className="text-sm underline" data-testid="country-detail-cta-quiz">
          Or take the readiness quiz first
        </Link>
      </div>
    </section>
  );
}
