export type PetChecklistItem = {
  id: string;
  label: string;
  group: string;
};

export type CountryPetData = {
  summary: string;
  quarantineNote?: string;
  breedNote?: string;
  checklist: PetChecklistItem[];
  sources: { label: string; url: string }[];
};

const PET_DATA: Record<string, CountryPetData> = {
  portugal: {
    summary: "Portugal follows EU pet import regulations (Regulation EU 576/2013). Dogs, cats, and ferrets require an ISO microchip, rabies vaccination, and an EU health certificate or third-country veterinary certificate.",
    checklist: [
      { id: "pet_pt_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_pt_2", label: "Rabies vaccination administered at least 21 days before travel (pet must be at least 12 weeks old)", group: "Before you travel" },
      { id: "pet_pt_3", label: "EU Pet Passport (from EU) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_pt_4", label: "Rabies antibody titre test if traveling from a non-listed third country (blood sample at least 30 days after vaccination)", group: "Before you travel" },
      { id: "pet_pt_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_pt_6", label: "Register with a local veterinarian in Portugal", group: "After arrival" },
      { id: "pet_pt_7", label: "Register pet in the SIAC (Portuguese pet identification system)", group: "After arrival" },
    ],
    sources: [
      { label: "EU Regulation 576/2013 — Non-commercial movement of pet animals", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0576" },
      { label: "DGAV (Portuguese Veterinary Authority) — Pet travel", url: "https://www.dgav.pt/" },
    ],
  },
  spain: {
    summary: "Spain follows EU pet import rules (Regulation EU 576/2013). Pets need a microchip, current rabies vaccination, and an official health certificate. Pets must be at least 15 weeks old to enter (12 weeks + 21-day vaccination wait).",
    checklist: [
      { id: "pet_es_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_es_2", label: "Rabies vaccination administered at least 21 days before travel (pet must be at least 12 weeks old)", group: "Before you travel" },
      { id: "pet_es_3", label: "EU Pet Passport (from EU) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_es_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_es_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_es_6", label: "Register with a local veterinarian in Spain", group: "After arrival" },
      { id: "pet_es_7", label: "Register pet in your autonomous community's animal registry (RIAC or equivalent)", group: "After arrival" },
    ],
    sources: [
      { label: "EU Regulation 576/2013 — Non-commercial movement of pet animals", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0576" },
      { label: "MAPA (Spanish Ministry of Agriculture) — Pet travel", url: "https://www.mapa.gob.es/" },
    ],
  },
  canada: {
    summary: "Canada requires a valid rabies vaccination certificate for dogs and cats over 3 months old. Microchipping is not required by CFIA but is recommended. There is no quarantine for personal pets with proper documentation.",
    checklist: [
      { id: "pet_ca_1", label: "Valid rabies vaccination certificate signed by a licensed veterinarian (dogs and cats over 3 months)", group: "Before you travel" },
      { id: "pet_ca_2", label: "Proof of age if pet is under 3 months (rabies vaccination not required for young animals)", group: "Before you travel" },
      { id: "pet_ca_3", label: "ISO microchip or tattoo for identification (recommended, not required by CFIA)", group: "Before you travel" },
      { id: "pet_ca_4", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_ca_5", label: "Declare animals to CBSA at port of entry", group: "On arrival" },
      { id: "pet_ca_6", label: "Register with a local veterinarian and obtain provincial pet licence if required", group: "After arrival" },
    ],
    sources: [
      { label: "CFIA — Bringing pets to Canada", url: "https://inspection.canada.ca/en/importing-food-plants-animals/pets" },
      { label: "CBSA — Travellers bringing animals", url: "https://www.cbsa-asfc.gc.ca/travel-voyage/bgb-rmf-eng.html" },
    ],
  },
  "costa-rica": {
    summary: "Costa Rica requires a health certificate and proof of rabies vaccination. Pets are inspected at the airport by SENASA (national animal health service). No quarantine applies with proper documentation.",
    checklist: [
      { id: "pet_cr_1", label: "Veterinary health certificate issued within 14 days of travel", group: "Before you travel" },
      { id: "pet_cr_2", label: "Rabies vaccination administered at least 30 days and no more than 12 months before travel", group: "Before you travel" },
      { id: "pet_cr_3", label: "Health certificate endorsed by your home country's national veterinary authority", group: "Before you travel" },
      { id: "pet_cr_4", label: "ISO microchip for identification", group: "Before you travel" },
      { id: "pet_cr_5", label: "Confirmed airline pet policy and IATA-compliant crate", group: "Before you travel" },
      { id: "pet_cr_6", label: "SENASA inspection at the airport on arrival", group: "On arrival" },
      { id: "pet_cr_7", label: "Register with a local veterinarian in Costa Rica", group: "After arrival" },
    ],
    sources: [
      { label: "SENASA Costa Rica — Animal import requirements", url: "https://www.senasa.go.cr/" },
      { label: "USDA APHIS — Pet travel to Costa Rica", url: "https://www.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-costa-rica" },
    ],
  },
  panama: {
    summary: "Panama requires a health certificate, rabies vaccination, and a MIDA veterinary inspection on arrival. Notify MIDA 3-5 business days before arrival. No formal import permit is required for personal pet dogs and cats.",
    checklist: [
      { id: "pet_pa_1", label: "Notify MIDA of arrival 3-5 business days in advance", group: "Before you travel" },
      { id: "pet_pa_2", label: "Official health certificate issued within 30 days of travel, endorsed by your country's veterinary authority", group: "Before you travel" },
      { id: "pet_pa_3", label: "Rabies vaccination certificate (current)", group: "Before you travel" },
      { id: "pet_pa_4", label: "ISO microchip for identification", group: "Before you travel" },
      { id: "pet_pa_5", label: "Confirmed airline pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_pa_6", label: "MIDA veterinary inspection at the airport on arrival", group: "On arrival" },
      { id: "pet_pa_7", label: "Register with a local veterinarian in Panama", group: "After arrival" },
    ],
    sources: [
      { label: "MIDA Panama — Animal import requirements", url: "https://www.mida.gob.pa/" },
      { label: "USDA APHIS — Pet travel to Panama", url: "https://www.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-panama" },
    ],
  },
  ecuador: {
    summary: "Ecuador requires an international health certificate, proof of rabies vaccination, and parasite treatment. Pets are inspected by Agrocalidad on arrival. No import permit or quarantine required for dogs and cats.",
    checklist: [
      { id: "pet_ec_1", label: "International veterinary health certificate issued within 10 days of arrival", group: "Before you travel" },
      { id: "pet_ec_2", label: "Rabies vaccination certificate (at least 14 days before travel for first vaccination, for pets over 3 months old)", group: "Before you travel" },
      { id: "pet_ec_3", label: "Certificate endorsed by your home country's national veterinary authority", group: "Before you travel" },
      { id: "pet_ec_4", label: "Internal and external parasite treatment within 21 days of departure", group: "Before you travel" },
      { id: "pet_ec_5", label: "ISO 11784/11785 microchip for identification", group: "Before you travel" },
      { id: "pet_ec_6", label: "Core vaccinations (dogs: distemper, hepatitis, leptospirosis, parvovirus; cats: rhinotracheitis, calicivirus, panleukopenia)", group: "Before you travel" },
      { id: "pet_ec_7", label: "Confirmed airline pet policy and IATA-compliant crate", group: "Before you travel" },
      { id: "pet_ec_8", label: "Agrocalidad inspection at port of entry", group: "On arrival" },
      { id: "pet_ec_9", label: "Register with a local veterinarian in Ecuador", group: "After arrival" },
    ],
    sources: [
      { label: "Agrocalidad — Pet import requirements", url: "https://www.agrocalidad.gob.ec/" },
    ],
  },
  malta: {
    summary: "Malta follows EU pet import regulations and requires pre-arrival notification. Dogs need tapeworm (Echinococcus) treatment before entry. Non-EU arrivals may need additional documentation.",
    checklist: [
      { id: "pet_mt_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_mt_2", label: "Rabies vaccination administered at least 21 days before travel (pet must be at least 12 weeks old)", group: "Before you travel" },
      { id: "pet_mt_3", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_mt_4", label: "EU Pet Passport (from EU) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_mt_5", label: "Tapeworm treatment for dogs (Echinococcus multilocularis, praziquantel) 24-120 hours before arrival", group: "Before you travel" },
      { id: "pet_mt_6", label: "Submit pre-arrival notification at nldmalta.gov.mt before travel", group: "Before you travel" },
      { id: "pet_mt_7", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_mt_8", label: "Register with a local veterinarian and update pet microchip records in Malta", group: "After arrival" },
    ],
    sources: [
      { label: "NLD Malta — Pet arrivals notification", url: "https://nldmalta.gov.mt/MaltaPetArrivals/" },
      { label: "EU Regulation 576/2013 — Non-commercial movement of pet animals", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0576" },
    ],
  },
  "united-kingdom": {
    summary: "The UK has strict pet import rules managed by APHA. Pets must enter through an approved route and port of entry. There is no quarantine if all requirements are met, but non-compliance can result in quarantine at the owner's expense.",
    quarantineNote: "Failure to meet all requirements may result in quarantine for up to 4 months at the owner's expense.",
    checklist: [
      { id: "pet_uk_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_uk_2", label: "Rabies vaccination administered at least 21 days before travel (pet must be at least 12 weeks old)", group: "Before you travel" },
      { id: "pet_uk_3", label: "Rabies antibody titre test if traveling from an unlisted country (blood sample at least 30 days after vaccination, 3-month wait before travel)", group: "Before you travel" },
      { id: "pet_uk_4", label: "Animal Health Certificate (AHC) issued by an official veterinarian within 10 days of travel", group: "Before you travel" },
      { id: "pet_uk_5", label: "Tapeworm treatment for dogs (Echinococcus, praziquantel) 24-120 hours before arrival in the UK", group: "Before you travel" },
      { id: "pet_uk_6", label: "Travel via an approved route and enter through an approved UK port of entry", group: "Before you travel" },
      { id: "pet_uk_7", label: "Confirmed airline or transport pet policy and IATA-compliant crate", group: "Before you travel" },
      { id: "pet_uk_8", label: "Register with a local veterinarian and update microchip details to UK address", group: "After arrival" },
    ],
    breedNote: "The UK prohibits certain dog breeds under the Dangerous Dogs Act 1991, including Pit Bull Terrier, Japanese Tosa, Dogo Argentino, and Fila Brasileiro. These breeds cannot be imported.",
    sources: [
      { label: "GOV.UK — Bringing your pet dog, cat or ferret to Great Britain", url: "https://www.gov.uk/bring-pet-to-great-britain" },
      { label: "GOV.UK — Dangerous Dogs Act 1991", url: "https://www.legislation.gov.uk/ukpga/1991/65/contents" },
    ],
  },
  germany: {
    summary: "Germany follows EU pet import regulations (Regulation EU 576/2013). Pets require a microchip, rabies vaccination, and an EU or third-country health certificate. Dog owners must register and pay dog tax (Hundesteuer) in most municipalities.",
    checklist: [
      { id: "pet_de_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_de_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_de_3", label: "EU Pet Passport (from EU) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_de_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_de_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_de_6", label: "Register pet with the local Ordnungsamt (regulatory office) and pay dog tax (Hundesteuer) if applicable", group: "After arrival" },
      { id: "pet_de_7", label: "Register with a local veterinarian in Germany", group: "After arrival" },
    ],
    breedNote: "Germany prohibits the import of Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier, and Bull Terrier breeds under federal law (Hundeverbringungs- und -einfuhrbeschränkungsgesetz). Individual states may have additional restrictions.",
    sources: [
      { label: "BMLEH — Pet entry regulations", url: "https://www.bmleh.de/EN/topics/animals/pets-and-zoo-animals/pets-entry-regulation.html" },
      { label: "German Customs (Zoll) — Dangerous dogs import", url: "https://www.zoll.de/EN/Private-individuals/Travel/Entering-Germany/Restrictions/Dangerous-dogs/dangerous-dogs.html" },
    ],
  },
  ireland: {
    summary: "Ireland follows EU pet import rules and has additional requirements including tapeworm treatment for dogs arriving from outside Ireland. Advance notice to DAFM is recommended before travel.",
    checklist: [
      { id: "pet_ie_1", label: "ISO 11784/11785 microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_ie_2", label: "Rabies vaccination administered at least 21 days before travel (pet must be at least 12 weeks old)", group: "Before you travel" },
      { id: "pet_ie_3", label: "EU Pet Passport (from EU) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_ie_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_ie_5", label: "Tapeworm treatment for dogs (Echinococcus multilocularis) 24-120 hours before arrival (required from non-EU countries)", group: "Before you travel" },
      { id: "pet_ie_6", label: "Submit advance notice to DAFM before travel", group: "Before you travel" },
      { id: "pet_ie_7", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_ie_8", label: "Register with a local veterinarian in Ireland", group: "After arrival" },
      { id: "pet_ie_9", label: "Licence and microchip your dog with the local authority (required by law)", group: "After arrival" },
    ],
    breedNote: "Ireland restricts 11 dog breeds under the Control of Dogs Regulations 1998, including American Pit Bull Terrier, Bull Mastiff, Doberman Pinscher, German Shepherd, Japanese Akita, Rottweiler, and Staffordshire Bull Terrier. Restricted breeds must be muzzled and on a short lead in public.",
    sources: [
      { label: "DAFM — Pet travel to Ireland", url: "https://www.gov.ie/en/publication/b5a5c-pet-travel/" },
      { label: "Control of Dogs Regulations 1998 (S.I. No. 442)", url: "https://www.irishstatutebook.ie/eli/1998/si/442/made/en/print" },
    ],
  },
  australia: {
    summary: "Australia has some of the strictest pet import rules in the world. Pets can only enter from approved countries and must complete mandatory quarantine at the Mickleham facility. The process typically takes at least 6 months of advance planning.",
    quarantineNote: "All cats and dogs must complete a minimum 10-day quarantine at the Mickleham Post Entry Quarantine facility. Quarantine may be extended up to 30 days if documentation issues arise. Costs are borne by the owner.",
    checklist: [
      { id: "pet_au_1", label: "Confirm your country is on Australia's approved list (Group 1, 2, or 3) for pet imports", group: "Before you travel" },
      { id: "pet_au_2", label: "Obtain an import permit from the Department of Agriculture, Fisheries and Forestry (apply at least 6 months before travel)", group: "Before you travel" },
      { id: "pet_au_3", label: "ISO-compatible microchip implanted before all vaccinations and tests", group: "Before you travel" },
      { id: "pet_au_4", label: "Rabies vaccination and Rabies Neutralising Antibody Titre Test (RNATT) — results must meet minimum 0.5 IU/ml", group: "Before you travel" },
      { id: "pet_au_5", label: "Complete all required vaccinations per Australia's schedule (dogs: distemper, hepatitis, parvovirus, parainfluenza, Bordetella; cats: enteritis, rhinotracheitis, calicivirus)", group: "Before you travel" },
      { id: "pet_au_6", label: "Internal and external parasite treatments as specified in the import permit conditions", group: "Before you travel" },
      { id: "pet_au_7", label: "Veterinary health certificate issued within 5 days of export", group: "Before you travel" },
      { id: "pet_au_8", label: "Book quarantine space at the Mickleham Post Entry Quarantine facility", group: "Before you travel" },
      { id: "pet_au_9", label: "Arrange transport with an approved airline or pet transport company", group: "Before you travel" },
      { id: "pet_au_10", label: "Complete minimum 10-day quarantine at government facility", group: "On arrival" },
      { id: "pet_au_11", label: "Register pet with your local council (required in most states and territories)", group: "After arrival" },
      { id: "pet_au_12", label: "Register with a local veterinarian in Australia", group: "After arrival" },
    ],
    breedNote: "Australia prohibits the import of five dog breeds under the Customs (Prohibited Imports) Regulations 1956: American Pit Bull Terrier, Dogo Argentino, Fila Brasileiro, Japanese Tosa, and Perro de Presa Canario.",
    sources: [
      { label: "DAFF — Cats and dogs import", url: "https://www.agriculture.gov.au/biosecurity-trade/cats-dogs" },
      { label: "Customs (Prohibited Imports) Regulations 1956", url: "https://www.legislation.gov.au/Series/F1956L01078" },
    ],
  },
};

export function getPetRequirements(countrySlug: string): CountryPetData | null {
  return PET_DATA[countrySlug] ?? null;
}
