export type { Region, Country } from "@/data/countries";
export type { ResourceCategory } from "@/data/resources";
export type { CommunityLinkType } from "@/data/community";

export type {
  ConfidenceLevel,
  ChangeLogEntry,
  DecisionBriefMeta,
  ReviewTriggerResult,
  SourceWarning,
} from "./briefHelpers";

export type { Severity, MandatoryReviewField } from "./severity";

export type Resource = {
  id: string;
  countrySlug: string;
  label: string;
  note?: string;
  url: string;
  sourceType?: "official" | "community" | "expert";
  category?: "visa" | "tax" | "housing" | "healthcare" | "work";
  tags?: string[];
  lastReviewedAt?: string;
  updatedAt?: string;
};

export type Vendor = {
  id: string;
  countrySlug: string;
  name: string;
  category: string;
  url: string;
  note?: string;
  tags?: string[];
  lastReviewedAt?: string;
  updatedAt?: string;
};

export type CommunityLink = {
  id: string;
  countrySlug: string;
  name: string;
  type: "Meetups" | "Forums" | "Facebook" | "Expat groups" | "General" | "Discord" | "WhatsApp";
  url: string;
  note?: string;
  tags?: string[];
  lastReviewedAt?: string;
  updatedAt?: string;
};

export type Pathway = {
  id: string;
  countrySlug: string;
  key: string;
  title: string;
  summary: string;
  whoFor: string[];
  notFor: string[];
  premium: boolean;
  officialLinks: { label: string; url: string }[];
  steps?: string[];
  timeline?: string;
  costRange?: string;
  tags?: string[];
  lastReviewedAt?: string;
  updatedAt?: string;
};
