import { COUNTRIES } from "@/data/countries";
import { getPathwaysForCountry } from "@/data/pathways";

export type ProOffer = {
  headline: string;
  bullets: string[];
  mistakesAvoided: string[];
  notFor: string[];
  ctaLabel: string;
};

const GENERIC_BULLETS = [
  "Clear answers on remote work vs local employment for each pathway",
  "Whether a visa requires employer sponsorship — and what that means for your timeline",
  "Which options block future work authorization or close doors later",
  "Common reviewer scrutiny points that cause rejections even when you qualify",
  "When a temporary visa becomes a dead end with no transition path",
];

const GENERIC_MISTAKES = [
  "Choosing a visa that blocks your ability to work — then needing to start over",
  "Assuming remote work is allowed when the visa explicitly prohibits it",
  "Missing sponsorship requirements until after you've committed months to an application",
  "Picking a pathway that has no transition to permanent residency when that's your goal",
  "Underestimating enforcement risk on work restrictions that seem unenforced",
];

const GENERIC_NOT_FOR = [
  "People planning a tourist trip under 90 days",
  "People who already have a working end-to-end plan and just need links",
];

function decisionBriefSpainNLV(countryName: string): ProOffer {
  return {
    headline: `Spain Non-Lucrative Visa: what work is actually off-limits and why it matters`,
    bullets: [
      "Exactly what 'no work' means — remote, freelance, and self-employed all prohibited",
      "What reviewers scrutinize when your income looks like it comes from active work",
      "Why NLV quietly closes the door on future work authorization in Spain",
      "When the Digital Nomad Visa with Beckham Law is the better fit for your profile",
      "Sponsorship-free but employment-blocked: the real trade-off most applicants miss",
    ],
    mistakesAvoided: [
      "Treating remote or freelance work as acceptable under NLV — it is not",
      "Choosing NLV over Digital Nomad Visa without understanding the work authorization gap",
      "Applying without a documentation story a reviewer can verify quickly",
      "Missing the Beckham Law tax advantage that makes DNV financially superior for workers",
      "Locking into a no-work visa when your income depends on active work",
    ],
    notFor: [
      "Freelancers or consultants who plan to continue active client work in Spain",
      "Anyone who needs flexibility to work legally without a visa change later",
      "Applicants whose income is recent, irregular, or hard to document cleanly",
    ],
    ctaLabel: "Access Decision Brief",
  };
}

function decisionBriefPortugalD7D8(countryName: string): ProOffer {
  return {
    headline: `Portugal D7 vs D8: one allows work, one doesn't — pick wrong and you start over`,
    bullets: [
      "A clear decision rule: passive-only income (D7) vs active remote work (D8)",
      "What work is allowed on each visa — and what gets your renewal rejected",
      "Sponsorship not required for either, but local employment is blocked on both",
      "Which visa has a realistic path to permanent residency for your situation",
      "Why choosing the wrong one means restarting from scratch with a new application",
    ],
    mistakesAvoided: [
      "Choosing D7 while earning income from active work — even remotely",
      "Choosing D8 when your income is genuinely passive and D7 is simpler",
      "Assuming you can switch between D7 and D8 later without a full new application",
      "Submitting income evidence that's technically true but triggers reviewer scrutiny",
      "Ignoring the AIMA backlog that adds 6-18 months to your residency card timeline",
    ],
    notFor: [
      "Applicants who want to work for a Portuguese employer — neither visa allows this",
      "People who can't produce 12+ months of clean, sourced income documentation",
    ],
    ctaLabel: "Access Decision Brief",
  };
}

function decisionBriefDigitalNomadRejections(countryName: string, pathwayTitle?: string): ProOffer {
  const title = pathwayTitle ?? "Digital Nomad Visa";
  return {
    headline: `${title}: what work is allowed, what isn't, and why qualified people get rejected`,
    bullets: [
      "Exactly which types of work are allowed — remote employment, freelance, or both",
      "Whether local employment or local clients are permitted (usually not)",
      "What reviewers scrutinize beyond the income threshold — consistency, contracts, sources",
      "Sponsorship status: not required, but your employer relationship still matters",
      "Whether this visa creates a path to permanent residency or is a dead end",
    ],
    mistakesAvoided: [
      "Meeting the income threshold but failing the stability and continuity check",
      "Submitting fragmented proof from multiple gig clients that looks unstable",
      "Assuming local freelance work is allowed when it's restricted to foreign clients only",
      "Ignoring tax residency obligations that hit after 183 days in-country",
      "Treating a digital nomad visa as a path to permanent residency when it rarely is",
    ],
    notFor: [
      "Applicants with highly irregular income and no clean documentation trail",
      "People who need to work for local employers — this visa blocks that",
    ],
    ctaLabel: "Access Decision Brief",
  };
}

function buildCountryBullets(countryName: string): string[] {
  return [
    `What work is allowed on each ${countryName} visa — remote, self-employed, local employment`,
    "Which pathways require employer sponsorship and which don't",
    "Which visas block future work authorization or close doors on permanent residency",
    "Reviewer scrutiny points that cause rejections even when you qualify on paper",
    "When a different country's pathway is genuinely a better fit for your situation",
  ];
}

function buildPathwayBullets(pathwayTitle: string, countryName: string): string[] {
  return [
    `What work is actually allowed on the ${pathwayTitle} — remote, self-employed, local`,
    "Whether employer sponsorship is required and what that means for your timeline",
    "Whether this pathway transitions to permanent residency or becomes a dead end",
    "Specific reviewer scrutiny points that cause rejections on this visa type",
    "When a different pathway is genuinely better for your profile and goals",
  ];
}

function buildPathwayMistakes(pathwayTitle: string): string[] {
  return [
    `Choosing ${pathwayTitle} when a different pathway fits your work situation better`,
    ...GENERIC_MISTAKES.slice(1),
  ];
}

function defaultNotFor(): string[] {
  return GENERIC_NOT_FOR;
}

export function getProOffer(countrySlug?: string, pathwayKey?: string): ProOffer {
  const country = countrySlug ? COUNTRIES.find((c) => c.slug === countrySlug) : undefined;
  const countryName = country?.name ?? "your target country";

  const pathway =
    countrySlug && pathwayKey
      ? getPathwaysForCountry(countrySlug).find((p) => p.key === pathwayKey)
      : undefined;

  if (countrySlug === "spain" && pathwayKey === "nlv") {
    return decisionBriefSpainNLV(countryName);
  }

  if (countrySlug === "portugal" && (pathwayKey === "d7" || pathwayKey === "d8")) {
    return decisionBriefPortugalD7D8(countryName);
  }

  if (pathwayKey === "dnv" || pathwayKey === "digital-nomad" || pathway?.title?.toLowerCase().includes("digital")) {
    return decisionBriefDigitalNomadRejections(countryName, pathway?.title);
  }

  if (pathway) {
    return {
      headline: `${pathway.title}: what work is allowed and what doors it closes`,
      bullets: buildPathwayBullets(pathway.title, countryName),
      mistakesAvoided: buildPathwayMistakes(pathway.title),
      notFor: pathway.notFor?.length ? pathway.notFor : defaultNotFor(),
      ctaLabel: "Access Decision Brief",
    };
  }

  if (country) {
    return {
      headline: `${countryName}: which visa fits your work situation`,
      bullets: buildCountryBullets(countryName),
      mistakesAvoided: GENERIC_MISTAKES,
      notFor: defaultNotFor(),
      ctaLabel: "Access Decision Brief",
    };
  }

  return {
    headline: "Choose a visa that won't block your ability to work or stay",
    bullets: GENERIC_BULLETS,
    mistakesAvoided: GENERIC_MISTAKES,
    notFor: defaultNotFor(),
    ctaLabel: "Access Decision Brief",
  };
}
