export type QuizAnswer = "yes" | "somewhat" | "no";
export type RegionPreference = "southern_europe" | "northern_europe" | "latin_america" | "other";
export type Tier = "dreaming" | "exploring" | "ready";

export interface QuizQuestion {
  id: number;
  text: string;
  category: string;
  type: "yesno" | "region";
  options: { label: string; value: string; emoji?: string }[];
}

export interface QuizResult {
  tier: Tier;
  score: number;
  regionPreference: RegionPreference;
  topMatch: TopMatch;
  risks: string[];
}

export interface TopMatch {
  name: string;
  flag: string;
  description: string;
  slug: string | null;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    text: "Do you have enough savings to cover at least 6 months of expenses abroad without working?",
    category: "Financial Runway",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 2,
    text: "Have you researched the visa or residency pathway you would use?",
    category: "Visa Readiness",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 3,
    text: "Do you have a reliable source of remote income or a job offer in your destination country?",
    category: "Income Security",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 4,
    text: "Have you looked into the healthcare system or insurance requirements in your target country?",
    category: "Healthcare Planning",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 5,
    text: "Do you have a plan for handling taxes in both your home and destination country?",
    category: "Tax Strategy",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 6,
    text: "Have you visited your target country for more than a short vacation?",
    category: "Destination Familiarity",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 7,
    text: "Do you have a support network or community connections in your destination?",
    category: "Social Network",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 8,
    text: "Have you started gathering required documents (apostilles, background checks, translations)?",
    category: "Document Readiness",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 9,
    text: "Which region appeals to you most?",
    category: "Region Preference",
    type: "region",
    options: [
      { label: "Southern Europe (Portugal, Spain)", value: "southern_europe", emoji: "\u{1F1F5}\u{1F1F9}\u{1F1EA}\u{1F1F8}" },
      { label: "Northern Europe (UK, Ireland)", value: "northern_europe", emoji: "\u{1F1EC}\u{1F1E7}\u{1F1EE}\u{1F1EA}" },
      { label: "Latin America (Mexico, Costa Rica)", value: "latin_america", emoji: "\u{1F1F2}\u{1F1FD}\u{1F1E8}\u{1F1F7}" },
      { label: "Southeast Asia / Other", value: "other", emoji: "\u{1F30F}" },
    ],
  },
];

const TOP_MATCH_TABLE: Record<string, Record<RegionPreference, TopMatch>> = {
  dreaming: {
    southern_europe: { name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}", description: "Welcoming, affordable, and easy to explore as a starting point.", slug: "portugal" },
    northern_europe: { name: "Ireland", flag: "\u{1F1EE}\u{1F1EA}", description: "English-speaking, friendly, and a great base for European life.", slug: "ireland" },
    latin_america: { name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}", description: "Low cost of living, vibrant culture, and close to home.", slug: null },
    other: { name: "Chiang Mai, Thailand", flag: "\u{1F1F9}\u{1F1ED}", description: "Digital nomad hub with incredible affordability.", slug: null },
  },
  exploring: {
    southern_europe: { name: "Spain", flag: "\u{1F1EA}\u{1F1F8}", description: "Rich culture, strong expat infrastructure, and digital nomad visa options.", slug: "spain" },
    northern_europe: { name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", description: "Global city access, clear visa pathways for skilled workers.", slug: "united-kingdom" },
    latin_america: { name: "Costa Rica", flag: "\u{1F1E8}\u{1F1F7}", description: "Stable, welcoming, with growing expat infrastructure.", slug: "costa-rica" },
    other: { name: "Bali, Indonesia", flag: "\u{1F1EE}\u{1F1E9}", description: "Popular remote work destination with a thriving community.", slug: null },
  },
  ready: {
    southern_europe: { name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}", description: "Algarve or Lisbon — well-established pathways and expat communities.", slug: "portugal" },
    northern_europe: { name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", description: "Clear visa system, global opportunities, strong legal framework.", slug: "united-kingdom" },
    latin_america: { name: "Colombia", flag: "\u{1F1E8}\u{1F1F4}", description: "Medell\u00EDn offers modern infrastructure and low cost of living.", slug: null },
    other: { name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}", description: "Da Nang — emerging hub with low costs and growing digital scene.", slug: null },
  },
};

function rawScore(answer: QuizAnswer, questionId: number): number {
  if (questionId <= 3) {
    const base = answer === "yes" ? 3 : answer === "somewhat" ? 1.5 : 0;
    return base * 1.5;
  }
  const base = answer === "yes" ? 2 : answer === "somewhat" ? 1 : 0;
  return base * 1;
}

export function calculateQuizResult(
  answers: Record<number, string>
): QuizResult {
  let weightedRaw = 0;
  const risks: string[] = [];

  for (let i = 1; i <= 8; i++) {
    const answer = (answers[i] ?? "no") as QuizAnswer;
    weightedRaw += rawScore(answer, i);
    if (answer === "no") {
      const q = QUIZ_QUESTIONS.find((q) => q.id === i);
      if (q) risks.push(q.category);
    }
  }

  const weightedMax = 23.5;
  const displayScore = Math.min(16, Math.round((weightedRaw / weightedMax) * 16));

  let tier: Tier;
  if (displayScore <= 5) tier = "dreaming";
  else if (displayScore <= 10) tier = "exploring";
  else tier = "ready";

  const regionPreference = (answers[9] ?? "southern_europe") as RegionPreference;
  const topMatch = TOP_MATCH_TABLE[tier][regionPreference];

  return { tier, score: displayScore, regionPreference, topMatch, risks };
}

export const TIER_LABELS: Record<Tier, string> = {
  dreaming: "Dreaming",
  exploring: "Exploring",
  ready: "Ready to Act",
};

export const TIER_DESCRIPTIONS: Record<Tier, string> = {
  dreaming: "You're in the early stages — lots of ideas, not much concrete planning yet. That's perfectly fine.",
  exploring: "You've started doing real research. A few key gaps remain before you're ready to commit.",
  ready: "You've done serious homework. You're close to pulling the trigger on a move.",
};

export function getGapMessage(risks: string[]): string {
  if (risks.length === 0) return "No critical gaps identified - focus on timeline.";
  if (risks.length === 1) return `Your main blocker is ${risks[0]}. Address this before committing.`;
  if (risks.length === 2) return `Focus on ${risks[0]} and ${risks[1]} - these are your highest-risk gaps.`;
  return `You have several gaps to close. Start with ${risks[0]}.`;
}

export const GUIDE_COUNTRIES = new Set([
  "portugal", "spain", "costa-rica", "canada", "panama",
  "ecuador", "malta", "united-kingdom", "germany", "ireland", "australia",
]);

export function hasFullGuide(slug: string | null): boolean {
  if (!slug) return false;
  return GUIDE_COUNTRIES.has(slug);
}
