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
};

const PET_DATA: Record<string, CountryPetData> = {
  portugal: {
    summary: "Portugal follows EU pet import regulations. Dogs, cats, and ferrets require an ISO microchip, rabies vaccination, and an EU health certificate or third-country veterinary certificate.",
    checklist: [
      { id: "pet_pt_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_pt_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_pt_3", label: "EU health certificate (Annex IV) or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_pt_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_pt_5", label: "Tapeworm treatment for dogs (echinococcus) 24-120 hours before arrival", group: "Before you travel" },
      { id: "pet_pt_6", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_pt_7", label: "Register with a local veterinarian in Portugal", group: "After arrival" },
      { id: "pet_pt_8", label: "Register pet in the SIAC (Portuguese pet identification system)", group: "After arrival" },
    ],
  },
  spain: {
    summary: "Spain follows EU pet import rules. Pets need a microchip, current rabies vaccination, and an official health certificate. Entry from non-EU countries may require additional testing.",
    checklist: [
      { id: "pet_es_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_es_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_es_3", label: "EU health certificate or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_es_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_es_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_es_6", label: "Register with a local veterinarian in Spain", group: "After arrival" },
      { id: "pet_es_7", label: "Register pet in your autonomous community's animal registry (RIAC or equivalent)", group: "After arrival" },
    ],
  },
  canada: {
    summary: "Canada requires a valid rabies vaccination certificate for dogs and cats over 3 months old. There is no quarantine for pets arriving with proper documentation.",
    checklist: [
      { id: "pet_ca_1", label: "Rabies vaccination certificate signed by a licensed veterinarian", group: "Before you travel" },
      { id: "pet_ca_2", label: "Vaccination administered at least 28 days before arrival (if primary vaccination)", group: "Before you travel" },
      { id: "pet_ca_3", label: "ISO microchip or tattoo for identification", group: "Before you travel" },
      { id: "pet_ca_4", label: "Health certificate issued within 72 hours of departure (recommended)", group: "Before you travel" },
      { id: "pet_ca_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_ca_6", label: "CBSA declaration of animals at port of entry", group: "On arrival" },
      { id: "pet_ca_7", label: "Register with a local veterinarian and obtain provincial pet licence if required", group: "After arrival" },
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
  },
  panama: {
    summary: "Panama requires an import permit from MIDA (Ministry of Agricultural Development), a health certificate, and proof of vaccinations. No quarantine applies with valid documentation.",
    checklist: [
      { id: "pet_pa_1", label: "Import permit from MIDA obtained before travel", group: "Before you travel" },
      { id: "pet_pa_2", label: "Veterinary health certificate issued within 14 days of travel", group: "Before you travel" },
      { id: "pet_pa_3", label: "Rabies vaccination certificate (current)", group: "Before you travel" },
      { id: "pet_pa_4", label: "Health certificate endorsed by your home country's national veterinary authority", group: "Before you travel" },
      { id: "pet_pa_5", label: "ISO microchip for identification", group: "Before you travel" },
      { id: "pet_pa_6", label: "Confirmed airline pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_pa_7", label: "MIDA inspection at the airport on arrival", group: "On arrival" },
      { id: "pet_pa_8", label: "Register with a local veterinarian in Panama", group: "After arrival" },
    ],
  },
  ecuador: {
    summary: "Ecuador requires an international health certificate, proof of rabies vaccination, and endorsement by your home country's veterinary authority. Pets are inspected by Agrocalidad on arrival.",
    checklist: [
      { id: "pet_ec_1", label: "International veterinary health certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_ec_2", label: "Rabies vaccination certificate (current)", group: "Before you travel" },
      { id: "pet_ec_3", label: "Certificate endorsed by your home country's national veterinary authority", group: "Before you travel" },
      { id: "pet_ec_4", label: "Parasite treatment certificate", group: "Before you travel" },
      { id: "pet_ec_5", label: "ISO microchip for identification", group: "Before you travel" },
      { id: "pet_ec_6", label: "Confirmed airline pet policy and IATA-compliant crate", group: "Before you travel" },
      { id: "pet_ec_7", label: "Agrocalidad inspection at port of entry", group: "On arrival" },
      { id: "pet_ec_8", label: "Register with a local veterinarian in Ecuador", group: "After arrival" },
    ],
  },
  malta: {
    summary: "Malta follows EU pet import regulations and also requires a specific import permit for pets arriving from outside the EU. Dogs, cats, and ferrets need a microchip, rabies vaccination, and an EU or third-country health certificate.",
    checklist: [
      { id: "pet_mt_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_mt_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_mt_3", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_mt_4", label: "EU health certificate or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_mt_5", label: "Tapeworm treatment for dogs (echinococcus) 24-120 hours before arrival", group: "Before you travel" },
      { id: "pet_mt_6", label: "Import permit from Malta's Veterinary Regulation Directorate (non-EU arrivals)", group: "Before you travel" },
      { id: "pet_mt_7", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_mt_8", label: "Register with a local veterinarian and update pet microchip records in Malta", group: "After arrival" },
    ],
  },
  "united-kingdom": {
    summary: "The UK has strict pet import rules. Pets must enter through an approved route and port of entry. There is no quarantine if all requirements are met, but non-compliance can result in quarantine at the owner's expense.",
    quarantineNote: "Failure to meet all requirements may result in quarantine for up to 4 months at the owner's expense.",
    checklist: [
      { id: "pet_uk_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_uk_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_uk_3", label: "Rabies antibody titre test (required from unlisted countries, results take 3-4 months)", group: "Before you travel" },
      { id: "pet_uk_4", label: "Animal Health Certificate (AHC) issued by an official veterinarian within 10 days of travel", group: "Before you travel" },
      { id: "pet_uk_5", label: "Tapeworm treatment for dogs 24-120 hours before arrival in the UK", group: "Before you travel" },
      { id: "pet_uk_6", label: "Travel via an approved route and enter through an approved UK port of entry", group: "Before you travel" },
      { id: "pet_uk_7", label: "Confirmed airline or transport pet policy and IATA-compliant crate", group: "Before you travel" },
      { id: "pet_uk_8", label: "Register with a local veterinarian and update microchip details to UK address", group: "After arrival" },
    ],
    breedNote: "The UK prohibits certain dog breeds under the Dangerous Dogs Act, including Pit Bull Terrier, Japanese Tosa, Dogo Argentino, and Fila Brasileiro. Check breed-specific legislation before traveling.",
  },
  germany: {
    summary: "Germany follows EU pet import regulations. Pets require a microchip, rabies vaccination, and an EU or third-country health certificate. Entry from non-EU countries requires additional documentation.",
    checklist: [
      { id: "pet_de_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_de_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_de_3", label: "EU health certificate or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_de_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_de_5", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_de_6", label: "Register pet with the local Ordnungsamt (regulatory office) and pay dog tax (Hundesteuer) if applicable", group: "After arrival" },
      { id: "pet_de_7", label: "Register with a local veterinarian in Germany", group: "After arrival" },
    ],
    breedNote: "Germany has breed-specific regulations that vary by federal state (Bundesland). Some states restrict or require permits for breeds classified as dangerous. Check your destination state's rules before traveling.",
  },
  ireland: {
    summary: "Ireland follows EU pet import rules and has additional requirements for pets arriving from outside the EU. Pets must be microchipped, vaccinated, and accompanied by official documentation.",
    checklist: [
      { id: "pet_ie_1", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_ie_2", label: "Rabies vaccination administered at least 21 days before travel", group: "Before you travel" },
      { id: "pet_ie_3", label: "EU health certificate or third-country veterinary certificate issued within 10 days of travel", group: "Before you travel" },
      { id: "pet_ie_4", label: "Rabies antibody titre test if traveling from a non-listed third country", group: "Before you travel" },
      { id: "pet_ie_5", label: "Tapeworm treatment for dogs (echinococcus) 24-120 hours before arrival", group: "Before you travel" },
      { id: "pet_ie_6", label: "Confirmed airline or transport pet policy and crate requirements", group: "Before you travel" },
      { id: "pet_ie_7", label: "Register with a local veterinarian in Ireland", group: "After arrival" },
      { id: "pet_ie_8", label: "Microchip your dog with a local council if not already done (required by law)", group: "After arrival" },
    ],
    breedNote: "Ireland restricts certain dog breeds under the Control of Dogs Regulations. Restricted breeds must be muzzled and leashed in public and require a licence. Check the restricted breeds list before traveling.",
  },
  australia: {
    summary: "Australia has some of the strictest pet import rules in the world. Pets can only enter from approved countries, must undergo a mandatory quarantine period, and require extensive advance planning. The process typically takes 6-12 months.",
    quarantineNote: "All cats and dogs must complete a minimum 10-day quarantine at a government facility on arrival. Costs are borne by the owner.",
    checklist: [
      { id: "pet_au_1", label: "Confirm your home country is on Australia's approved country list for pet imports", group: "Before you travel" },
      { id: "pet_au_2", label: "Obtain an import permit from the Department of Agriculture (apply at least 6 months before travel)", group: "Before you travel" },
      { id: "pet_au_3", label: "ISO-compatible microchip implanted before rabies vaccination", group: "Before you travel" },
      { id: "pet_au_4", label: "Rabies vaccination and titre test (results must meet minimum antibody level)", group: "Before you travel" },
      { id: "pet_au_5", label: "Complete all required blood tests, parasite treatments, and vaccinations per Australia's schedule", group: "Before you travel" },
      { id: "pet_au_6", label: "Veterinary health certificate issued within 5 days of export", group: "Before you travel" },
      { id: "pet_au_7", label: "Book quarantine space at the Post Entry Quarantine facility (Mickleham or other approved facility)", group: "Before you travel" },
      { id: "pet_au_8", label: "Arrange transport with an approved airline or pet transport company", group: "Before you travel" },
      { id: "pet_au_9", label: "Complete 10-day minimum quarantine at government facility", group: "On arrival" },
      { id: "pet_au_10", label: "Register pet with your local council (required in most states and territories)", group: "After arrival" },
      { id: "pet_au_11", label: "Register with a local veterinarian in Australia", group: "After arrival" },
    ],
    breedNote: "Australia prohibits the import of certain dog breeds, including Pit Bull Terrier, Dogo Argentino, Fila Brasileiro, Japanese Tosa, and Perro de Presa Canario. These breeds cannot enter Australia under any circumstances.",
  },
};

export function getPetRequirements(countrySlug: string): CountryPetData | null {
  return PET_DATA[countrySlug] ?? null;
}
