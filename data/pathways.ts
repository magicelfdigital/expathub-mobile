export type Pathway = {
  key: string;
  title: string;
  summary: string;
  whoFor: string[];
  notFor: string[];
  premium: boolean;
  officialLinks: { label: string; url: string }[];
  steps?: string[];
  timeline?: string;
  costRange?: string;
};

export type CountryPathways = {
  [countrySlug: string]: Pathway[];
};

export const PATHWAYS: CountryPathways = {
  portugal: [
    {
      key: "d7",
      title: "D7 (Passive Income)",
      summary: "A residency pathway for individuals with stable passive income who wish to live in Portugal.",
      whoFor: [
        "Retirees with pension income",
        "Individuals with dividends, rental, or investment income",
        "People not planning to work locally",
      ],
      notFor: ["Those seeking local employment", "Short-term stays only"],
      officialLinks: [
        { label: "AIMA (Immigration Authority)", url: "https://aima.gov.pt" },
        { label: "Portuguese Ministry of Foreign Affairs", url: "https://www.portaldiplomatico.mne.gov.pt" },
      ],
      steps: [
        "Gather proof of passive income (pension statements, investment returns, rental contracts)",
        "Open a Portuguese bank account",
        "Obtain a NIF (tax identification number)",
        "Apply for a D7 visa at your local Portuguese consulate",
        "After arrival, schedule an appointment with SEF/AIMA for residency permit",
      ],
      timeline: "3-6 months from application to approval",
      costRange: "Visa fee ~90 EUR + residency permit ~170 EUR",
      premium: true,
    },
    {
      key: "d8",
      title: "D8 (Digital Nomad)",
      summary: "A residency option for remote workers earning income from outside Portugal.",
      whoFor: ["Remote employees", "Freelancers with foreign clients", "Digital nomads"],
      notFor: ["Local employment in Portugal", "Undocumented income"],
      officialLinks: [{ label: "AIMA (Immigration Authority)", url: "https://aima.gov.pt" }],
      steps: [
        "Prove remote employment or freelance contract with non-Portuguese entity",
        "Show minimum income of 4x Portuguese minimum wage",
        "Obtain a NIF and open a Portuguese bank account",
        "Apply at your local Portuguese consulate",
        "Complete residency registration upon arrival",
      ],
      timeline: "2-4 months processing time",
      costRange: "Visa fee ~90 EUR + residency permit ~170 EUR",
      premium: true,
    },
    {
      key: "student",
      title: "Student Visa",
      summary: "For those accepted into a Portuguese educational institution.",
      whoFor: ["University students", "Language course students", "Researchers"],
      notFor: ["Short courses under 3 months", "Online-only programs"],
      officialLinks: [
        { label: "DGES (Higher Education)", url: "https://www.dges.gov.pt" },
      ],
      premium: false,
    },
  ],
  spain: [
    {
      key: "nlv",
      title: "Non-Lucrative Visa",
      summary: "For those who want to live in Spain without working, supported by savings or passive income.",
      whoFor: ["Retirees", "Individuals with sufficient savings", "Those with passive income"],
      notFor: ["Anyone planning to work in Spain", "Short-term tourists"],
      officialLinks: [
        { label: "Spanish Consulate Info", url: "https://www.exteriores.gob.es" },
      ],
      steps: [
        "Prove sufficient financial means (approx. 28,800 EUR/year)",
        "Obtain private health insurance covering Spain",
        "Get a clean criminal record certificate",
        "Apply at your local Spanish consulate",
        "Register with local authorities upon arrival",
      ],
      timeline: "1-3 months processing",
      costRange: "Visa fee ~80 EUR",
      premium: true,
    },
    {
      key: "dnv",
      title: "Digital Nomad Visa",
      summary: "Spain's visa for remote workers employed by or contracting with non-Spanish companies.",
      whoFor: ["Remote workers", "Freelancers", "Entrepreneurs with foreign revenue"],
      notFor: ["Local employment", "Companies based in Spain"],
      officialLinks: [
        { label: "Spanish Government Portal", url: "https://www.inclusion.gob.es" },
      ],
      premium: true,
    },
    {
      key: "student",
      title: "Student Visa",
      summary: "For international students enrolled in Spanish educational programs.",
      whoFor: ["University students", "Language school students"],
      notFor: ["Short courses under 90 days"],
      officialLinks: [
        { label: "Spanish Ministry of Education", url: "https://www.educacionyfp.gob.es" },
      ],
      premium: false,
    },
  ],
  france: [
    {
      key: "talent-passport",
      title: "Talent Passport",
      summary: "Multi-year residency for skilled workers, entrepreneurs, investors, and researchers.",
      whoFor: ["Skilled professionals", "Investors", "Researchers", "Artists"],
      notFor: ["Unskilled labor", "Short-term visitors"],
      officialLinks: [
        { label: "France-Visas Official", url: "https://france-visas.gouv.fr" },
      ],
      premium: true,
    },
    {
      key: "visitor",
      title: "Long-Stay Visitor Visa",
      summary: "For non-EU nationals who want to live in France without working.",
      whoFor: ["Retirees", "People with independent means"],
      notFor: ["Job seekers", "Short stays under 90 days"],
      officialLinks: [
        { label: "France-Visas", url: "https://france-visas.gouv.fr" },
      ],
      premium: false,
    },
  ],
  italy: [
    {
      key: "elective-residency",
      title: "Elective Residency Visa",
      summary: "For those with sufficient passive income who wish to live in Italy without working.",
      whoFor: ["Retirees", "Wealthy individuals", "People with substantial passive income"],
      notFor: ["Job seekers", "Those without proven income"],
      officialLinks: [
        { label: "Italian Ministry of Foreign Affairs", url: "https://www.esteri.it" },
      ],
      premium: true,
    },
    {
      key: "digital-nomad",
      title: "Digital Nomad Visa",
      summary: "Italy's recently introduced visa for remote workers.",
      whoFor: ["Remote workers", "Freelancers", "Self-employed with foreign clients"],
      notFor: ["Local employment", "Those without qualifying income"],
      officialLinks: [
        { label: "Italian Government", url: "https://www.esteri.it" },
      ],
      premium: true,
    },
  ],
  thailand: [
    {
      key: "ltr",
      title: "Long-Term Resident Visa",
      summary: "10-year visa for wealthy individuals, retirees, remote workers, and skilled professionals.",
      whoFor: ["High-income remote workers", "Retirees with pension", "Wealthy global citizens"],
      notFor: ["Budget travelers", "Those without qualifying income"],
      officialLinks: [
        { label: "BOI Thailand", url: "https://www.boi.go.th" },
      ],
      premium: true,
    },
    {
      key: "retirement",
      title: "Retirement Visa (O-A)",
      summary: "For retirees aged 50+ with sufficient funds.",
      whoFor: ["Retirees aged 50+", "Those with 800,000 THB in savings"],
      notFor: ["Under 50", "Those seeking employment"],
      officialLinks: [
        { label: "Thai Immigration Bureau", url: "https://www.immigration.go.th" },
      ],
      premium: false,
    },
  ],
  "costa-rica": [
    {
      key: "rentista",
      title: "Rentista Visa",
      summary: "For those with stable monthly income of at least $2,500 USD.",
      whoFor: ["Remote workers", "Retirees", "Passive income earners"],
      notFor: ["Those without provable income", "Short-term visitors"],
      officialLinks: [
        { label: "Costa Rica Immigration", url: "https://www.migracion.go.cr" },
      ],
      premium: true,
    },
    {
      key: "pensionado",
      title: "Pensionado Visa",
      summary: "For retirees with a monthly pension of at least $1,000 USD.",
      whoFor: ["Retirees with pension", "Social Security recipients"],
      notFor: ["Working-age individuals without pension"],
      officialLinks: [
        { label: "Costa Rica Immigration", url: "https://www.migracion.go.cr" },
      ],
      premium: false,
    },
  ],
  mexico: [
    {
      key: "temporary-resident",
      title: "Temporary Resident Visa",
      summary: "1-4 year residency for those with sufficient income or investments.",
      whoFor: ["Remote workers", "Retirees", "Investors", "Those with family ties"],
      notFor: ["Tourists under 180 days", "Those without provable income"],
      officialLinks: [
        { label: "INM (National Migration Institute)", url: "https://www.gob.mx/inm" },
      ],
      premium: false,
    },
    {
      key: "permanent-resident",
      title: "Permanent Resident Visa",
      summary: "For those with significant financial ties or family connections to Mexico.",
      whoFor: ["Retirees", "Those married to Mexican nationals", "High-income earners"],
      notFor: ["Short-term visitors", "Those without qualifying connections"],
      officialLinks: [
        { label: "INM (National Migration Institute)", url: "https://www.gob.mx/inm" },
      ],
      premium: true,
    },
  ],
  canada: [
    {
      key: "express-entry",
      title: "Express Entry",
      summary: "Points-based immigration system for skilled workers.",
      whoFor: ["Skilled workers", "Professionals with work experience", "Those with Canadian job offers"],
      notFor: ["Unskilled labor", "Those without qualifying education"],
      officialLinks: [
        { label: "IRCC", url: "https://www.canada.ca/en/immigration-refugees-citizenship.html" },
      ],
      premium: true,
    },
  ],
  panama: [
    {
      key: "friendly-nations",
      title: "Friendly Nations Visa",
      summary: "Fast-track residency for citizens of 50 approved countries with economic ties to Panama.",
      whoFor: ["Citizens of approved countries", "Remote workers", "Entrepreneurs", "Retirees with business ties"],
      notFor: ["Citizens of non-qualifying countries", "Those without economic ties to Panama"],
      officialLinks: [
        { label: "Panama Immigration (SNM)", url: "https://www.migracion.gob.pa" },
      ],
      premium: true,
    },
    {
      key: "pensionado",
      title: "Pensionado Visa",
      summary: "Retirement residency with $1,000/month pension plus significant lifestyle discounts.",
      whoFor: ["Retirees with government or private pension", "Social Security recipients"],
      notFor: ["Working-age individuals without pension", "Those with only investment income"],
      officialLinks: [
        { label: "Panama Immigration (SNM)", url: "https://www.migracion.gob.pa" },
      ],
      premium: true,
    },
    {
      key: "self-economic-solvency",
      title: "Self Economic Solvency Visa",
      summary: "Residency through a significant financial investment in Panama.",
      whoFor: ["High-net-worth individuals", "Real estate investors", "Those with $300,000+ in liquid assets"],
      notFor: ["Budget relocators", "Those without substantial capital"],
      officialLinks: [
        { label: "Panama Immigration (SNM)", url: "https://www.migracion.gob.pa" },
      ],
      premium: true,
    },
  ],
  ecuador: [
    {
      key: "rentista",
      title: "Rentista Visa",
      summary: "Residency for individuals with stable income of at least $1,410/month.",
      whoFor: ["Remote workers", "Passive income earners", "Freelancers with stable contracts"],
      notFor: ["Those without provable recurring income", "Short-term visitors"],
      officialLinks: [
        { label: "Ecuador Foreign Ministry", url: "https://www.cancilleria.gob.ec" },
      ],
      premium: true,
    },
    {
      key: "jubilado",
      title: "Jubilado (Retirement) Visa",
      summary: "Retirement residency requiring $1,410/month in guaranteed pension income.",
      whoFor: ["Retirees with $1,410+/month pension", "Social Security recipients"],
      notFor: ["Working-age individuals without pension", "Those without permanent pension income"],
      officialLinks: [
        { label: "Ecuador Foreign Ministry", url: "https://www.cancilleria.gob.ec" },
      ],
      premium: true,
    },
  ],
  malta: [
    {
      key: "digital-nomad",
      title: "Nomad Residence Permit",
      summary: "One-year permit for remote workers earning from outside Malta.",
      whoFor: ["Remote employees", "Freelancers with foreign clients", "Digital nomads earning 3,500+ EUR/month"],
      notFor: ["Local employment seekers", "Those without stable remote income"],
      officialLinks: [
        { label: "Residency Malta Agency", url: "https://residencymalta.gov.mt" },
      ],
      premium: true,
    },
    {
      key: "grp",
      title: "Global Residence Programme",
      summary: "Tax-efficient residency for non-EU nationals with property purchase or rental in Malta.",
      whoFor: ["High-net-worth individuals", "Tax optimization seekers", "EU market access seekers"],
      notFor: ["Budget relocators", "Those who cannot meet property requirements"],
      officialLinks: [
        { label: "Residency Malta Agency", url: "https://residencymalta.gov.mt" },
      ],
      premium: true,
    },
  ],
  "united-kingdom": [
    {
      key: "skilled-worker",
      title: "Skilled Worker Visa",
      summary: "Employer-sponsored work visa for roles meeting skill and salary thresholds.",
      whoFor: ["Professionals with UK job offers", "Skilled workers in shortage occupations", "Those willing to be employer-sponsored"],
      notFor: ["Self-employed workers", "Those without a UK employer sponsor", "Unskilled workers"],
      officialLinks: [
        { label: "UK Visas and Immigration", url: "https://www.gov.uk/skilled-worker-visa" },
      ],
      premium: true,
    },
    {
      key: "global-talent",
      title: "Global Talent Visa",
      summary: "For exceptional leaders and emerging talent in science, engineering, arts, and tech.",
      whoFor: ["Tech founders and leaders", "Published researchers", "Recognized artists", "Senior engineers with notable contributions"],
      notFor: ["Early-career professionals without recognition", "General skilled workers"],
      officialLinks: [
        { label: "UK Global Talent", url: "https://www.gov.uk/global-talent" },
      ],
      premium: true,
    },
    {
      key: "innovator-founder",
      title: "Innovator Founder Visa",
      summary: "For entrepreneurs with a genuine, innovative business plan endorsed by an approved body.",
      whoFor: ["Startup founders", "Entrepreneurs with innovative business ideas", "Those with endorsement from approved body"],
      notFor: ["Traditional business owners", "Those without innovation angle", "Franchise operators"],
      officialLinks: [
        { label: "UK Innovator Founder", url: "https://www.gov.uk/innovator-founder-visa" },
      ],
      premium: true,
    },
  ],
};

export function getPathwaysForCountry(slug: string): Pathway[] {
  return PATHWAYS[slug] || [];
}
