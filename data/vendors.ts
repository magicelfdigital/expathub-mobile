export type Vendor = {
  name: string;
  category: string;
  url: string;
  note?: string;
};

export type CountryVendors = {
  [countrySlug: string]: Vendor[];
};

export const VENDORS: CountryVendors = {
  portugal: [
    { name: "Portuguese Bar Association", category: "Legal", url: "https://www.oa.pt", note: "Find licensed lawyers" },
    { name: "Order of Certified Accountants", category: "Tax", url: "https://www.occ.pt", note: "Find certified accountants" },
    { name: "IMT (Property Registry)", category: "Housing", url: "https://www.imt-ip.pt", note: "Property and vehicle registration" },
    { name: "Bordr", category: "Relocation", url: "https://www.bordr.io", note: "Relocation and visa assistance" },
  ],
  spain: [
    { name: "Spanish Lawyers Council", category: "Legal", url: "https://www.abogacia.es", note: "Find licensed lawyers" },
    { name: "REAF (Tax Advisors)", category: "Tax", url: "https://www.reaf.es", note: "Registered tax advisors" },
    { name: "Fotocasa", category: "Housing", url: "https://www.fotocasa.es", note: "Property and rental listings" },
  ],
  france: [
    { name: "French Bar Association", category: "Legal", url: "https://www.avocats.fr", note: "Directory of licensed lawyers" },
    { name: "French Chamber of Notaries", category: "Legal", url: "https://www.notaires.fr", note: "Property transactions and legal formalities" },
    { name: "French Tax Advisor Directory", category: "Tax", url: "https://www.experts-comptables.fr", note: "Certified accountants" },
  ],
  italy: [
    { name: "Italian Bar Association", category: "Legal", url: "https://www.consiglionazionaleforense.it", note: "Find licensed lawyers" },
    { name: "Italian Accountants Registry", category: "Tax", url: "https://www.commercialisti.it", note: "Certified accountants" },
    { name: "Tecnocasa", category: "Housing", url: "https://www.tecnocasa.it", note: "Real estate agency network" },
  ],
  germany: [
    { name: "German Bar Association", category: "Legal", url: "https://anwaltauskunft.de", note: "Find licensed lawyers" },
    { name: "StB (Tax Advisor Chamber)", category: "Tax", url: "https://www.bstbk.de", note: "Find certified tax advisors" },
  ],
  thailand: [
    { name: "Thai Lawyers Council", category: "Legal", url: "https://www.lawyerscouncil.or.th", note: "Licensed legal professionals" },
    { name: "Thai-based Relocation Services", category: "Relocation", url: "https://www.expatden.com", note: "Guides and service listings" },
  ],
  "costa-rica": [
    { name: "Costa Rica Bar Association", category: "Legal", url: "https://www.abogados.or.cr", note: "Licensed attorneys" },
    { name: "CFIA (Professional Engineers)", category: "Housing", url: "https://www.cfia.or.cr", note: "Registered architects and builders" },
  ],
  mexico: [
    { name: "Mexican Bar Association", category: "Legal", url: "https://www.bma.org.mx", note: "Licensed legal professionals" },
    { name: "IMCP (Accountants Institute)", category: "Tax", url: "https://www.imcp.org.mx", note: "Certified public accountants" },
  ],
  canada: [
    { name: "Law Society (by Province)", category: "Legal", url: "https://www.flsc.ca", note: "Federation of Law Societies" },
    { name: "CPA Canada", category: "Tax", url: "https://www.cpacanada.ca", note: "Chartered Professional Accountants" },
    { name: "IRCC Settlement Services", category: "Relocation", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html", note: "Free newcomer services" },
  ],
  ireland: [
    { name: "Law Society of Ireland", category: "Legal", url: "https://www.lawsociety.ie", note: "Find solicitors" },
    { name: "Chartered Accountants Ireland", category: "Tax", url: "https://www.charteredaccountants.ie", note: "Find certified accountants" },
    { name: "MyHome.ie", category: "Housing", url: "https://www.myhome.ie", note: "Property listings and rentals" },
  ],
  australia: [
    { name: "Law Council of Australia", category: "Legal", url: "https://www.lawcouncil.asn.au", note: "Find legal practitioners" },
    { name: "CPA Australia", category: "Tax", url: "https://www.cpaaustralia.com.au", note: "Certified practising accountants" },
    { name: "MARA (Migration Agents)", category: "Relocation", url: "https://www.mara.gov.au", note: "Registered migration agents" },
  ],
};

export function getVendorsForCountry(slug: string): Vendor[] {
  return VENDORS[slug] || [];
}
