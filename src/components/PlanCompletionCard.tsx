import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { COUNTRIES } from "@/data/countries";
import { usePlan } from "@/src/contexts/PlanContext";
import { tokens } from "@/theme/tokens";

type Props = {
  onReviewPlan?: () => void;
};

export default function PlanCompletionCard({ onReviewPlan }: Props) {
  const { activeCountrySlug, isComplete } = usePlan();
  const router = useRouter();

  const country = COUNTRIES.find((c) => c.slug === activeCountrySlug);
  const countryName = country?.name ?? "Your";

  if (!isComplete) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-done" size={28} color={tokens.color.primary} />
        </View>
      </View>

      <Text style={styles.header}>{countryName} Plan Complete</Text>

      <Text style={styles.body}>
        You've structured your relocation path. Execution support tools are coming soon.
      </Text>

      <View style={styles.actions}>
        {onReviewPlan && (
          <Pressable
            style={styles.primaryButton}
            onPress={onReviewPlan}
            testID="plan-completion-review"
          >
            <Ionicons name="list-outline" size={18} color={tokens.color.white} />
            <Text style={styles.primaryText}>Review Your Plan</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/")}
          testID="plan-completion-explore"
        >
          <Ionicons name="compass-outline" size={18} color={tokens.color.primary} />
          <Text style={styles.secondaryText}>Explore another country</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#EDF5F0",
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#D4ECEA",
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
    backgroundColor: "rgba(0,156,156,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    textAlign: "center",
    marginBottom: tokens.space.xs,
  },
  body: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: tokens.space.xl,
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
    color: tokens.color.primary,
  },
});
