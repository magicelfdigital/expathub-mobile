import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useCountry } from "@/contexts/CountryContext";
import { useSaved } from "@/src/contexts/SavedContext";
import { getCountry, getResources } from "@/src/data";
import { openInApp } from "@/lib/openInApp";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

function SavedResourceCard({
  title,
  subtitle,
  sourceType = "official",
  onPress,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  sourceType?: "official" | "community" | "expert";
  onPress: () => void;
  onRemove: () => void;
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
          <View style={[styles.badge, badgeStyles[sourceType]]}>
            <Text style={[styles.badgeText, badgeTextStyles[sourceType]]} numberOfLines={1}>
              {sourceType === "official" ? "Official" : sourceType === "community" ? "Community" : "Expert"}
            </Text>
          </View>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onRemove(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove bookmark"
          >
            <Ionicons name="bookmark" size={20} color={tokens.color.primary} />
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
}

export default function SavedResourcesScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug } = useCountry();
  const { getSavedResources, removeSavedResource } = useSaved();

  const urlSlug = typeof slug === "string" ? slug : undefined;
  const countrySlug = selectedCountrySlug || urlSlug || "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "this country";
    return getCountry(countrySlug)?.name ?? "this country";
  }, [countrySlug]);

  const savedUrls = getSavedResources(countrySlug);

  const allResources = useMemo(() => {
    if (!countrySlug) return [];
    return getResources(countrySlug);
  }, [countrySlug]);

  const savedItems = useMemo(() => {
    return savedUrls
      .map((url) => allResources.find((r) => r.url === url))
      .filter(Boolean) as typeof allResources;
  }, [savedUrls, allResources]);

  return (
    <Screen>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Saved</Text>
          <Text style={styles.subtitle}>Your bookmarked resources for {countryName}</Text>
        </View>

        {savedItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="bookmark-outline" size={28} color={tokens.color.subtext} />
            </View>
            <Text style={styles.emptyText}>
              No saved resources yet. Bookmark resources from the Resources page to find them here.
            </Text>
          </View>
        ) : (
          <View style={styles.resourceList}>
            {savedItems.map((item) => (
              <SavedResourceCard
                key={item.url}
                title={item.label}
                subtitle={item.note}
                sourceType={item.sourceType}
                onPress={() => openInApp(item.url)}
                onRemove={() => removeSavedResource(countrySlug, item.url)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = {
  scrollContainer: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.lg,
  },

  header: {
    gap: tokens.space.xs,
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

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },

  badgeText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
  },

  emptyCard: {
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: "center" as const,
    gap: tokens.space.md,
  },

  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  emptyText: {
    color: tokens.color.subtext,
    fontSize: tokens.text.body,
    textAlign: "center" as const,
    lineHeight: 20,
  },
} as const;

const badgeStyles = {
  official: {
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  community: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  expert: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
} as const;

const badgeTextStyles = {
  official: { color: tokens.color.primary },
  community: { color: tokens.color.text },
  expert: { color: tokens.color.text },
} as const;
