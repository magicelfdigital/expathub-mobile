import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { DecisionBrief, DisplayConfidenceLevel } from "@/src/data";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

type DecisionBriefCardProps = {
  brief: DecisionBrief;
  countrySlug?: string;
  pathwayKey?: string;
};

const confidenceColors: Record<DisplayConfidenceLevel, { bg: string; border: string; text: string }> = {
  High: { bg: 'rgba(51,196,220,0.08)', border: 'rgba(51,196,220,0.30)', text: tokens.color.teal },
  Medium: { bg: 'rgba(232,153,26,0.08)', border: 'rgba(232,153,26,0.30)', text: tokens.color.gold },
  Conditional: { bg: 'rgba(254,226,226,0.6)', border: 'rgba(254,202,202,0.6)', text: "#991b1b" },
};

function BulletList({
  items,
  icon,
  iconColor,
  iconBg,
}: {
  items: string[];
  icon: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <View style={s.bulletList}>
      {items.map((item) => (
        <View key={item} style={s.bulletRow}>
          <View style={[s.bulletIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={icon as any} size={12} color={iconColor} />
          </View>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function CollapsibleSection({
  title,
  icon,
  iconColor,
  iconBg,
  items,
  sectionId,
  onOpen,
  cardStyle,
  titleStyle,
}: {
  title: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  items: string[];
  sectionId: string;
  onOpen: (id: string) => void;
  cardStyle?: object;
  titleStyle?: object;
}) {
  const [open, setOpen] = useState(false);

  if (!items || items.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpen(sectionId);
  };

  return (
    <Pressable onPress={toggle} style={[s.accordion, cardStyle]}>
      <View style={s.accordionHeader}>
        <View style={s.accordionLeft}>
          <View style={[s.bulletIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={icon as any} size={14} color={iconColor} />
          </View>
          <Text style={[s.accordionTitle, titleStyle]}>{title}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={tokens.color.subtext}
        />
      </View>
      {open && (
        <View style={s.accordionBody}>
          <BulletList items={items} icon={icon} iconColor={iconColor} iconBg={iconBg} />
        </View>
      )}
    </Pressable>
  );
}

export function DecisionBriefCard({ brief, countrySlug, pathwayKey }: DecisionBriefCardProps) {
  const conf = confidenceColors[brief.confidenceLevel];
  const viewedSectionsRef = useRef<Set<string>>(new Set());

  const trackSection = (sectionId: string) => {
    if (viewedSectionsRef.current.has(sectionId)) return;
    viewedSectionsRef.current.add(sectionId);
    trackEvent("brief_section_viewed", {
      countrySlug: countrySlug ?? "unknown",
      pathwayKey: pathwayKey ?? "none",
      sectionId,
    });
  };

  useEffect(() => {
    trackSection("overview");
  }, []);

  return (
    <View style={s.container}>
      <View style={s.headerSection}>
        <View style={s.briefLabel}>
          <Ionicons name="shield-checkmark" size={14} color={tokens.color.primary} />
          <Text style={s.briefLabelText}>Decision Brief</Text>
        </View>
        <Text style={s.headline}>{brief.headline}</Text>
        <Text style={s.summary}>{brief.decisionSummary}</Text>
      </View>

      <View style={[s.confidenceBadge, { backgroundColor: conf.bg, borderColor: conf.border }]}>
        <Ionicons
          name={brief.confidenceLevel === "High" ? "checkmark-circle" : brief.confidenceLevel === "Medium" ? "alert-circle" : "help-circle"}
          size={14}
          color={conf.text}
        />
        <Text style={[s.confidenceText, { color: conf.text }]}>
          {brief.confidenceLevel} confidence
          {brief.confidenceLevel === "Conditional" ? " (program is new or evolving)" : ""}
        </Text>
      </View>

      <View style={s.twoColumn}>
        <View style={s.columnCard}>
          <Text style={s.columnTitle}>Recommended for</Text>
          <BulletList items={brief.recommendedFor} icon="checkmark" iconColor={tokens.color.teal} iconBg={tokens.color.tealLight} />
        </View>
        <View style={[s.columnCard, s.columnCardRed]}>
          <Text style={s.columnTitleRed}>Not recommended for</Text>
          <BulletList items={brief.notRecommendedFor} icon="close" iconColor="#991b1b" iconBg="#fee2e2" />
        </View>
      </View>

      <View style={s.divider} />
      <Text style={s.detailsHint}>Tap any section below to expand</Text>

      <CollapsibleSection
        title="What you actually need"
        icon="document-text"
        iconColor={tokens.color.primary}
        iconBg={tokens.color.primarySoft}
        items={brief.keyRequirements}
        sectionId="requirements"
        onOpen={trackSection}
      />

      <CollapsibleSection
        title="Financial reality"
        icon="card"
        iconColor={tokens.color.gold}
        iconBg={tokens.color.goldLight}
        items={brief.financialReality}
        sectionId="financial"
        onOpen={trackSection}
      />

      <CollapsibleSection
        title="Timeline reality"
        icon="time"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.timelineReality}
        sectionId="timeline"
        onOpen={trackSection}
      />

      <CollapsibleSection
        title="Risk flags"
        icon="warning"
        iconColor="#dc2626"
        iconBg="#fee2e2"
        items={brief.riskFlags}
        sectionId="risks"
        onOpen={trackSection}
        cardStyle={s.riskAccordion}
        titleStyle={s.riskAccordionTitle}
      />

      <CollapsibleSection
        title="Common mistakes"
        icon="alert"
        iconColor={tokens.color.gold}
        iconBg={tokens.color.goldLight}
        items={brief.commonMistakes}
        sectionId="mistakes"
        onOpen={trackSection}
        cardStyle={s.mistakeAccordion}
        titleStyle={s.mistakeAccordionTitle}
      />

      <CollapsibleSection
        title="Work reality"
        icon="briefcase"
        iconColor="#0369a1"
        iconBg="#e0f2fe"
        items={brief.workReality ?? []}
        sectionId="work-reality"
        onOpen={trackSection}
      />

      <CollapsibleSection
        title="Family & dependents"
        icon="people"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.familyAndDependents ?? []}
        sectionId="family"
        onOpen={trackSection}
      />

      <CollapsibleSection
        title="Lifestyle & culture"
        icon="globe"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.lifestyleAndCulture ?? []}
        sectionId="lifestyle"
        onOpen={trackSection}
      />

      {brief.betterAlternatives && brief.betterAlternatives.length > 0 ? (
        <CollapsibleSection
          title="Consider instead"
          icon="swap-horizontal"
          iconColor="#0369a1"
          iconBg="#e0f2fe"
          items={brief.betterAlternatives}
          sectionId="alternatives"
          onOpen={trackSection}
        />
      ) : null}

      <Text style={s.reviewedAt}>Last reviewed: {brief.lastReviewedAt}</Text>
    </View>
  );
}

const s = {
  container: {
    gap: tokens.space.sm,
  },
  headerSection: {
    gap: tokens.space.xs,
  },
  briefLabel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 4,
  },
  briefLabelText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    lineHeight: 26,
  },
  summary: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    marginTop: 4,
  },
  confidenceBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
  },
  twoColumn: {
    gap: tokens.space.sm,
  },
  columnCard: {
    backgroundColor: 'rgba(51,196,220,0.08)',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(51,196,220,0.30)',
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  columnCardRed: {
    backgroundColor: 'rgba(254,226,226,0.6)',
    borderColor: 'rgba(254,202,202,0.6)',
  },
  columnTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.teal,
  },
  columnTitleRed: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: "#991b1b",
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border,
    marginVertical: tokens.space.xs,
  },
  detailsHint: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    marginBottom: 2,
  },
  accordion: {
    ...tokens.card,
    overflow: "hidden" as const,
  },
  accordionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: tokens.space.lg,
  },
  accordionLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
  },
  accordionTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    flex: 1,
  },
  accordionBody: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  riskAccordion: {
    backgroundColor: 'rgba(254,226,226,0.6)',
    borderColor: 'rgba(254,202,202,0.6)',
  },
  riskAccordionTitle: {
    color: "#991b1b",
  },
  mistakeAccordion: {
    backgroundColor: 'rgba(232,153,26,0.08)',
    borderColor: 'rgba(232,153,26,0.30)',
  },
  mistakeAccordionTitle: {
    color: tokens.color.gold,
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  },
  bulletIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  reviewedAt: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
    marginTop: tokens.space.xs,
  },
} as const;
