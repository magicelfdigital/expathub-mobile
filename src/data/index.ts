import { COUNTRIES, REGION_ORDER, sortCountriesAlpha } from "@/data/countries";
import { RESOURCES, getResourcesForCountry } from "@/data/resources";
import { VENDORS, getVendorsForCountry } from "@/data/vendors";
import {
  COMMUNITY,
  getCommunityForCountry,
  DEFAULT_COMMUNITY,
} from "@/data/community";
import { PATHWAYS, getPathwaysForCountry } from "@/data/pathways";

import type {
  Resource,
  Vendor,
  CommunityLink,
  Pathway,
  Region,
  Country,
  ResourceCategory,
  CommunityLinkType,
} from "./types";

export type {
  Resource,
  Vendor,
  CommunityLink,
  Pathway,
  Region,
  Country,
  ResourceCategory,
  CommunityLinkType,
};

export { REGION_ORDER, sortCountriesAlpha };

export { getProOffer } from "./pro-offer";
export type { ProOffer } from "./pro-offer";

export { getDecisionBrief, getDecisionBriefsForCountry } from "./decisionBriefs";
export type { DecisionBrief } from "./decisionBriefs";
export type { ConfidenceLevel as DisplayConfidenceLevel } from "./decisionBriefs";

export {
  computeConfidenceLevel,
  checkMandatoryReviewTrigger,
  validateSourceLinks,
  validateChangeLogEntry,
} from "./briefHelpers";
export type {
  ConfidenceLevel,
  ChangeLogEntry,
  DecisionBriefMeta,
  ReviewTriggerResult,
  SourceWarning,
} from "./briefHelpers";

export { SEVERITY_DEFINITIONS, MANDATORY_REVIEW_FIELDS } from "./severity";
export type { Severity, MandatoryReviewField } from "./severity";

export {
  isDecisionReady,
  isLaunchCountry,
  isSectionReady,
  getCountryCoverage,
  COVERAGE_SUMMARY,
} from "./coverage";
export type { CoverageStatus, CoverageSection, CoverageItem } from "./coverage";

export { getCompareMatrix, getCompareCountrySlugs } from "./compareMatrix";
export type { CompareRow } from "./compareMatrix";

function resourceId(slug: string, index: number): string {
  return `${slug}-res-${index}`;
}

function vendorId(slug: string, index: number): string {
  return `${slug}-ven-${index}`;
}

function communityId(slug: string, index: number): string {
  return `${slug}-com-${index}`;
}

function pathwayId(slug: string, key: string): string {
  return `${slug}-pw-${key}`;
}

export function getCountries(): Country[] {
  return COUNTRIES;
}

export function getCountry(slug: string): Country | undefined {
  return COUNTRIES.find((c) => c.slug === slug);
}

export function getCountriesByRegion(region: Region): Country[] {
  return COUNTRIES.filter((c) => c.region === region);
}

export function getPopularCountries(): Country[] {
  return COUNTRIES.filter((c) => c.popular).sort(sortCountriesAlpha);
}

export function getResources(countrySlug: string): Resource[] {
  return getResourcesForCountry(countrySlug).map((r, i) => ({
    ...r,
    id: resourceId(countrySlug, i),
    countrySlug,
  }));
}

export function getVendors(countrySlug: string): Vendor[] {
  return getVendorsForCountry(countrySlug).map((v, i) => ({
    ...v,
    id: vendorId(countrySlug, i),
    countrySlug,
  }));
}

export function getCommunityLinks(countrySlug: string): CommunityLink[] {
  return getCommunityForCountry(countrySlug).map((c, i) => ({
    ...c,
    id: communityId(countrySlug, i),
    countrySlug,
  }));
}

export function getDefaultCommunityLinks(): CommunityLink[] {
  return DEFAULT_COMMUNITY.map((c, i) => ({
    ...c,
    id: communityId("default", i),
    countrySlug: "default",
  }));
}

export function getPathways(countrySlug: string): Pathway[] {
  return getPathwaysForCountry(countrySlug).map((p) => ({
    ...p,
    id: pathwayId(countrySlug, p.key),
    countrySlug,
  }));
}

export function getPathway(
  countrySlug: string,
  key: string
): Pathway | undefined {
  const pathways = getPathways(countrySlug);
  return pathways.find((p) => p.key === key);
}
