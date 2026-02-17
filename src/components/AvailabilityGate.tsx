import { useRouter } from "expo-router";
import React, { type ReactNode, useMemo } from "react";
import { isLaunchCountry, isSectionReady, type CoverageSection } from "@/src/data/coverage";
import { getCountry } from "@/src/data";
import { ComingSoon } from "./ComingSoon";

type AvailabilityGateProps = {
  countrySlug?: string;
  pathwayKey?: string;
  section: CoverageSection;
  children: ReactNode;
};

const SECTION_LABELS: Record<CoverageSection, string> = {
  brief: "Decision Briefs",
  resources: "Resources",
  vendors: "Vendors",
  community: "Community",
  pathway: "Pathway guides",
};

export function AvailabilityGate({
  countrySlug,
  section,
  children,
}: AvailabilityGateProps) {
  const router = useRouter();

  const countryName = useMemo(() => {
    if (!countrySlug) return "this country";
    return getCountry(countrySlug)?.name ?? "this country";
  }, [countrySlug]);

  if (!countrySlug) {
    return <>{children}</>;
  }

  if (!isLaunchCountry(countrySlug)) {
    return (
      <ComingSoon
        title="Coming Soon"
        message={`Full ${SECTION_LABELS[section].toLowerCase()} coverage for ${countryName} is being built. Complete guides will be available here soon.`}
        ctaLabel="Browse available countries"
        onPressCta={() => router.push("/(tabs)/country" as any)}
      />
    );
  }

  if (!isSectionReady(countrySlug, section)) {
    return (
      <ComingSoon
        title="Coming Soon"
        message={`${SECTION_LABELS[section]} for ${countryName} are being prepared. Decision Briefs and pathway guides are available now.`}
        ctaLabel="View pathways"
        onPressCta={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push({ pathname: "/(tabs)/country/[slug]", params: { slug: countrySlug } } as any);
          }
        }}
      />
    );
  }

  return <>{children}</>;
}
