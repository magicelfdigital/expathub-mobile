import { isLaunchCountry } from "./coverage";

export type CompareRow = {
  id: string;
  label: string;
  description?: string;
  proOnly?: boolean;
  values: Record<string, string>;
};

const ALL_ROWS: CompareRow[] = [
  {
    id: "pathways-available",
    label: "Residency pathways",
    description: "Number of viable residency pathways available",
    values: {
      portugal: "D7, D8 Digital Nomad",
      spain: "NLV, Digital Nomad Visa",
      canada: "Express Entry, PNP streams",
      "costa-rica": "Rentista, Pensionado",
      panama: "Friendly Nations, Pensionado, Self-Solvency",
      ecuador: "Rentista, Jubilado",
      malta: "Digital Nomad, GRP",
      "united-kingdom": "Skilled Worker, Global Talent, Innovator Founder",
    },
  },
  {
    id: "work-without-sponsor",
    label: "Work without sponsorship",
    description: "Can you work without an employer sponsor?",
    values: {
      portugal: "Yes — D7/D8 allow remote work for non-PT employer",
      spain: "Yes — NLV/DNV allow remote work for non-ES employer",
      canada: "No — most pathways require job offer or LMIA",
      "costa-rica": "Limited — remote for foreign employer only",
      panama: "Yes — FNV allows independent work",
      ecuador: "Limited — remote for foreign employer tolerated",
      malta: "Yes — Nomad Residence for remote workers",
      "united-kingdom": "No — employer sponsorship required",
    },
  },
  {
    id: "path-to-pr",
    label: "Path to permanent residency",
    description: "Is there a clear route to permanent residency?",
    values: {
      portugal: "Yes — permanent residency after 5 years, citizenship at 5",
      spain: "Yes — permanent residency after 5 years, citizenship at 10",
      canada: "Yes — Express Entry grants permanent residency on arrival",
      "costa-rica": "Yes — permanent residency eligible after 3 years",
      panama: "Yes — provisional permanent residency, full after 2 years",
      ecuador: "Yes — permanent residency eligible after ~2 years",
      malta: "No — GRP is renewable, no permanent residency pathway",
      "united-kingdom": "Yes — ILR after 5 years",
    },
  },
  {
    id: "typical-timeline",
    label: "Typical timeline",
    description: "How long from application to approval?",
    values: {
      portugal: "3–6 months (longer with AIMA backlog)",
      spain: "2–4 months (DNV faster than NLV)",
      canada: "6–12 months (Express Entry ~6 mo)",
      "costa-rica": "3–6 months",
      panama: "3–6 months",
      ecuador: "2–4 months",
      malta: "4–8 weeks",
      "united-kingdom": "3–8 weeks (Skilled Worker)",
    },
  },
  {
    id: "language-requirement",
    label: "Language requirement",
    description: "Is local language proficiency required?",
    values: {
      portugal: "A2 Portuguese for citizenship only",
      spain: "Not for visa; helpful for daily life",
      canada: "Yes — English/French CLB 7+ for Express Entry",
      "costa-rica": "Not required; Spanish helpful",
      panama: "Not required; Spanish helpful",
      ecuador: "Not required; Spanish helpful",
      malta: "English is official — no barrier",
      "united-kingdom": "B1 English for most visa types",
    },
  },
  {
    id: "sponsorship-reality",
    label: "Work sponsorship reality",
    description: "What actually works for employer sponsorship?",
    proOnly: true,
    values: {
      portugal: "Rarely used — most non-EU choose D7/D8 instead. Employer route has labor market test.",
      spain: "Difficult — employer must prove no EU candidate available. Tech sector has some exceptions.",
      canada: "LMIA-based — employer pays ~$1K fee, process takes months. Express Entry + job offer is stronger.",
      "costa-rica": "Uncommon — most expats use self-funded visas. Local salaries are low.",
      panama: "Quota system — foreign workers capped at 10% of workforce. FNV is usually better.",
      ecuador: "Exists but rarely used — local wages make it impractical for most expats.",
      malta: "Single Permit system — employer applies, government approves. Small market, limited roles.",
      "united-kingdom": "Primary route — employer must be licensed sponsor. Minimum salary £38,700 (2024+).",
    },
  },
  {
    id: "income-thresholds",
    label: "Income thresholds",
    description: "Realistic income requirements for main pathways",
    proOnly: true,
    values: {
      portugal: "D7: ~€760/mo passive income. D8: ~€3,500/mo (4x minimum wage)",
      spain: "NLV: ~€2,520/mo (IPREM-based). DNV: ~€3,300/mo",
      canada: "Express Entry: proof of settlement funds ~CAD $13,757 (single, 2024)",
      "costa-rica": "Rentista: $2,500/mo for 2 years or $60K deposit",
      panama: "FNV: $5,000 bank deposit + economic ties. Pensionado: $1,000/mo pension",
      ecuador: "Rentista: ~$1,375/mo (3x basic salary). Jubilado: ~$800/mo pension",
      malta: "Nomad Residence: ~€2,700/mo gross income minimum",
      "united-kingdom": "Skilled Worker: £38,700/yr salary (or going rate). Global Talent: no minimum.",
    },
  },
  {
    id: "tax-exposure",
    label: "Tax exposure risk",
    description: "Risk level for unexpected tax obligations",
    proOnly: true,
    values: {
      portugal: "Medium — NHR ended 2024; new IFICI regime is narrower. Worldwide income taxed.",
      spain: "Medium — Beckham Law (DNV) caps at 24% for 6 yrs. NLV = standard progressive rates.",
      canada: "High — worldwide income taxed from day 1 as resident. Provincial rates vary.",
      "costa-rica": "Low — territorial tax system; foreign-source income not taxed.",
      panama: "Low — territorial tax system; foreign income exempt.",
      ecuador: "Medium — worldwide income taxed for residents. Rates up to 37%.",
      malta: "Low-Medium — remittance basis available for non-domiciled residents.",
      "united-kingdom": "High — worldwide income taxed. Non-dom remittance basis ending 2025.",
    },
  },
  {
    id: "bureaucracy",
    label: "Bureaucracy difficulty",
    description: "Overall difficulty dealing with government processes",
    proOnly: true,
    values: {
      portugal: "High — AIMA backlog severe, appointments scarce. SEF reform in progress.",
      spain: "High — NIE/TIE process slow, regional variation. Hire a gestor.",
      canada: "Medium — process is clear and online, but slow and competitive.",
      "costa-rica": "Medium — process is straightforward but slow. Lawyer recommended.",
      panama: "Medium — relatively efficient. Lawyer handles most steps.",
      ecuador: "Medium — process has improved. Some in-person requirements.",
      malta: "Low — small country, efficient processing, English-language system.",
      "united-kingdom": "Medium — clear online system, strict documentation requirements.",
    },
  },
  {
    id: "not-good-for",
    label: "Not ideal for",
    description: "Who should think twice about this country?",
    proOnly: true,
    values: {
      portugal: "Anyone expecting fast processing. People who want zero tax exposure.",
      spain: "People needing quick employer sponsorship. Those who dislike bureaucracy.",
      canada: "Older applicants (age penalty in Express Entry). Low-income applicants.",
      "costa-rica": "People wanting local employment. Those needing EU access.",
      panama: "People seeking cultural immersion. Those wanting large expat communities outside Panama City.",
      ecuador: "People wanting high-income local jobs. Those uncomfortable with developing-country infrastructure.",
      malta: "People wanting a big-city lifestyle. Those planning to work locally (tiny job market).",
      "united-kingdom": "Budget-conscious movers. People without employer sponsorship lined up.",
    },
  },
];

export function getCompareMatrix(countrySlugs: string[]): CompareRow[] {
  const validSlugs = countrySlugs.filter(isLaunchCountry);
  if (validSlugs.length === 0) return [];

  return ALL_ROWS.map((row) => {
    const filteredValues: Record<string, string> = {};
    for (const slug of validSlugs) {
      filteredValues[slug] = row.values[slug] ?? "\u2014";
    }
    return { ...row, values: filteredValues };
  });
}

export function getCompareCountrySlugs(): string[] {
  return Object.keys(ALL_ROWS[0]?.values ?? {});
}
