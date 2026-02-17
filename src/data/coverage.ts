import { getPathwaysForCountry } from "@/data/pathways";

export type CoverageStatus = "decision-ready" | "coming-soon";

export type CoverageSection = "brief" | "resources" | "vendors" | "community" | "pathway";

export type CoverageItem = {
  countrySlug: string;
  pathwayKey?: string;
  status: CoverageStatus;
  label: string;
};

type CountryCoverage = {
  pathways: Record<string, CoverageStatus>;
  sections: Partial<Record<CoverageSection, CoverageStatus>>;
};

const COVERAGE_MAP: Record<string, CountryCoverage> = {
  portugal: {
    pathways: { _country: "decision-ready", d7: "decision-ready", d8: "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "decision-ready", vendors: "decision-ready", community: "decision-ready" },
  },
  spain: {
    pathways: { _country: "decision-ready", nlv: "decision-ready", dnv: "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "decision-ready", vendors: "decision-ready", community: "decision-ready" },
  },
  canada: {
    pathways: { _country: "decision-ready", "express-entry": "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "decision-ready", vendors: "decision-ready", community: "decision-ready" },
  },
  "costa-rica": {
    pathways: { _country: "decision-ready", rentista: "decision-ready", pensionado: "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "decision-ready", vendors: "decision-ready", community: "decision-ready" },
  },
  panama: {
    pathways: { _country: "decision-ready", "friendly-nations": "decision-ready", pensionado: "decision-ready", "self-economic-solvency": "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "coming-soon", vendors: "coming-soon", community: "coming-soon" },
  },
  ecuador: {
    pathways: { _country: "decision-ready", rentista: "decision-ready", jubilado: "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "coming-soon", vendors: "coming-soon", community: "coming-soon" },
  },
  malta: {
    pathways: { _country: "decision-ready", "digital-nomad": "decision-ready", grp: "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "coming-soon", vendors: "coming-soon", community: "coming-soon" },
  },
  "united-kingdom": {
    pathways: { _country: "decision-ready", "skilled-worker": "decision-ready", "global-talent": "decision-ready", "innovator-founder": "decision-ready" },
    sections: { brief: "decision-ready", pathway: "decision-ready", resources: "coming-soon", vendors: "coming-soon", community: "coming-soon" },
  },
};

const LAUNCH_COUNTRIES = [
  "portugal",
  "spain",
  "canada",
  "costa-rica",
  "panama",
  "ecuador",
  "malta",
  "united-kingdom",
];

export function isLaunchCountry(countrySlug: string): boolean {
  return LAUNCH_COUNTRIES.includes(countrySlug);
}

export function isDecisionReady(
  countrySlug: string,
  pathwayKey?: string,
  section?: CoverageSection
): boolean {
  if (!isLaunchCountry(countrySlug)) return false;

  const entry = COVERAGE_MAP[countrySlug];
  if (!entry) return false;

  if (section) {
    const sectionStatus = entry.sections[section];
    return sectionStatus === "decision-ready";
  }

  if (pathwayKey) {
    return entry.pathways[pathwayKey] === "decision-ready";
  }

  return entry.pathways._country === "decision-ready";
}

export function isSectionReady(countrySlug: string, section: CoverageSection): boolean {
  return isDecisionReady(countrySlug, undefined, section);
}

export function getCountryCoverage(countrySlug: string): {
  ready: CoverageItem[];
  soon: CoverageItem[];
} {
  const ready: CoverageItem[] = [];
  const soon: CoverageItem[] = [];

  const entry = COVERAGE_MAP[countrySlug];
  if (!entry) return { ready, soon };

  const pathways = getPathwaysForCountry(countrySlug);

  for (const pw of pathways) {
    if (!pw.premium) continue;
    const status = entry.pathways[pw.key] ?? "coming-soon";
    const item: CoverageItem = {
      countrySlug,
      pathwayKey: pw.key,
      status,
      label: pw.title,
    };
    if (status === "decision-ready") {
      ready.push(item);
    } else {
      soon.push(item);
    }
  }

  if (ready.length === 0 && soon.length === 0 && entry.pathways._country === "coming-soon") {
    soon.push({
      countrySlug,
      status: "coming-soon",
      label: "All pathways",
    });
  }

  return { ready, soon };
}

export const COVERAGE_SUMMARY = {
  ready: "Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, UK",
  soon: "France, Italy, Thailand, Mexico, and more",
};
