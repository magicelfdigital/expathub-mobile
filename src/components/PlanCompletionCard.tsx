import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { COUNTRIES } from "@/data/countries";
import { usePlan } from "@/src/contexts/PlanContext";
import { getVendors } from "@/src/data";
import { tokens } from "@/theme/tokens";

const NEXT_ITEMS = [
  {
    icon: "document-text-outline" as const,
    title: "Legal documents",
    body: "Review your will, power of attorney, and any estate arrangements before you go.",
  },
  {
    icon: "home-outline" as const,
    title: "Property and storage",
    body: "Decide what moves with you, what stays, and what goes.",
  },
  {
    icon: "medkit-outline" as const,
    title: "Healthcare transition",
    body: "Understand how your current coverage ends and when new coverage begins.",
  },
  {
    icon: "business-outline" as const,
    title: "Home-country administration",
    body: "Notify tax authorities, update banking access, and change your registered address.",
  },
];

type Props = {
  onReviewPlan?: () => void;
};

export default function PlanCompletionCard({ onReviewPlan }: Props) {
  const { activeCountrySlug, isComplete } = usePlan();
  const router = useRouter();

  const country = COUNTRIES.find((c) => c.slug === activeCountrySlug);
  const countryName = country?.name ?? "Your";
  const hasVendors = activeCountrySlug ? getVendors(activeCountrySlug).length > 0 : false;

  if (!isComplete) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-done" size={28} color={tokens.color.primary} />
        </View>
      </View>

      <Text style={styles.header}>{countryName} Plan Complete</Text>

      <Text style={styles.subtext}>
        You've worked through the key planning stages.{"\n"}The next phase is preparing to leave.
      </Text>

      <Text style={styles.sectionTitle}>What comes next</Text>

      <View style={styles.list}>
        {NEXT_ITEMS.map((item) => (
          <View key={item.title} style={styles.listItem}>
            <View style={styles.listIconCircle}>
              <Ionicons name={item.icon} size={18} color={tokens.color.primary} />
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listBody}>{item.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.comingText}>
        Full preparation support is coming in the next release.
      </Text>

      <View style={styles.actions}>
        {onReviewPlan && (
          <Pressable
            style={styles.primaryButton}
            onPress={onReviewPlan}
            testID="plan-completion-review"
          >
            <Ionicons name="list-outline" size={18} color={tokens.color.white} />
            <Text style={styles.primaryText}>Review your plan</Text>
          </Pressable>
        )}

        {hasVendors && activeCountrySlug && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/country/[slug]/vendors" as any,
                params: { slug: activeCountrySlug },
              })
            }
            testID="plan-completion-vendors"
          >
            <Ionicons name="storefront-outline" size={18} color={tokens.color.primary} />
            <Text style={styles.secondaryText}>Explore vendor resources</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.tealLight,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.teal,
    padding: tokens.space.xl,
    marginBottom: tokens.space.lg,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: tokens.space.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.tealLight,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    textAlign: "center",
    marginBottom: tokens.space.xs,
  },
  subtext: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: tokens.space.xl,
  },
  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    marginBottom: tokens.space.md,
  },
  list: {
    gap: tokens.space.md,
    marginBottom: tokens.space.xl,
  },
  listItem: {
    flexDirection: "row",
    gap: tokens.space.sm,
  },
  listIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.tealLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  listContent: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  listBody: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  comingText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    marginBottom: tokens.space.xl,
    fontStyle: "italic",
  },
  actions: {
    gap: tokens.space.sm,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    paddingHorizontal: tokens.space.lg,
    gap: 8,
  },
  primaryText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    paddingVertical: 12,
    paddingHorizontal: tokens.space.lg,
    gap: 8,
  },
  secondaryText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
  },
});
