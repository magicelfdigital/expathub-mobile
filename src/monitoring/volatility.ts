import type { MonitorTarget } from "./types";

const HIGH_VOLATILITY_TARGETS: {
  countrySlug: string;
  pathwayKey?: string;
}[] = [
  { countrySlug: "united-kingdom", pathwayKey: "skilled-worker" },
  { countrySlug: "canada", pathwayKey: "express-entry" },
  { countrySlug: "spain", pathwayKey: "dnv" },
  { countrySlug: "portugal", pathwayKey: "d8" },
];

export function isHighVolatility(target: MonitorTarget): boolean {
  return HIGH_VOLATILITY_TARGETS.some(
    (t) =>
      t.countrySlug === target.countrySlug &&
      (t.pathwayKey === undefined || t.pathwayKey === target.pathwayKey)
  );
}

export type CheckFrequency = "weekly" | "triweekly";

export function recommendedCheckFrequency(
  target: MonitorTarget
): CheckFrequency {
  return isHighVolatility(target) ? "triweekly" : "weekly";
}
