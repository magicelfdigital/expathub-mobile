export type QuizAnswer = "yes" | "somewhat" | "not_sure" | "no";
export type RegionPreference = "southern_europe" | "northern_europe" | "latin_america" | "other";
export type Tier = "dreaming" | "exploring" | "ready";
export type BlockerLevel = "critical" | "moderate" | "explore";

export interface QuizQuestion {
  id: number;
  text: string;
  category: string;
  type: "yesno" | "region";
  options: { label: string; value: string; emoji?: string; notSure?: boolean }[];
}

export interface Blocker {
  questionId: number;
  level: BlockerLevel;
  title: string;
  whatThisMeans: string;
  firstAction: string;
  guideMeLabel: string;
}

export interface QuizResult {
  tier: Tier;
  score: number;
  regionPreference: RegionPreference;
  topMatch: TopMatch;
  risks: string[];
  blockers: Blocker[];
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
    category: "Financial Cushion",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 2,
    text: "Do you have a reliable source of remote income or a job offer in your destination country?",
    category: "Income Stability",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 3,
    text: "Have you researched the visa or residency pathway you would use?",
    category: "Visa Pathway",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 4,
    text: "Are you prepared for the paperwork and bureaucracy of an international move?",
    category: "Bureaucracy Tolerance",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 5,
    text: "Is your household (partner, family) aligned and supportive of moving?",
    category: "Family Alignment",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 6,
    text: "Are you comfortable with the lifestyle tradeoffs (slower pace, different conveniences) abroad?",
    category: "Lifestyle Tradeoffs",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 7,
    text: "Do you have an exit strategy or fallback plan if things don't work out?",
    category: "Exit Strategy",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
      { label: "No", value: "no" },
    ],
  },
  {
    id: 8,
    text: "Do you have a realistic target timeline (12\u201324 months) for your move?",
    category: "Timeline Reality",
    type: "yesno",
    options: [
      { label: "Yes", value: "yes" },
      { label: "Somewhat", value: "somewhat" },
      { label: "Not sure yet", value: "not_sure", notSure: true },
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

const REGION_TOP_MATCH: Record<RegionPreference, TopMatch> = {
  southern_europe: {
    name: "Portugal",
    flag: "\u{1F1F5}\u{1F1F9}",
    description: "Algarve \u2014 well-established expat infrastructure, D7 and digital nomad pathways, and a slower, sunnier pace.",
    slug: "portugal",
  },
  northern_europe: {
    name: "United Kingdom",
    flag: "\u{1F1EC}\u{1F1E7}",
    description: "Brighton \u2014 coastal city with strong creative scene, clear visa pathways, and fast access to London.",
    slug: "united-kingdom",
  },
  latin_america: {
    name: "Mexico",
    flag: "\u{1F1F2}\u{1F1FD}",
    description: "Oaxaca and Mexico City \u2014 low cost of living, generous temporary residency, and close to North America.",
    slug: null,
  },
  other: {
    name: "Chiang Mai, Thailand",
    flag: "\u{1F1F9}\u{1F1ED}",
    description: "Long-running digital nomad hub with low costs, warm weather, and a thriving expat community.",
    slug: null,
  },
};

const Q_WEIGHT: Record<number, number> = {
  1: 1.5, 2: 1.5, 3: 1.5,
  4: 1, 5: 1, 6: 1, 7: 1, 8: 1,
};

function basePoints(answer: QuizAnswer): number {
  if (answer === "yes") return 2;
  if (answer === "somewhat" || answer === "not_sure") return 1;
  return 0;
}

const WEIGHTED_MAX = 19;

const BLOCKER_CONTENT: Record<number, Partial<Record<Exclude<QuizAnswer, "yes">, Omit<Blocker, "questionId">>>> = {
  1: {
    somewhat: {
      level: "moderate",
      title: "Financial cushion: partially there",
      whatThisMeans: "Most people underestimate moving costs by 40\u201360%. The real number includes visa fees, flights, shipping or storage, a security deposit, first/last month rent, and a buffer for setup surprises. If you haven't added all of that up against your savings, you don't actually know your runway yet.",
      firstAction: "Build a one-page moving cost estimate. Categories: visa + legal fees, transport, housing setup, 3-month cost-of-living buffer at destination.",
      guideMeLabel: "Help me calculate my real moving budget",
    },
    not_sure: {
      level: "explore",
      title: "Financial cushion: not sure what you need",
      whatThisMeans: "The 6-month rule exists because things go wrong \u2014 visa delays, a bad rental, a medical bill. Six months gives you time to course-correct without panic. The number is different for every destination \u2014 \u20AC2,000/month in Portugal is very different from \u00A33,500/month in Brighton.",
      firstAction: "Pick one target region and look up average monthly expat living costs so you can set a real savings target.",
      guideMeLabel: "Show me cost of living for my top region",
    },
    no: {
      level: "critical",
      title: "Financial cushion: not yet move-ready",
      whatThisMeans: "A move without financial runway is the #1 reason expats return home within 12 months \u2014 not because the country was wrong, but because money stress overrides everything else.",
      firstAction: "Set a savings target and a timeline to hit it. If your target region costs \u20AC2,000/month, your minimum goal is \u20AC12,000 in move-ready savings on top of moving costs.",
      guideMeLabel: "Help me build a savings runway plan",
    },
  },
  2: {
    somewhat: {
      level: "moderate",
      title: "Income portability: partially sorted",
      whatThisMeans: "Most destination visas require proof of stable income for both applicants if applying jointly, and the threshold is usually higher than people expect. Portugal's D7 requires ~\u20AC760/month per person minimum, often more in practice.",
      firstAction: "Map every income source and label each one: fully portable, partially portable, or location-dependent. Then identify the gap between your portable income total and your destination's visa income threshold.",
      guideMeLabel: "Show me income requirements for my target visa",
    },
    not_sure: {
      level: "explore",
      title: "Income portability: not sure what qualifies",
      whatThisMeans: "Legally portable means your income doesn't require you to be physically present in a specific country to earn it. Remote employment, freelance contracts, rental income, dividends, and pensions all typically qualify. A W-2 job where your employer doesn't know you've moved usually doesn't.",
      firstAction: "List your income sources and check them against three questions: Is it location-independent? Is it consistent? Can you document it with bank statements or contracts?",
      guideMeLabel: "Check if my income qualifies",
    },
    no: {
      level: "critical",
      title: "Income portability: needs a plan",
      whatThisMeans: "Location-dependent income is the most common blocker for would-be expats. This needs a concrete transition plan before the move becomes viable.",
      firstAction: "Identify which path fits your situation: negotiate remote with your current employer, transition to freelance, build passive income, or target a destination with a job-seeker visa.",
      guideMeLabel: "Help me map an income transition plan",
    },
  },
  3: {
    somewhat: {
      level: "moderate",
      title: "Visa pathway: still taking shape",
      whatThisMeans: "Knowing the country isn't the same as knowing the visa. Spain alone has six different residency pathways with different income thresholds, processing times, and renewal conditions. The right visa depends on your income type, savings, whether you plan to work locally, and your timeline.",
      firstAction: "Narrow from country to visa type. For each target country, look up the two or three most common expat pathways and check your income and savings against the minimum requirements.",
      guideMeLabel: "Match me to the right visa",
    },
    not_sure: {
      level: "explore",
      title: "Visa pathway: not sure where to start",
      whatThisMeans: "For your target regions there are well-established pathways designed for exactly this profile: financially independent, remote-income, or retired. You don't need a lawyer to start \u2014 you need to know which category you fall into.",
      firstAction: "Start with one question: are you planning to work locally, bring remote income, or live on savings/pension? That single answer determines which visa category applies to you.",
      guideMeLabel: "Help me figure out which visa type I need",
    },
    no: {
      level: "critical",
      title: "Visa pathway: not yet identified",
      whatThisMeans: "Without a legal pathway to stay, everything else is hypothetical. The visa process for most popular expat destinations takes 3\u201312 months from application to approval, and preparation starts well before that.",
      firstAction: "Pick your top region and spend 30 minutes on ExpatHub's visa overview for that region. You're looking for one thing: a visa category where you meet at least 80% of the requirements today.",
      guideMeLabel: "Start my visa research",
    },
  },
  4: {
    somewhat: {
      level: "moderate",
      title: "Bureaucracy tolerance: a real factor",
      whatThisMeans: "The paperwork involved isn't difficult \u2014 it's slow, repetitive, and occasionally contradictory. Apostilles, notarised translations, criminal background checks, bank statements formatted a specific way. The people who struggle most are the ones who try to do it alone.",
      firstAction: "Budget for help. A local gestor (Spain), solicitador (Portugal), or immigration solicitor (UK) costs \u20AC500\u20131,500 and handles the parts most likely to go wrong.",
      guideMeLabel: "What professional help do I need and what does it cost",
    },
    not_sure: {
      level: "explore",
      title: "Bureaucracy: not sure what's involved",
      whatThisMeans: "Most people are surprised by the volume, not the complexity. You're typically dealing with apostilled documents, financial proof, a criminal background check, opening a local bank account before you have an address, and registering with local authorities after arrival. Each step has a sequence.",
      firstAction: "Look at the visa application checklist for your target country. That list tells you exactly what's involved before you commit to anything.",
      guideMeLabel: "Show me what the paperwork process actually looks like",
    },
    no: {
      level: "moderate",
      title: "Bureaucracy tolerance: worth factoring into destination choice",
      whatThisMeans: "Bureaucracy frustration is a genuine quality-of-life issue abroad \u2014 it doesn't end at the visa. Annual renewals, tax filings in two countries, driving licence exchanges, healthcare registration. It's an ongoing reality, not a one-time hurdle.",
      firstAction: "Be honest about whether this is a dealbreaker or a manageable discomfort. Some destinations are significantly easier than others on bureaucracy burden.",
      guideMeLabel: "Show me lower-bureaucracy destinations",
    },
  },
  5: {
    somewhat: {
      level: "moderate",
      title: "Household alignment: open questions to resolve",
      whatThisMeans: "Open questions at this stage are normal \u2014 they usually cluster around schools, leaving family behind, career disruption for a partner, and uncertainty about what daily life actually looks like. These don't need to be resolved before you research, but they do before you apply for anything.",
      firstAction: "Name the open questions explicitly as a household. Sort them into two buckets: questions that research can answer (schools, healthcare, cost of living) and questions that need a values conversation.",
      guideMeLabel: "Help us research the practical open questions",
    },
    not_sure: {
      level: "explore",
      title: "Household alignment: conversation not yet had",
      whatThisMeans: "This is the most important conversation to have before going further \u2014 not because it will derail the plan, but because the answers shape everything else. Which region fits your household depends on school quality, language, climate, proximity to flights home, and more.",
      firstAction: "Have one focused conversation with the framing: if we were going to do this, what would each of us need to feel good about it? That question surfaces the real requirements without turning it into a negotiation.",
      guideMeLabel: "Help me think through what my household needs from a destination",
    },
    no: {
      level: "critical",
      title: "Household alignment: needs work first",
      whatThisMeans: "A move abroad with unresolved household disagreement has a high failure rate \u2014 not because the destination was wrong, but because the stress of relocation amplifies existing tension.",
      firstAction: "Pause the destination research temporarily. Focus on understanding what the resistant or uncertain household member actually needs \u2014 more information, a trial visit, or a different timeline.",
      guideMeLabel: "Help me understand what's driving the hesitation",
    },
  },
  6: {
    somewhat: {
      level: "moderate",
      title: "Lifestyle tradeoffs: some hesitation",
      whatThisMeans: "The tradeoffs that catch people off guard most often aren't the big ones \u2014 they're the small daily friction points. Slower delivery. Healthcare that works differently. Stores closed on Sundays. None are dealbreakers, but worth naming so they don't become sources of resentment.",
      firstAction: "Make a specific list of your top five daily conveniences. Then look up how each one translates in your target region.",
      guideMeLabel: "Show me what daily life actually looks like in my target region",
    },
    not_sure: {
      level: "explore",
      title: "Lifestyle tradeoffs: not sure what changes",
      whatThisMeans: "Most people overestimate the sacrifices and underestimate the gains. The tradeoffs vary enormously by destination. Brighton has next-day delivery and every UK convenience. The Algarve has warm winters and low cost of living but slower logistics. Knowing which tradeoffs apply to your specific target is more useful than worrying in the abstract.",
      firstAction: "Pick your top region and read two or three recent expat accounts from people at a similar life stage. Real accounts of daily life are more useful than any official guide.",
      guideMeLabel: "Show me real expat accounts from my target region",
    },
    no: {
      level: "moderate",
      title: "Lifestyle tradeoffs: a real sticking point",
      whatThisMeans: "If certain conveniences feel non-negotiable, filter destinations by how well they preserve them rather than assuming you'll adapt. Some destinations are significantly more expat-infrastructure-rich \u2014 English widely spoken, international schools, familiar retail, fast internet, good healthcare.",
      firstAction: "Write down the three things you're least willing to give up. Then use that as a filter on destinations rather than a reason to stop.",
      guideMeLabel: "Help me find destinations that fit my lifestyle requirements",
    },
  },
  7: {
    somewhat: {
      level: "moderate",
      title: "Exit strategy: loosely planned",
      whatThisMeans: "A loose plan is fine at this stage. What you're protecting against is being abroad 18 months, things not working out, and discovering you don't know how to get back \u2014 financially, practically, or legally.",
      firstAction: "Spend one hour answering four questions in writing: Can you re-establish residency at home? Do you have a storage unit or family address? What happens to your health insurance? What does re-entry to the job market look like?",
      guideMeLabel: "Walk me through the exit strategy checklist",
    },
    not_sure: {
      level: "explore",
      title: "Exit strategy: haven't thought it through yet",
      whatThisMeans: "Having a clear fallback is what gives you the confidence to actually go. People who know they can come back are more likely to leave in the first place, and more likely to make good decisions once they're there.",
      firstAction: "Answer one question: if you moved abroad and needed to return in 12 months, what would you need to have kept in place to make that possible? That answer is your exit strategy.",
      guideMeLabel: "Help me think through a realistic fallback plan",
    },
    no: {
      level: "moderate",
      title: "No exit strategy yet",
      whatThisMeans: "You don't need a detailed exit plan before you start researching. But before you sign a lease or sell a car, you want to know your re-entry baseline. The cost of not having one shows up as paralysis when small things go wrong abroad.",
      firstAction: "File this as a task for the 6-months-before-move stage, not now. Add it to your move timeline so it doesn't fall through the cracks.",
      guideMeLabel: "Add this to my move timeline",
    },
  },
  8: {
    somewhat: {
      level: "moderate",
      title: "Timeline: outside the 12\u201324 month window",
      whatThisMeans: "Moving sooner than 12 months means compressing the visa application window, which has fixed processing times you can't rush. Moving on a 3+ year horizon often loses momentum \u2014 life fills the gap and the move keeps deferring.",
      firstAction: "Set a target move month \u2014 even a rough one. Then work backwards: when does your visa application need to be submitted? When do you need your financial documents ready?",
      guideMeLabel: "Help me build a backwards timeline from my target date",
    },
    not_sure: {
      level: "explore",
      title: "Timeline: still in the dreaming phase",
      whatThisMeans: "Dreaming is a legitimate and important phase. The risk is staying there indefinitely. The move from dreaming to planning usually happens when one thing becomes concrete: a target region, a specific visa, or a savings number.",
      firstAction: "Pick the one thing that feels most exciting and make it slightly more concrete. If it's a region, research one specific town. If it's a visa, look up the income requirement.",
      guideMeLabel: "Help me take my first concrete step",
    },
    no: {
      level: "explore",
      title: "No timeline yet",
      whatThisMeans: "No timeline usually means the move still feels hypothetical, or there's a real constraint that makes committing to a date feel premature. The goal isn't to force a timeline \u2014 it's to understand which one applies, because the next step is different for each.",
      firstAction: "Ask yourself honestly: is there a specific thing that needs to change before this becomes real? Name it. If you can name it, you can plan for it.",
      guideMeLabel: "Help me figure out what's actually in the way",
    },
  },
};

export function getBlockers(answers: Record<number, string>): Blocker[] {
  const out: Blocker[] = [];
  for (let i = 1; i <= 8; i++) {
    const raw = (answers[i] ?? "no") as QuizAnswer;
    if (raw === "yes") continue;
    const key = (raw === "somewhat" || raw === "not_sure" || raw === "no") ? raw : "no";
    const content = BLOCKER_CONTENT[i]?.[key];
    if (content) {
      out.push({ questionId: i, ...content });
    }
  }
  return out;
}

export function calculateQuizResult(
  answers: Record<number, string>
): QuizResult {
  let weightedRaw = 0;
  const risks: string[] = [];

  for (let i = 1; i <= 8; i++) {
    const answer = (answers[i] ?? "no") as QuizAnswer;
    weightedRaw += basePoints(answer) * (Q_WEIGHT[i] ?? 1);
    if (answer === "no") {
      const q = QUIZ_QUESTIONS.find((q) => q.id === i);
      if (q) risks.push(q.category);
    }
  }

  const displayScore = Math.min(16, Math.round((weightedRaw / WEIGHTED_MAX) * 16));

  let tier: Tier;
  if (displayScore <= 5) tier = "dreaming";
  else if (displayScore <= 11) tier = "exploring";
  else tier = "ready";

  const regionPreference = (answers[9] ?? "southern_europe") as RegionPreference;
  const topMatch = REGION_TOP_MATCH[regionPreference] ?? REGION_TOP_MATCH.southern_europe;
  const blockers = getBlockers(answers);

  return { tier, score: displayScore, regionPreference, topMatch, risks, blockers };
}

export const TIER_LABELS: Record<Tier, string> = {
  dreaming: "Dreaming",
  exploring: "Exploring",
  ready: "Ready to Act",
};

export const TIER_DESCRIPTIONS: Record<Tier, string> = {
  dreaming: "You're in the early stages \u2014 lots of ideas, not much concrete planning yet. That's perfectly fine.",
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
