export const GENERIC_PLAN_STEP_IDS = [
  "research_quiz",
  "shortlist_built",
  "visa_pathway",
  "visa_selected",
  "finances_reviewed",
  "tax_research",
  "housing_research",
  "school_research",
  "flight_booked",
  "move_date_set",
] as const;

export type GenericPlanStepId = (typeof GENERIC_PLAN_STEP_IDS)[number];
