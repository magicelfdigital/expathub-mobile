export type ChecklistItem = {
  id: string;
  label: string;
};

export type PlanStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  checklist: ChecklistItem[];
};

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
    checklist: [
      { id: "pd_1", label: "Listed all required documents for the application" },
      { id: "pd_2", label: "Checked apostille or notarisation requirements for your home country" },
      { id: "pd_3", label: "Arranged certified translations if needed" },
      { id: "pd_4", label: "Confirmed passport validity meets minimum requirements" },
      { id: "pd_5", label: "Obtained background check or police clearance certificate" },
    ],
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
