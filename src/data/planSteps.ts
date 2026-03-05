export type ChecklistItem = {
  id: string;
  label: string;
  group?: string;
};

export type PlanStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  checklist: ChecklistItem[];
  disclaimer?: string;
};

const STEP3_CHECKLISTS: Record<string, ChecklistItem[]> = {
  portugal: [
    { id: "pd_pt_1", label: "Proof of income or pension statements", group: "For your visa application" },
    { id: "pd_pt_2", label: "Private health insurance policy covering Portugal", group: "For your visa application" },
    { id: "pd_pt_3", label: "Criminal record certificate from your home country", group: "For your visa application" },
    { id: "pd_pt_4", label: "Passport-sized photos meeting consulate specifications", group: "For your visa application" },
    { id: "pd_pt_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_pt_6", label: "Apostille or notarisation on home-country documents", group: "For your visa application" },
    { id: "pd_pt_7", label: "NIF (tax identification number) — can be obtained before or after arrival", group: "For your arrival" },
    { id: "pd_pt_8", label: "Proof of address for SEF/AIMA registration", group: "For your arrival" },
    { id: "pd_pt_9", label: "NISS (social security number) application", group: "For your arrival" },
  ],
  spain: [
    { id: "pd_es_1", label: "Proof of income or financial means", group: "For your visa application" },
    { id: "pd_es_2", label: "Private health insurance with no co-payment clause", group: "For your visa application" },
    { id: "pd_es_3", label: "Criminal record certificate from your home country", group: "For your visa application" },
    { id: "pd_es_4", label: "Apostille on all official documents", group: "For your visa application" },
    { id: "pd_es_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_es_6", label: "NIE (foreigner identity number) assignment", group: "For your arrival" },
    { id: "pd_es_7", label: "Empadronamiento (municipal registration at your address)", group: "For your arrival" },
    { id: "pd_es_8", label: "TIE (residency card) appointment and collection", group: "For your arrival" },
  ],
  canada: [
    { id: "pd_ca_1", label: "ECA (educational credential assessment) report", group: "For your visa application" },
    { id: "pd_ca_2", label: "Language test results (IELTS, CELPIP, or TEF)", group: "For your visa application" },
    { id: "pd_ca_3", label: "Police clearance certificate from every country of residence", group: "For your visa application" },
    { id: "pd_ca_4", label: "Immigration medical examination by a designated panel physician", group: "For your visa application" },
    { id: "pd_ca_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_ca_6", label: "SIN (social insurance number) application", group: "For your arrival" },
    { id: "pd_ca_7", label: "Provincial health insurance enrolment", group: "For your arrival" },
    { id: "pd_ca_8", label: "Address confirmation submitted to IRCC", group: "For your arrival" },
  ],
  "costa-rica": [
    { id: "pd_cr_1", label: "Proof of income or pension meeting minimum threshold", group: "For your visa application" },
    { id: "pd_cr_2", label: "Criminal background check from your home country", group: "For your visa application" },
    { id: "pd_cr_3", label: "Apostille on all official documents", group: "For your visa application" },
    { id: "pd_cr_4", label: "Marriage or birth certificates if including dependants", group: "For your visa application" },
    { id: "pd_cr_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_cr_6", label: "DIMEX (residency card) collection", group: "For your arrival" },
    { id: "pd_cr_7", label: "CCSS (social security) enrolment", group: "For your arrival" },
    { id: "pd_cr_8", label: "Cedula registration at local municipality", group: "For your arrival" },
  ],
  panama: [
    { id: "pd_pa_1", label: "Proof of income or pension documentation", group: "For your visa application" },
    { id: "pd_pa_2", label: "Bank deposit confirmation meeting threshold", group: "For your visa application" },
    { id: "pd_pa_3", label: "Criminal record certificate from your home country", group: "For your visa application" },
    { id: "pd_pa_4", label: "Apostille on all official documents", group: "For your visa application" },
    { id: "pd_pa_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_pa_6", label: "Cedula de identidad personal (national ID card)", group: "For your arrival" },
    { id: "pd_pa_7", label: "Social security registration if applicable", group: "For your arrival" },
  ],
  ecuador: [
    { id: "pd_ec_1", label: "Proof of income or pension meeting minimum threshold", group: "For your visa application" },
    { id: "pd_ec_2", label: "Criminal record certificate from your home country", group: "For your visa application" },
    { id: "pd_ec_3", label: "Apostille on all official documents", group: "For your visa application" },
    { id: "pd_ec_4", label: "Passport validity confirmation (minimum 6 months)", group: "For your visa application" },
    { id: "pd_ec_5", label: "Cedula (national ID) registration", group: "For your arrival" },
    { id: "pd_ec_6", label: "SRI (tax authority) registration", group: "For your arrival" },
    { id: "pd_ec_7", label: "IESS (social security) enrolment if working", group: "For your arrival" },
  ],
  malta: [
    { id: "pd_mt_1", label: "Proof of income or financial self-sufficiency", group: "For your visa application" },
    { id: "pd_mt_2", label: "Private health insurance covering Malta", group: "For your visa application" },
    { id: "pd_mt_3", label: "Proof of accommodation in Malta", group: "For your visa application" },
    { id: "pd_mt_4", label: "Criminal record certificate from your home country", group: "For your visa application" },
    { id: "pd_mt_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_mt_6", label: "e-Residency card collection", group: "For your arrival" },
    { id: "pd_mt_7", label: "TIN (tax identification number) registration", group: "For your arrival" },
    { id: "pd_mt_8", label: "Healthcare registration with local authorities", group: "For your arrival" },
  ],
  "united-kingdom": [
    { id: "pd_uk_1", label: "English language proficiency evidence (if required)", group: "For your visa application" },
    { id: "pd_uk_2", label: "Financial evidence meeting maintenance threshold", group: "For your visa application" },
    { id: "pd_uk_3", label: "Sponsor letter or certificate of sponsorship (if applicable)", group: "For your visa application" },
    { id: "pd_uk_4", label: "Biometric enrolment at a visa application centre", group: "For your visa application" },
    { id: "pd_uk_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_uk_6", label: "BRP (biometric residence permit) collection", group: "For your arrival" },
    { id: "pd_uk_7", label: "NHS surcharge confirmation and GP registration", group: "For your arrival" },
    { id: "pd_uk_8", label: "National Insurance number application", group: "For your arrival" },
  ],
  germany: [
    { id: "pd_de_1", label: "Employment contract or Blue Card sponsorship documentation", group: "For your visa application" },
    { id: "pd_de_2", label: "Qualification recognition documents (if applicable)", group: "For your visa application" },
    { id: "pd_de_3", label: "Health insurance proof meeting German requirements", group: "For your visa application" },
    { id: "pd_de_4", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_de_5", label: "Anmeldung (address registration) at local Burgeramt", group: "For your arrival" },
    { id: "pd_de_6", label: "Steuer-ID (tax identification number) receipt", group: "For your arrival" },
    { id: "pd_de_7", label: "Residence permit appointment at Auslanderbehorde", group: "For your arrival" },
  ],
  ireland: [
    { id: "pd_ie_1", label: "Employment contract from Irish employer", group: "For your visa application" },
    { id: "pd_ie_2", label: "Critical skills or general employment permit documentation", group: "For your visa application" },
    { id: "pd_ie_3", label: "Proof of accommodation in Ireland", group: "For your visa application" },
    { id: "pd_ie_4", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_ie_5", label: "IRP (Irish Residence Permit) card registration", group: "For your arrival" },
    { id: "pd_ie_6", label: "PPS (Personal Public Service) number application", group: "For your arrival" },
    { id: "pd_ie_7", label: "Bank account setup with required documents", group: "For your arrival" },
  ],
  australia: [
    { id: "pd_au_1", label: "Skills assessment from relevant assessing authority", group: "For your visa application" },
    { id: "pd_au_2", label: "Health examination by an approved panel physician", group: "For your visa application" },
    { id: "pd_au_3", label: "English language proficiency results (IELTS, PTE, or equivalent)", group: "For your visa application" },
    { id: "pd_au_4", label: "Police clearance certificate from every country of residence", group: "For your visa application" },
    { id: "pd_au_5", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
    { id: "pd_au_6", label: "TFN (tax file number) application", group: "For your arrival" },
    { id: "pd_au_7", label: "Medicare enrolment (if eligible under reciprocal agreement)", group: "For your arrival" },
    { id: "pd_au_8", label: "Address registration with relevant authorities", group: "For your arrival" },
  ],
};

const STEP3_DISCLAIMER = "Requirements may change. Always verify current criteria with official sources.";

const DEFAULT_STEP3_CHECKLIST: ChecklistItem[] = [
  { id: "pd_1", label: "Listed all required documents for the application", group: "For your visa application" },
  { id: "pd_2", label: "Checked apostille or notarisation requirements for your home country", group: "For your visa application" },
  { id: "pd_3", label: "Arranged certified translations if needed", group: "For your visa application" },
  { id: "pd_4", label: "Confirmed passport validity meets minimum requirements", group: "For your visa application" },
  { id: "pd_5", label: "Obtained background check or police clearance certificate", group: "For your visa application" },
];

export function getStep3Checklist(countrySlug: string | null): ChecklistItem[] {
  if (!countrySlug) return DEFAULT_STEP3_CHECKLIST;
  return STEP3_CHECKLISTS[countrySlug] ?? DEFAULT_STEP3_CHECKLIST;
}

export const PLAN_STEPS: PlanStep[] = [
  {
    id: "confirm_pathway",
    number: 1,
    title: "Confirm Your Legal Pathway",
    description: "Make sure this visa category fits your situation and long-term goals.",
    checklist: [
      { id: "cp_1", label: "Reviewed visa category requirements and eligibility" },
      { id: "cp_2", label: "Confirmed this pathway aligns with your work and income situation" },
      { id: "cp_3", label: "Checked whether dependants can be included" },
      { id: "cp_4", label: "Reviewed pathway duration, renewal terms, and path to residency" },
    ],
  },
  {
    id: "validate_finances",
    number: 2,
    title: "Validate Financial Requirements",
    description: "Review income, savings, and cost thresholds to ensure the numbers work.",
    checklist: [
      { id: "vf_1", label: "Identified minimum income or savings thresholds" },
      { id: "vf_2", label: "Checked whether passive income, remote salary, or pension qualifies" },
      { id: "vf_3", label: "Estimated cost of living in your destination" },
      { id: "vf_4", label: "Reviewed any required bank statements or proof-of-funds format" },
    ],
  },
  {
    id: "prepare_docs",
    number: 3,
    title: "Prepare Core Documentation",
    description: "Identify required documents and begin gathering them early.",
    checklist: DEFAULT_STEP3_CHECKLIST,
    disclaimer: STEP3_DISCLAIMER,
  },
  {
    id: "execute_residency",
    number: 4,
    title: "Execute the Residency Process",
    description: "Understand where and how to apply, including appointments and approvals.",
    checklist: [
      { id: "er_1", label: "Identified the correct consulate or embassy for your application" },
      { id: "er_2", label: "Booked an appointment or submitted the online application" },
      { id: "er_3", label: "Paid application fees" },
      { id: "er_4", label: "Tracked application status and timeline" },
      { id: "er_5", label: "Received approval or visa stamp" },
    ],
  },
  {
    id: "register_local",
    number: 5,
    title: "Register and Activate Local Systems",
    description: "Plan for tax registration, healthcare enrolment, and local requirements.",
    checklist: [
      { id: "rl_1", label: "Registered with local municipality or civil registry" },
      { id: "rl_2", label: "Obtained tax identification number" },
      { id: "rl_3", label: "Enrolled in healthcare system or obtained health insurance" },
      { id: "rl_4", label: "Opened a local bank account" },
      { id: "rl_5", label: "Registered your address with local authorities" },
    ],
  },
  {
    id: "post_arrival",
    number: 6,
    title: "Post-Arrival Compliance",
    description: "Stay aligned with renewal rules and residency obligations.",
    checklist: [
      { id: "pa_1", label: "Noted renewal dates and deadlines" },
      { id: "pa_2", label: "Understood minimum stay requirements" },
      { id: "pa_3", label: "Set up tax filing obligations in destination country" },
      { id: "pa_4", label: "Reviewed ongoing reporting or compliance obligations" },
    ],
  },
];
