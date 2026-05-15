// ── Worksheet definitions ────────────────────────────────────────────────
//
// One worksheet per quiz dimension (Q1-Q8). When a user completes a
// worksheet we compute a `dimensionScore` on a 0-3 scale that REPLACES the
// quiz answer's basePoints contribution for that dimension. See
// `calculateQuizResultWithWorksheets` in `src/data/quiz.ts` for how the
// substitution feeds back into the readiness score.
//
// Question types:
//   - `scale`: a 1-5 self-rating. Normalized to 0-1 via (answer - 1) / 4.
//   - `choice`: each option ships its own `score` in [0, 1]. Picked option's
//     score is used directly.
//
// Per-question `weight` controls relative contribution to the worksheet's
// final score. The worksheet's final dimensionScore is:
//
//   3 * sum(normalizedAnswer_i * weight_i) / sum(weight_i)
//
// Choosing 0-1 normalization keeps every question on the same internal
// scale regardless of type, and the final ×3 lands in the same 0-3 range
// as the quiz's basePoints (yes=2 sits comfortably below the worksheet
// ceiling of 3, so a finished worksheet can lift OR lower the dimension).

export type WorksheetQuestionType = "scale" | "choice";

export interface WorksheetChoiceOption {
  label: string;
  value: string;
  /** 0..1 score contribution if this option is selected. */
  score: number;
}

export interface WorksheetQuestion {
  id: string;
  text: string;
  type: WorksheetQuestionType;
  weight: number;
  /** Required when type === "choice". */
  options?: WorksheetChoiceOption[];
  /** Optional helper text shown beneath the question. */
  helper?: string;
}

export interface WorksheetDefinition {
  id: string;
  /** Quiz question id (1-8) this worksheet replaces the score for. */
  questionId: number;
  /** Display name of the dimension (e.g. "Financial Cushion"). */
  dimension: string;
  title: string;
  description: string;
  questions: WorksheetQuestion[];
}

export type WorksheetAnswers = Record<string, string | number>;

const SCALE_OPTIONS_HELPER = "1 = not at all, 5 = completely";

function scaleQ(
  id: string,
  text: string,
  weight = 1,
  helper: string = SCALE_OPTIONS_HELPER,
): WorksheetQuestion {
  return { id, text, type: "scale", weight, helper };
}

function choiceQ(
  id: string,
  text: string,
  options: WorksheetChoiceOption[],
  weight = 1,
): WorksheetQuestion {
  return { id, text, type: "choice", weight, options };
}

export const WORKSHEETS: WorksheetDefinition[] = [
  {
    id: "ws_financial_cushion",
    questionId: 1,
    dimension: "Financial Cushion",
    title: "Your financial cushion",
    description:
      "A short check on the savings buffer you have to land safely in your new country.",
    questions: [
      choiceQ(
        "savings_months",
        "Roughly how many months of living expenses do you have saved?",
        [
          { label: "Less than 3 months", value: "lt3", score: 0 },
          { label: "3 to 6 months", value: "3to6", score: 0.5 },
          { label: "6 to 12 months", value: "6to12", score: 0.85 },
          { label: "12 months or more", value: "gt12", score: 1 },
        ],
        1.5,
      ),
      scaleQ(
        "expenses_priced",
        "How well have you priced out monthly expenses in your target country?",
        1,
      ),
      scaleQ(
        "comfort_drawdown",
        "How comfortable are you using savings during the first months abroad?",
        0.75,
      ),
    ],
  },
  {
    id: "ws_income_stability",
    questionId: 2,
    dimension: "Income Stability",
    title: "Your income stability",
    description:
      "Where your income comes from once you arrive matters as much as how much it is.",
    questions: [
      choiceQ(
        "income_portability",
        "Is your income portable to your destination country?",
        [
          { label: "Fully remote and portable", value: "remote", score: 1 },
          { label: "Partially portable", value: "partial", score: 0.6 },
          { label: "Looking for work there", value: "looking", score: 0.25 },
          { label: "Not portable today", value: "no", score: 0 },
        ],
        1.5,
      ),
      choiceQ(
        "income_tenure",
        "How long has your current income source been stable?",
        [
          { label: "Less than 6 months", value: "lt6", score: 0.25 },
          { label: "6 to 12 months", value: "6to12", score: 0.5 },
          { label: "1 to 3 years", value: "1to3", score: 0.8 },
          { label: "3 years or more", value: "gt3", score: 1 },
        ],
        1,
      ),
      scaleQ(
        "backup_income",
        "Do you have a backup income source if the primary one falls through?",
      ),
    ],
  },
  {
    id: "ws_visa_pathway",
    questionId: 3,
    dimension: "Visa Pathway",
    title: "Your visa pathway",
    description:
      "Clarity on the legal route is usually the difference between dreaming and moving.",
    questions: [
      choiceQ(
        "pathway_identified",
        "Have you identified a specific visa category for yourself?",
        [
          { label: "Yes, a specific one", value: "yes", score: 1 },
          { label: "Narrowed to two or three", value: "narrowed", score: 0.6 },
          { label: "Still exploring", value: "exploring", score: 0.25 },
          { label: "Not yet", value: "no", score: 0 },
        ],
        1.5,
      ),
      scaleQ(
        "requirements_met",
        "How well do you meet that visa's requirements today?",
        1.25,
      ),
      scaleQ(
        "documents_ready",
        "How complete are the documents that visa requires?",
        1,
      ),
    ],
  },
  {
    id: "ws_bureaucracy",
    questionId: 4,
    dimension: "Bureaucracy Comfort",
    title: "Your comfort with bureaucracy",
    description:
      "Relocations involve a lot of forms. Knowing your tolerance helps you plan support.",
    questions: [
      scaleQ(
        "paperwork_comfort",
        "How comfortable are you handling government paperwork in another language?",
      ),
      choiceQ(
        "international_experience",
        "Have you dealt with international bureaucracy before?",
        [
          { label: "Yes, many times", value: "often", score: 1 },
          { label: "Once or twice", value: "few", score: 0.6 },
          { label: "Not yet", value: "no", score: 0.2 },
        ],
        1,
      ),
      choiceQ(
        "willing_to_hire",
        "Are you willing to hire a relocation lawyer or consultant?",
        [
          { label: "Yes, planning to", value: "yes", score: 1 },
          { label: "Maybe, depending on cost", value: "maybe", score: 0.6 },
          { label: "Prefer to handle it myself", value: "no", score: 0.4 },
        ],
        0.75,
      ),
    ],
  },
  {
    id: "ws_family_alignment",
    questionId: 5,
    dimension: "Family Alignment",
    title: "Family and household alignment",
    description:
      "Even a perfect plan stalls if the people moving with you are not on board.",
    questions: [
      choiceQ(
        "partner_aligned",
        "Is your partner or household aligned on the move?",
        [
          { label: "Fully aligned", value: "full", score: 1 },
          { label: "Mostly aligned", value: "mostly", score: 0.7 },
          { label: "Mixed feelings", value: "mixed", score: 0.35 },
          { label: "Not aligned", value: "no", score: 0 },
          { label: "Not applicable", value: "na", score: 1 },
        ],
        1.5,
      ),
      scaleQ(
        "kids_planned",
        "Have schooling and childcare been discussed in detail?",
        1,
      ),
      scaleQ(
        "elders_considered",
        "Have you accounted for aging parents or other dependents?",
        0.75,
      ),
    ],
  },
  {
    id: "ws_lifestyle",
    questionId: 6,
    dimension: "Lifestyle Fit",
    title: "Lifestyle and cultural fit",
    description:
      "How well daily life will match what you actually enjoy and need.",
    questions: [
      scaleQ(
        "daily_life_clarity",
        "How clear are you on what daily life will look like there?",
      ),
      choiceQ(
        "in_country_time",
        "Have you spent meaningful time in the country?",
        [
          { label: "Lived there before", value: "lived", score: 1 },
          { label: "Visited multiple times", value: "multi", score: 0.8 },
          { label: "Visited once", value: "once", score: 0.5 },
          { label: "Never been", value: "never", score: 0.1 },
        ],
        1.25,
      ),
      scaleQ(
        "culture_adaptable",
        "How adaptable are you to a different culture and climate?",
      ),
    ],
  },
  {
    id: "ws_backup_plan",
    questionId: 7,
    dimension: "Backup Plan",
    title: "Your backup plan",
    description:
      "A clear-eyed look at what happens if the move does not work out.",
    questions: [
      choiceQ(
        "return_plan",
        "Do you have a return-home plan if the move does not work out?",
        [
          { label: "Yes, clearly mapped", value: "yes", score: 1 },
          { label: "Partial / loose plan", value: "partial", score: 0.5 },
          { label: "No plan yet", value: "no", score: 0 },
        ],
        1.25,
      ),
      scaleQ(
        "ties_kept",
        "How much will you keep at home (lease, address, banking)?",
        0.75,
      ),
      scaleQ(
        "return_funded",
        "Do you have funds set aside for a possible return move?",
      ),
    ],
  },
  {
    id: "ws_timeline",
    questionId: 8,
    dimension: "Timeline",
    title: "Your timeline",
    description:
      "How firm and realistic the dates are that you are working toward.",
    questions: [
      choiceQ(
        "date_firmness",
        "How firm is your move date?",
        [
          { label: "Locked in", value: "locked", score: 1 },
          { label: "Tentative date", value: "tentative", score: 0.7 },
          { label: "Range only", value: "range", score: 0.4 },
          { label: "No date yet", value: "none", score: 0.1 },
        ],
        1.5,
      ),
      scaleQ(
        "milestones_set",
        "Do you have intermediate milestones set between now and your move?",
        1,
      ),
      scaleQ(
        "timeline_realism",
        "How realistic is your timeline given the visa process you need?",
        1,
      ),
    ],
  },
];

export const WORKSHEET_BY_ID: Record<string, WorksheetDefinition> =
  Object.fromEntries(WORKSHEETS.map((w) => [w.id, w]));

export const WORKSHEET_BY_QUESTION_ID: Record<number, WorksheetDefinition> =
  Object.fromEntries(WORKSHEETS.map((w) => [w.questionId, w]));

/**
 * Compute the dimension score (0-3) for a submitted worksheet.
 *
 * Returns null when the answers are incomplete or the worksheet has no
 * weighted questions to score (defensive — should not happen in practice).
 */
export function scoreWorksheet(
  worksheet: WorksheetDefinition,
  answers: WorksheetAnswers,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const q of worksheet.questions) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === "") return null;
    let normalized: number | null = null;
    if (q.type === "scale") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 5) return null;
      normalized = (n - 1) / 4;
    } else if (q.type === "choice") {
      const picked = q.options?.find((o) => o.value === String(raw));
      if (!picked) return null;
      normalized = Math.max(0, Math.min(1, picked.score));
    }
    if (normalized === null) return null;
    weightedSum += normalized * q.weight;
    totalWeight += q.weight;
  }
  if (totalWeight <= 0) return null;
  const score = 3 * (weightedSum / totalWeight);
  return Math.max(0, Math.min(3, Math.round(score * 100) / 100));
}

/**
 * Best-effort validation that an answers payload only contains keys/values
 * the worksheet expects. Used by the submit route to reject malformed input
 * before it lands in jsonb.
 */
export function validateAnswersShape(
  worksheet: WorksheetDefinition,
  answers: unknown,
): WorksheetAnswers | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const out: WorksheetAnswers = {};
  for (const q of worksheet.questions) {
    const raw = (answers as Record<string, unknown>)[q.id];
    if (raw === undefined || raw === null) return null;
    if (q.type === "scale") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 5) return null;
      out[q.id] = n;
    } else if (q.type === "choice") {
      const v = String(raw);
      if (!q.options?.some((o) => o.value === v)) return null;
      out[q.id] = v;
    }
  }
  return out;
}
