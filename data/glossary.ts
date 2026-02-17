export type GlossaryEntry = {
  abbreviation: string;
  fullName: string;
  country: string;
  description: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  // Portugal
  { abbreviation: "D7", fullName: "Passive Income Visa", country: "Portugal", description: "Residency visa for individuals with stable passive income such as pensions, dividends, or rental income. No work allowed." },
  { abbreviation: "D8", fullName: "Digital Nomad Visa", country: "Portugal", description: "Residency visa for remote workers earning income from non-Portuguese companies." },
  { abbreviation: "NIF", fullName: "Numero de Identificacao Fiscal", country: "Portugal", description: "Portuguese tax identification number, required for banking, contracts, and residency applications." },
  { abbreviation: "NHR", fullName: "Non-Habitual Resident", country: "Portugal", description: "Former tax regime offering reduced rates for new residents. Ended for new applicants in 2024, replaced by the narrower IFICI program." },
  { abbreviation: "IFICI", fullName: "Incentivo Fiscal a Investigacao Cientifica e Inovacao", country: "Portugal", description: "Replacement for NHR, offering tax benefits to a much narrower group of qualifying professionals and researchers." },
  { abbreviation: "SEF", fullName: "Servico de Estrangeiros e Fronteiras", country: "Portugal", description: "Former immigration and border agency, now replaced by AIMA." },
  { abbreviation: "AIMA", fullName: "Agencia para a Integracao, Migracoes e Asilo", country: "Portugal", description: "Portugal's current immigration authority, handling residency permits and visa processing." },

  // Spain
  { abbreviation: "NLV", fullName: "Non-Lucrative Visa", country: "Spain", description: "Residency visa for those who want to live in Spain without working, supported by savings or passive income." },
  { abbreviation: "DNV", fullName: "Digital Nomad Visa", country: "Spain", description: "Spain's visa for remote workers employed by or contracting with non-Spanish companies." },
  { abbreviation: "NIE", fullName: "Numero de Identidad de Extranjero", country: "Spain", description: "Foreigner identification number required for taxes, banking, property purchases, and most official transactions in Spain." },
  { abbreviation: "TIE", fullName: "Tarjeta de Identidad de Extranjero", country: "Spain", description: "Physical identity card issued to foreign residents in Spain, replacing the older NIE card format." },

  // Canada
  { abbreviation: "CRS", fullName: "Comprehensive Ranking System", country: "Canada", description: "Points-based scoring system used in Express Entry to rank immigration candidates based on age, education, work experience, and language skills." },
  { abbreviation: "PNP", fullName: "Provincial Nominee Program", country: "Canada", description: "Provincial immigration program that allows Canadian provinces to nominate candidates for permanent residency based on local labor needs." },
  { abbreviation: "IRCC", fullName: "Immigration, Refugees and Citizenship Canada", country: "Canada", description: "Federal department responsible for immigration, refugee, and citizenship services." },
  { abbreviation: "LMIA", fullName: "Labour Market Impact Assessment", country: "Canada", description: "Document an employer may need to hire a foreign worker, proving no Canadian worker is available for the role." },
  { abbreviation: "ETA", fullName: "Electronic Travel Authorization", country: "Canada", description: "Required for visa-exempt foreign nationals flying to or transiting through Canada." },
  { abbreviation: "ITA", fullName: "Invitation to Apply", country: "Canada", description: "Official invitation from IRCC to submit a full permanent residency application after being selected from the Express Entry pool." },

  // United Kingdom
  { abbreviation: "ILR", fullName: "Indefinite Leave to Remain", country: "United Kingdom", description: "Permanent residency status in the UK, typically granted after 5 years of qualifying residency." },
  { abbreviation: "BRP", fullName: "Biometric Residence Permit", country: "United Kingdom", description: "Physical card confirming immigration status, right to work, and access to public services in the UK." },
  { abbreviation: "CoS", fullName: "Certificate of Sponsorship", country: "United Kingdom", description: "Electronic document issued by a licensed UK employer to sponsor a foreign worker's visa application." },
  { abbreviation: "SOL", fullName: "Shortage Occupation List", country: "United Kingdom", description: "Government list of roles with labor shortages, offering lower salary thresholds and easier sponsorship for visa applicants." },

  // Malta
  { abbreviation: "GRP", fullName: "Global Residence Programme", country: "Malta", description: "Tax-efficient residency for non-EU nationals requiring property purchase or rental in Malta. Renewable but does not lead to permanent residency." },
  { abbreviation: "NRP", fullName: "Nomad Residence Permit", country: "Malta", description: "One-year permit for remote workers earning at least 3,500 EUR per month from outside Malta." },

  // Panama
  { abbreviation: "FNV", fullName: "Friendly Nations Visa", country: "Panama", description: "Fast-track residency for citizens of 50 approved countries who establish economic ties to Panama." },
  { abbreviation: "SES", fullName: "Self Economic Solvency Visa", country: "Panama", description: "Residency through significant financial investment in Panama, typically requiring $300,000 or more." },
  { abbreviation: "SNM", fullName: "Servicio Nacional de Migracion", country: "Panama", description: "Panama's national immigration authority." },

  // Thailand
  { abbreviation: "LTR", fullName: "Long-Term Resident Visa", country: "Thailand", description: "10-year visa for wealthy individuals, retirees, remote workers, and skilled professionals meeting income requirements." },
  { abbreviation: "O-A", fullName: "Retirement Visa (Non-Immigrant O-A)", country: "Thailand", description: "Long-stay visa for retirees aged 50 and over with at least 800,000 THB in savings or 65,000 THB monthly income." },
  { abbreviation: "BOI", fullName: "Board of Investment", country: "Thailand", description: "Government agency that administers the LTR visa program and investment incentives." },

  // Costa Rica
  { abbreviation: "DGME", fullName: "Direccion General de Migracion y Extranjeria", country: "Costa Rica", description: "Costa Rica's immigration authority responsible for residency applications and permits." },

  // Ecuador
  { abbreviation: "MREMH", fullName: "Ministerio de Relaciones Exteriores y Movilidad Humana", country: "Ecuador", description: "Ecuador's ministry handling visa and immigration matters." },

  // General / Multi-country
  { abbreviation: "FIRE", fullName: "Financial Independence, Retire Early", country: "General", description: "Lifestyle movement focused on aggressive saving and investing to achieve financial independence and early retirement abroad." },
  { abbreviation: "DAFT", fullName: "Dutch American Friendship Treaty", country: "Netherlands", description: "Treaty allowing US citizens to obtain self-employment residency in the Netherlands with relatively low investment requirements." },
];

export function getGlossaryByCountry(country: string): GlossaryEntry[] {
  return GLOSSARY.filter((g) => g.country === country);
}

export function lookupAbbreviation(abbr: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.abbreviation.toLowerCase() === abbr.toLowerCase());
}
