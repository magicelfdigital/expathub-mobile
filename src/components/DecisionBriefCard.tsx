import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { DecisionBrief, DisplayConfidenceLevel } from "@/src/data";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";
import { FreshnessBanner } from "@/src/components/FreshnessBanner";
import { DragBottomSheet } from "@/src/components/DragBottomSheet";
import { GLOSSARY, lookupAbbreviation, type GlossaryEntry } from "@/data/glossary";

const PLAIN_ENGLISH_KEY = "brief_plain_english";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ABBREV_REGEX_SOURCE =
  GLOSSARY.length > 0
    ? `\\b(${GLOSSARY.map((g) => escapeRegex(g.abbreviation)).join("|")})\\b`
    : null;

function stripDefinitionalAsides(text: string): string {
  // Remove parenthetical asides that contain an em-dash — these are the
  // jargon-definition asides like "(ILR — UK permanent residency...)".
  // Leaves clean parentheticals like "(US, Canada, Australia)" intact.
  let out = text;
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/\s*\(([^()]*—[^()]*)\)/g, "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

type Segment =
  | { type: "text"; value: string }
  | { type: "abbrev"; value: string; entry: GlossaryEntry };

function tokenizeForGlossary(paragraph: string): Segment[] {
  if (!ABBREV_REGEX_SOURCE) {
    return [{ type: "text", value: paragraph }];
  }
  const segments: Segment[] = [];
  const pattern = new RegExp(ABBREV_REGEX_SOURCE, "g");
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(paragraph)) !== null) {
    const entry = lookupAbbreviation(m[1]);
    if (!entry) continue;
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: paragraph.slice(lastIndex, m.index) });
    }
    segments.push({ type: "abbrev", value: m[1], entry });
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < paragraph.length) {
    segments.push({ type: "text", value: paragraph.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: "text", value: paragraph }];
}

type DecisionBriefCardProps = {
  brief: DecisionBrief;
  countrySlug?: string;
  pathwayKey?: string;
};

const confidenceColors: Record<DisplayConfidenceLevel, { bg: string; border: string; text: string }> = {
  High: { bg: tokens.color.tealLight, border: tokens.color.teal, text: tokens.color.teal },
  Medium: { bg: tokens.color.goldLight, border: tokens.color.gold, text: tokens.color.gold },
  Conditional: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
};

const ABBREV_PLACEHOLDER = "\u0001";

function protectAbbreviations(text: string): string {
  // Protect periods inside common abbreviations and number/decimal patterns
  // so the sentence splitter does not break on them.
  return text
    .replace(/\b(e\.g|i\.e|etc|vs|cf|approx|incl|excl|min|max|no|St|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|U\.S|U\.K|E\.U|a\.m|p\.m)\./gi, (m) =>
      m.replace(/\./g, ABBREV_PLACEHOLDER),
    )
    .replace(/(\d)\.(\d)/g, (_m, a, b) => `${a}${ABBREV_PLACEHOLDER}${b}`);
}

function restoreAbbreviations(text: string): string {
  return text.split(ABBREV_PLACEHOLDER).join(".");
}

function chunkByWords(text: string, target = 300): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    const next = buf ? `${buf} ${w}` : w;
    if (next.length > target && buf) {
      out.push(buf);
      buf = w;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function splitIntoParagraphs(text: string): string[] {
  const explicit = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const chunk of explicit) {
    if (chunk.length <= 280) {
      out.push(chunk);
      continue;
    }
    const protectedChunk = protectAbbreviations(chunk);
    const sentences = protectedChunk
      .match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)
      ?.map((s) => restoreAbbreviations(s).trim())
      .filter(Boolean) ?? [];

    if (sentences.length <= 1) {
      // No sentence boundaries — fall back to word-based chunking so very
      // long unpunctuated prose still breaks into readable paragraphs.
      out.push(...chunkByWords(chunk));
      continue;
    }

    let buf = "";
    for (const sent of sentences) {
      const next = buf ? `${buf} ${sent}` : sent;
      if (next.length > 320 && buf) {
        out.push(buf);
        buf = sent;
      } else {
        buf = next;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

function GlossaryAwareText({
  paragraph,
  baseStyle,
  onAbbrevPress,
  rowKey,
}: {
  paragraph: string;
  baseStyle: object;
  onAbbrevPress: (entry: GlossaryEntry) => void;
  rowKey: string;
}) {
  const segments = useMemo(() => tokenizeForGlossary(paragraph), [paragraph]);
  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <Text key={`${rowKey}-s-${i}`}>{seg.value}</Text>;
        }
        return (
          <Text
            key={`${rowKey}-s-${i}`}
            onPress={() => onAbbrevPress(seg.entry)}
            style={s.abbrevLink}
            accessibilityRole="link"
            accessibilityLabel={`${seg.entry.abbreviation}: ${seg.entry.fullName}`}
          >
            {seg.value}
          </Text>
        );
      })}
    </Text>
  );
}

function BulletList({
  items,
  icon,
  iconColor,
  iconBg,
  plainEnglish,
  onAbbrevPress,
}: {
  items: string[];
  icon: string;
  iconColor: string;
  iconBg: string;
  plainEnglish: boolean;
  onAbbrevPress: (entry: GlossaryEntry) => void;
}) {
  return (
    <View style={s.bulletList}>
      {items.map((item, itemIdx) => {
        const transformed = plainEnglish ? stripDefinitionalAsides(item) : item;
        const paragraphs = splitIntoParagraphs(transformed);
        return (
          <View
            key={`bullet-${itemIdx}`}
            style={[s.bulletRow, itemIdx === 0 ? s.bulletRowFirst : null]}
          >
            <View style={[s.bulletIcon, { backgroundColor: iconBg }]}>
              <Ionicons name={icon as any} size={12} color={iconColor} />
            </View>
            <View style={s.bulletTextColumn}>
              {paragraphs.map((para, idx) => (
                <GlossaryAwareText
                  key={`bullet-${itemIdx}-p-${idx}`}
                  paragraph={para}
                  baseStyle={{
                    ...s.bulletText,
                    ...(idx > 0 ? s.bulletParagraphSpacing : null),
                  }}
                  onAbbrevPress={onAbbrevPress}
                  rowKey={`bullet-${itemIdx}-p-${idx}`}
                />
              ))}
            </View>
          </View>
        );
      })}
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
  plainEnglish,
  onAbbrevPress,
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
  plainEnglish: boolean;
  onAbbrevPress: (entry: GlossaryEntry) => void;
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
          <BulletList items={items} icon={icon} iconColor={iconColor} iconBg={iconBg} plainEnglish={plainEnglish} onAbbrevPress={onAbbrevPress} />
        </View>
      )}
    </Pressable>
  );
}

export function DecisionBriefCard({ brief, countrySlug, pathwayKey }: DecisionBriefCardProps) {
  const conf = confidenceColors[brief.confidenceLevel];
  const viewedSectionsRef = useRef<Set<string>>(new Set());
  const [plainEnglish, setPlainEnglish] = useState(false);
  const [glossaryEntry, setGlossaryEntry] = useState<GlossaryEntry | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PLAIN_ENGLISH_KEY)
      .then((v) => {
        if (mounted && v === "true") setPlainEnglish(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const togglePlainEnglish = useCallback(() => {
    setPlainEnglish((prev) => {
      const next = !prev;
      AsyncStorage.setItem(PLAIN_ENGLISH_KEY, next ? "true" : "false").catch(() => {});
      trackEvent("brief_plain_english_toggled", {
        countrySlug: countrySlug ?? "unknown",
        pathwayKey: pathwayKey ?? "none",
        enabled: next,
      });
      return next;
    });
  }, [countrySlug, pathwayKey]);

  const onAbbrevPress = useCallback(
    (entry: GlossaryEntry) => {
      setGlossaryEntry(entry);
      trackEvent("brief_glossary_opened", {
        countrySlug: countrySlug ?? "unknown",
        abbreviation: entry.abbreviation,
      });
    },
    [countrySlug],
  );

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

  const summaryText = plainEnglish
    ? stripDefinitionalAsides(brief.decisionSummary)
    : brief.decisionSummary;

  return (
    <View style={s.container}>
      <View style={s.headerSection}>
        <View style={s.briefLabelRow}>
          <View style={s.briefLabel}>
            <Ionicons name="shield-checkmark" size={14} color={tokens.color.primary} />
            <Text style={s.briefLabelText}>Decision Brief</Text>
          </View>
          <Pressable
            onPress={togglePlainEnglish}
            style={[s.plainToggle, plainEnglish && s.plainToggleActive]}
            accessibilityRole="switch"
            accessibilityState={{ checked: plainEnglish }}
            hitSlop={8}
          >
            <Ionicons
              name={plainEnglish ? "sparkles" : "sparkles-outline"}
              size={12}
              color={plainEnglish ? tokens.color.bg : tokens.color.primary}
            />
            <Text style={[s.plainToggleText, plainEnglish && s.plainToggleTextActive]}>
              Plain English
            </Text>
          </Pressable>
        </View>
        <Text style={s.headline}>{brief.headline}</Text>
        <View style={s.summaryParagraphs}>
          {splitIntoParagraphs(summaryText).map((para, idx) => (
            <GlossaryAwareText
              key={`summary-p-${idx}`}
              paragraph={para}
              baseStyle={s.summary}
              onAbbrevPress={onAbbrevPress}
              rowKey={`summary-p-${idx}`}
            />
          ))}
        </View>
      </View>

      <FreshnessBanner lastReviewedAt={brief.lastReviewedAt} />

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
          <BulletList items={brief.recommendedFor} icon="checkmark" iconColor={tokens.color.teal} iconBg={tokens.color.tealLight} plainEnglish={plainEnglish} onAbbrevPress={onAbbrevPress} />
        </View>
        <View style={[s.columnCard, s.columnCardRed]}>
          <Text style={s.columnTitleRed}>Not recommended for</Text>
          <BulletList items={brief.notRecommendedFor} icon="close" iconColor="#991b1b" iconBg="#fee2e2" plainEnglish={plainEnglish} onAbbrevPress={onAbbrevPress} />
        </View>
      </View>

      <View style={s.divider} />
      <Text style={s.detailsHint}>Tap any section below to expand. Tap any underlined term to see what it means.</Text>

      <CollapsibleSection
        title="What you actually need"
        icon="document-text"
        iconColor={tokens.color.primary}
        iconBg={tokens.color.primarySoft}
        items={brief.keyRequirements}
        sectionId="requirements"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
      />

      <CollapsibleSection
        title="Financial reality"
        icon="card"
        iconColor={tokens.color.gold}
        iconBg={tokens.color.goldLight}
        items={brief.financialReality}
        sectionId="financial"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
      />

      <CollapsibleSection
        title="Timeline reality"
        icon="time"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.timelineReality}
        sectionId="timeline"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
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
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
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
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
      />

      <CollapsibleSection
        title="Work reality"
        icon="briefcase"
        iconColor="#0369a1"
        iconBg="#e0f2fe"
        items={brief.workReality ?? []}
        sectionId="work-reality"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
      />

      <CollapsibleSection
        title="Family & dependents"
        icon="people"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.familyAndDependents ?? []}
        sectionId="family"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
      />

      <CollapsibleSection
        title="Lifestyle & culture"
        icon="globe"
        iconColor={tokens.color.teal}
        iconBg={tokens.color.tealLight}
        items={brief.lifestyleAndCulture ?? []}
        sectionId="lifestyle"
        onOpen={trackSection}
        plainEnglish={plainEnglish}
        onAbbrevPress={onAbbrevPress}
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
          plainEnglish={plainEnglish}
          onAbbrevPress={onAbbrevPress}
        />
      ) : null}

      <Text style={s.reviewedAt}>Last reviewed: {brief.lastReviewedAt}</Text>

      <DragBottomSheet
        visible={glossaryEntry !== null}
        onClose={() => setGlossaryEntry(null)}
        maxHeightFraction={0.6}
        testID="glossary-sheet"
      >
        {glossaryEntry ? (
          <ScrollView contentContainerStyle={s.glossarySheetContent}>
            <View style={s.glossaryBadge}>
              <Ionicons name="book-outline" size={12} color={tokens.color.primary} />
              <Text style={s.glossaryBadgeText}>Glossary</Text>
            </View>
            <Text style={s.glossaryAbbrev}>{glossaryEntry.abbreviation}</Text>
            <Text style={s.glossaryFullName}>{glossaryEntry.fullName}</Text>
            <View style={s.glossaryCountryRow}>
              <Ionicons name="location-outline" size={12} color={tokens.color.subtext} />
              <Text style={s.glossaryCountry}>{glossaryEntry.country}</Text>
            </View>
            <Text style={s.glossaryDescription}>{glossaryEntry.description}</Text>
            <Pressable
              onPress={() => setGlossaryEntry(null)}
              style={s.glossaryClose}
              accessibilityRole="button"
            >
              <Text style={s.glossaryCloseText}>Back to brief</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </DragBottomSheet>
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
  briefLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 4,
  },
  briefLabel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  plainToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill ?? 999,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.bg,
  },
  plainToggleActive: {
    backgroundColor: tokens.color.primary,
  },
  plainToggleText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
  },
  plainToggleTextActive: {
    color: tokens.color.bg,
  },
  abbrevLink: {
    color: tokens.color.primary,
    textDecorationLine: "underline" as const,
    textDecorationStyle: "dotted" as const,
    fontWeight: tokens.weight.bold,
  },
  glossarySheetContent: {
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  glossaryBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft,
  },
  glossaryBadgeText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  glossaryAbbrev: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    marginTop: 4,
  },
  glossaryFullName: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodyBold,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  glossaryCountryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 2,
  },
  glossaryCountry: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  glossaryDescription: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 22,
    marginTop: tokens.space.sm,
  },
  glossaryClose: {
    alignSelf: "flex-start" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: tokens.space.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft,
  },
  glossaryCloseText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
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
    backgroundColor: tokens.color.tealLight,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.teal,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  columnCardRed: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
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
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
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
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  riskAccordionTitle: {
    color: "#991b1b",
  },
  mistakeAccordion: {
    backgroundColor: tokens.color.goldLight,
    borderColor: tokens.color.gold,
  },
  mistakeAccordionTitle: {
    color: tokens.color.gold,
  },
  bulletList: {
    gap: 16,
  },
  bulletRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 14,
  },
  bulletRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  summaryParagraphs: {
    gap: 12,
    marginTop: 4,
  },
  bulletIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  bulletTextColumn: {
    flex: 1,
  },
  bulletText: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 22,
  },
  bulletParagraphSpacing: {
    marginTop: 22,
  },
  reviewedAt: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
    marginTop: tokens.space.xs,
  },
} as const;
