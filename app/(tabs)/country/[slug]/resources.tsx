import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { memo, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { SourceBadge } from "@/src/components/SourceBadge";
import { AvailabilityGate } from "@/src/components/AvailabilityGate";
import { useCountry } from "@/contexts/CountryContext";
import { useSaved } from "@/src/contexts/SavedContext";
import { useContinue } from "@/src/contexts/ContinueContext";
import { getCountry, getResources, type ResourceCategory, type SourceType } from "@/src/data";
import { openInApp } from "@/lib/openInApp";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const Chip = memo(function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>
        {label}
      </Text>
    </Pressable>
  );
});

const ResourceCard = memo(function ResourceCard({
  title,
  subtitle,
  sourceType,
  onPress,
  bookmarked,
  onToggleBookmark,
}: {
  title: string;
  subtitle?: string;
  sourceType: SourceType;
  onPress: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>

        <View style={styles.cardTopRight}>
          <SourceBadge sourceType={sourceType} />
          <Pressable
            onPress={(e) => { e.stopPropagation(); onToggleBookmark(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={20}
              color={bookmarked ? tokens.color.primary : tokens.color.subtext}
            />
          </Pressable>
        </View>
      </View>

      {subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}

      <View style={styles.ctaRow}>
        <Text style={styles.cardCta}>Open</Text>
        <Text style={styles.cardCtaChevron}>&#8599;</Text>
      </View>
    </Pressable>
  );
});

export default function CountryResourcesScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug } = useCountry();
  const { recordView } = useContinue();
  const urlSlug = typeof slug === "string" ? slug : undefined;
  const countrySlug = selectedCountrySlug || urlSlug || undefined;

  React.useEffect(() => {
    if (countrySlug) {
      recordView(countrySlug, "resources");
    }
  }, [countrySlug]);

  return (
    <Screen>
      <AvailabilityGate countrySlug={countrySlug} section="resources">
        <ResourcesContent countrySlug={countrySlug} />
      </AvailabilityGate>
    </Screen>
  );
}

function SourceLegend({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.legendCard}>
      <View style={styles.legendHeader}>
        <Text style={styles.legendTitle}>Source types</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={18} color={tokens.color.subtext} />
        </Pressable>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>OFFICIAL</Text>
        <Text style={styles.legendDesc}>Government or immigration authority</Text>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>AUTHORITATIVE</Text>
        <Text style={styles.legendDesc}>Trusted public institution or portal</Text>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>COMMUNITY</Text>
        <Text style={styles.legendDesc}>Helpful third-party guidance</Text>
      </View>
    </View>
  );
}

function ResourcesContent({ countrySlug }: { countrySlug?: string }) {
  const { toggleSavedResource, isSaved } = useSaved();
  const [showLegend, setShowLegend] = useState(false);

  const countryName = useMemo(() => {
    if (!countrySlug) return "this country";
    return getCountry(countrySlug)?.name ?? "this country";
  }, [countrySlug]);

  const resources = useMemo(() => {
    if (!countrySlug) return [];
    return getResources(countrySlug);
  }, [countrySlug]);

  const [selected, setSelected] = useState<Set<ResourceCategory>>(new Set());

  const toggleCategory = (cat: ResourceCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearFilters = () => {
    setSelected(new Set());
  };

  const filtered = useMemo(() => {
    let list = resources;

    if (selected.size > 0) {
      list = list.filter((r) => r.category && selected.has(r.category));
    }

    return list;
  }, [resources, selected]);

  const showingCount = filtered.length;
  const anyFilterActive = selected.size > 0;

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.evidenceHeader}>
        <View style={styles.evidenceLabel}>
          <Ionicons name="document-text" size={12} color={tokens.color.subtext} />
          <Text style={styles.evidenceLabelText}>Supporting resources</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Resources</Text>
          <Pressable
            onPress={() => setShowLegend((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Source type information"
          >
            <Ionicons name="information-circle-outline" size={20} color={tokens.color.subtext} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Trusted government and expert sources for {countryName}.</Text>
        <SourceLegend visible={showLegend} onClose={() => setShowLegend(false)} />

        <View style={styles.chipRow}>
          <Chip label="All" active={selected.size === 0} onPress={clearFilters} />
          <Chip label="Visa" active={selected.has("visa")} onPress={() => toggleCategory("visa")} />
          <Chip label="Tax" active={selected.has("tax")} onPress={() => toggleCategory("tax")} />
          <Chip label="Housing" active={selected.has("housing")} onPress={() => toggleCategory("housing")} />
          <Chip label="Healthcare" active={selected.has("healthcare")} onPress={() => toggleCategory("healthcare")} />
          <Chip label="Work" active={selected.has("work")} onPress={() => toggleCategory("work")} />
          {anyFilterActive ? <Chip label="Reset" active={false} onPress={clearFilters} /> : null}
        </View>

        <Text style={styles.countText}>
          Showing {showingCount} resource{showingCount === 1 ? "" : "s"}
        </Text>
      </View>

      {resources.length > 0 && showingCount === 0 ? (
        <Text style={styles.stateText}>
          No resources match your filters.
        </Text>
      ) : null}

      {resources.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Resources for {countryName} are being prepared. Check back soon!</Text>
        </View>
      ) : null}

      <View style={styles.resourceList}>
        {filtered.map((item) => (
          <ResourceCard
            key={item.url}
            title={item.label}
            subtitle={item.note}
            sourceType={item.sourceType}
            onPress={() => openInApp(item.url)}
            bookmarked={countrySlug ? isSaved(countrySlug, item.url) : false}
            onToggleBookmark={() => countrySlug && toggleSavedResource(countrySlug, item.url)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = {
  scrollContainer: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.lg,
  },

  evidenceHeader: {
    gap: tokens.space.xs,
  },

  evidenceLabel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginBottom: 4,
  },
  evidenceLabelText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },

  title: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  subtitle: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },

  stateText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  },

  countText: {
    marginTop: tokens.space.xs,
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },

  chipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },

  chipIdle: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
  },

  chipActive: {
    backgroundColor: tokens.color.primarySoft,
    borderColor: tokens.color.primaryBorder,
  },

  chipPressed: {
    opacity: 0.88,
  },

  chipText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
  },

  chipTextIdle: {
    color: tokens.color.text,
  },

  chipTextActive: {
    color: tokens.color.primary,
  },

  resourceList: {
    gap: tokens.space.sm,
  },

  card: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 8,
  },

  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  cardTop: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: tokens.space.sm,
  },

  cardTopRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },

  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  cardSubtitle: {
    color: tokens.color.subtext,
    lineHeight: 18,
  },

  ctaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 2,
  },

  cardCta: {
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  cardCtaChevron: {
    fontSize: 14,
    color: tokens.color.primary,
  },

  emptyCard: {
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: "center" as const,
  },

  emptyText: {
    color: tokens.color.subtext,
    fontSize: tokens.text.body,
    textAlign: "center" as const,
    lineHeight: 20,
  },

  titleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },

  legendCard: {
    marginTop: tokens.space.sm,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 10,
  },

  legendHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },

  legendTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  legendRow: {
    gap: 2,
  },

  legendLabel: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    color: tokens.color.subtext,
    letterSpacing: 0.5,
  },

  legendDesc: {
    fontSize: tokens.text.small,
    color: tokens.color.text,
    lineHeight: 16,
  },
} as const;

