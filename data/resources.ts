export type ResourceCategory = "visa" | "tax" | "housing" | "healthcare" | "work";

export type SourceType = "official" | "authoritative" | "community";

export type Resource = {
  label: string;
  note?: string;
  url: string;
  sourceType: SourceType;
  category?: ResourceCategory;
};

export type CountryResources = {
  [countrySlug: string]: Resource[];
};

export const RESOURCES: CountryResources = {
  portugal: [
    {
      label: "AIMA -- Residency & Immigration",
      note: "Official Portuguese authority for visas and residency permits.",
      url: "https://aima.gov.pt",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Portuguese Tax Authority",
      note: "Income tax, NIF, and residency tax obligations.",
      url: "https://www.portaldasfinancas.gov.pt",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "SNS (National Health Service)",
      note: "Public healthcare information and access pathways.",
      url: "https://www.sns.gov.pt",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Idealista Portugal",
      note: "Popular housing search platform for rentals and purchases.",
      url: "https://www.idealista.pt",
      sourceType: "community",
      category: "housing",
    },
    {
      label: "IEFP (Employment Institute)",
      note: "Job market information and employment services.",
      url: "https://www.iefp.pt",
      sourceType: "authoritative",
      category: "work",
    },
  ],
  spain: [
    {
      label: "Spanish Immigration Portal",
      note: "Official government portal for residency and visa information.",
      url: "https://www.inclusion.gob.es",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Agencia Tributaria",
      note: "Spanish tax authority -- income tax, NIE, and residency obligations.",
      url: "https://sede.agenciatributaria.gob.es",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "Spanish National Health System",
      note: "Public healthcare and social security enrollment.",
      url: "https://www.sanidad.gob.es",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Idealista Spain",
      note: "Housing search platform for rentals and sales across Spain.",
      url: "https://www.idealista.com",
      sourceType: "community",
      category: "housing",
    },
  ],
  france: [
    {
      label: "France-Visas",
      note: "Official visa application portal for all visa types.",
      url: "https://france-visas.gouv.fr",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "French Tax Authority",
      note: "Income tax declarations, fiscal residence rules.",
      url: "https://www.impots.gouv.fr",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "Ameli (Health Insurance)",
      note: "French social security and health insurance enrollment.",
      url: "https://www.ameli.fr",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "SeLoger",
      note: "Popular property search platform for rentals in France.",
      url: "https://www.seloger.com",
      sourceType: "community",
      category: "housing",
    },
  ],
  italy: [
    {
      label: "Italian Ministry of Foreign Affairs",
      note: "Visa applications and consular services.",
      url: "https://vistoperitalia.esteri.it",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Agenzia delle Entrate",
      note: "Italian revenue agency -- tax codes and fiscal obligations.",
      url: "https://www.agenziaentrate.gov.it",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "SSN (National Health Service)",
      note: "Public healthcare enrollment for residents.",
      url: "https://www.salute.gov.it",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Immobiliare.it",
      note: "Largest property search platform in Italy.",
      url: "https://www.immobiliare.it",
      sourceType: "community",
      category: "housing",
    },
  ],
  germany: [
    {
      label: "Federal Foreign Office",
      note: "Visa requirements and application procedures.",
      url: "https://www.auswaertiges-amt.de",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Bundeszentralamt fur Steuern",
      note: "German federal tax office.",
      url: "https://www.bzst.de",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "German Health Insurance",
      note: "Public and private health insurance options.",
      url: "https://www.krankenkassen.de",
      sourceType: "community",
      category: "healthcare",
    },
    {
      label: "ImmobilienScout24",
      note: "Leading property search platform for rentals and purchases in Germany.",
      url: "https://www.immobilienscout24.de",
      sourceType: "community",
      category: "housing",
    },
    {
      label: "Make it in Germany",
      note: "Official government portal for skilled worker immigration.",
      url: "https://www.make-it-in-germany.com",
      sourceType: "official",
      category: "work",
    },
  ],
  thailand: [
    {
      label: "Thai Immigration Bureau",
      note: "Official visa and immigration services.",
      url: "https://www.immigration.go.th",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "BOI Thailand",
      note: "Board of Investment -- LTR visa information.",
      url: "https://www.boi.go.th",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Thai Revenue Department",
      note: "Tax information for residents and workers.",
      url: "https://www.rd.go.th",
      sourceType: "authoritative",
      category: "tax",
    },
  ],
  "costa-rica": [
    {
      label: "Costa Rica Immigration",
      note: "Official portal for residency applications.",
      url: "https://www.migracion.go.cr",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "CCSS (Social Security)",
      note: "Public healthcare and social security enrollment.",
      url: "https://www.ccss.sa.cr",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Encuentra24 Costa Rica",
      note: "Housing and rental listings in Costa Rica.",
      url: "https://www.encuentra24.com/costa-rica",
      sourceType: "community",
      category: "housing",
    },
  ],
  mexico: [
    {
      label: "INM (National Migration Institute)",
      note: "Official Mexican immigration authority.",
      url: "https://www.gob.mx/inm",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "SAT (Tax Administration)",
      note: "Mexican tax authority -- RFC and fiscal obligations.",
      url: "https://www.sat.gob.mx",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "IMSS (Social Security)",
      note: "Public health insurance for residents.",
      url: "https://www.imss.gob.mx",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Inmuebles24",
      note: "Property listings and rentals across Mexico.",
      url: "https://www.inmuebles24.com",
      sourceType: "community",
      category: "housing",
    },
  ],
  canada: [
    {
      label: "IRCC (Immigration, Refugees and Citizenship)",
      note: "Official Canadian immigration portal.",
      url: "https://www.canada.ca/en/immigration-refugees-citizenship.html",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "CRA (Canada Revenue Agency)",
      note: "Tax obligations for new residents.",
      url: "https://www.canada.ca/en/revenue-agency.html",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "Provincial Health Insurance",
      note: "Health coverage varies by province -- check your destination.",
      url: "https://www.canada.ca/en/health-canada.html",
      sourceType: "authoritative",
      category: "healthcare",
    },
  ],
  ireland: [
    {
      label: "DETE -- Employment Permits",
      note: "Official portal for employment permit applications and eligibility.",
      url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "Revenue Commissioners",
      note: "Irish tax authority -- PPSN, income tax, and residency obligations.",
      url: "https://www.revenue.ie",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "HSE (Health Service Executive)",
      note: "Public healthcare system and medical card eligibility.",
      url: "https://www.hse.ie",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Daft.ie",
      note: "Leading property search platform for rentals and sales in Ireland.",
      url: "https://www.daft.ie",
      sourceType: "community",
      category: "housing",
    },
    {
      label: "ISD (Immigration Service Delivery)",
      note: "Residence permits, IRP registration, and visa information.",
      url: "https://www.irishimmigration.ie",
      sourceType: "official",
      category: "visa",
    },
  ],
  australia: [
    {
      label: "Department of Home Affairs -- Visas",
      note: "Official Australian visa and immigration portal.",
      url: "https://immi.homeaffairs.gov.au",
      sourceType: "official",
      category: "visa",
    },
    {
      label: "ATO (Australian Taxation Office)",
      note: "Tax file numbers, income tax, and residency obligations.",
      url: "https://www.ato.gov.au",
      sourceType: "authoritative",
      category: "tax",
    },
    {
      label: "Medicare",
      note: "Public healthcare enrollment and eligibility for residents.",
      url: "https://www.servicesaustralia.gov.au/medicare",
      sourceType: "authoritative",
      category: "healthcare",
    },
    {
      label: "Domain.com.au",
      note: "Property search for rentals and purchases across Australia.",
      url: "https://www.domain.com.au",
      sourceType: "community",
      category: "housing",
    },
    {
      label: "SkillSelect",
      note: "Expression of Interest portal for skilled migration.",
      url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect",
      sourceType: "official",
      category: "work",
    },
  ],
};

export function getResourcesForCountry(slug: string): Resource[] {
  return RESOURCES[slug] || [];
}
