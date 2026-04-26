import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { usePlan } from "@/src/contexts/PlanContext";
import {
  PLAN_STEPS,
  getStep3Checklist,
  type PlanStep,
} from "@/src/data/planSteps";
import { getPetRequirements } from "@/src/data/petRequirements";
import { tokens } from "@/theme/tokens";

export function PlannerLegacyStepBody({
  legacyStepIds,
  countrySlug,
  showPetRequirements = false,
}: {
  legacyStepIds: PlanStep["id"][];
  countrySlug: string;
  showPetRequirements?: boolean;
}) {
  return (
    <View style={styles.body}>
      {legacyStepIds.map((id, idx) => (
        <LegacyModuleSection
          key={id}
          legacyStepId={id}
          countrySlug={countrySlug}
          showDivider={idx > 0}
        />
      ))}
      {showPetRequirements && (
        <PetRequirementsBlock countrySlug={countrySlug} />
      )}
    </View>
  );
}

function LegacyModuleSection({
  legacyStepId,
  countrySlug,
  showDivider,
}: {
  legacyStepId: PlanStep["id"];
  countrySlug: string;
  showDivider: boolean;
}) {
  const { completedSteps, completeStep, uncompleteStep } = usePlan();
  const step = PLAN_STEPS.find((s) => s.id === legacyStepId);
  if (!step) return null;

  const checklist =
    legacyStepId === "prepare_docs"
      ? getStep3Checklist(countrySlug)
      : step.checklist;

  let lastGroup: string | undefined;
  return (
    <View style={[styles.section, showDivider && styles.sectionDivider]}>
      <Text style={styles.sectionTitle}>{step.title}</Text>
      <Text style={styles.description}>{step.description}</Text>
      <View style={styles.checklist}>
        {checklist.map((item) => {
          const checked = completedSteps.includes(item.id);
          const showGroupHeader = item.group && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <React.Fragment key={item.id}>
              {showGroupHeader && (
                <Text style={styles.groupHeader}>{item.group}</Text>
              )}
              <Pressable
                onPress={() =>
                  checked ? uncompleteStep(item.id) : completeStep(item.id)
                }
                style={styles.row}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && (
                    <Ionicons name="checkmark" size={12} color={tokens.color.white} />
                  )}
                </View>
                <Text
                  style={[
                    styles.itemLabel,
                    checked && styles.itemLabelChecked,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      {step.disclaimer && (
        <Text style={styles.disclaimer}>{step.disclaimer}</Text>
      )}
    </View>
  );
}

function PetRequirementsBlock({ countrySlug }: { countrySlug: string }) {
  const { completedSteps, completeStep, uncompleteStep } = usePlan();
  const petData = getPetRequirements(countrySlug);
  if (!petData) return null;

  const completedCount = petData.checklist.filter((item) =>
    completedSteps.includes(item.id),
  ).length;
  let lastGroup: string | undefined;

  return (
    <View style={styles.petWrap}>
      <View style={styles.petSummary}>
        <Ionicons name="paw-outline" size={16} color={tokens.color.primary} />
        <Text style={styles.petSummaryText}>{petData.summary}</Text>
      </View>

      {petData.quarantineNote && (
        <View style={styles.petWarning}>
          <Ionicons name="warning-outline" size={14} color={tokens.color.gold} />
          <Text style={styles.petWarningText}>{petData.quarantineNote}</Text>
        </View>
      )}
      {petData.breedNote && (
        <View style={styles.petWarning}>
          <Ionicons name="alert-circle-outline" size={14} color={tokens.color.gold} />
          <Text style={styles.petWarningText}>{petData.breedNote}</Text>
        </View>
      )}

      <Text style={styles.petProgress}>
        {completedCount} of {petData.checklist.length} pet items completed
      </Text>

      <View style={styles.checklist}>
        {petData.checklist.map((item) => {
          const checked = completedSteps.includes(item.id);
          const showGroupHeader = item.group && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <React.Fragment key={item.id}>
              {showGroupHeader && (
                <Text style={styles.groupHeader}>{item.group}</Text>
              )}
              <Pressable
                onPress={() =>
                  checked ? uncompleteStep(item.id) : completeStep(item.id)
                }
                style={styles.row}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && (
                    <Ionicons name="checkmark" size={12} color={tokens.color.white} />
                  )}
                </View>
                <Text
                  style={[
                    styles.itemLabel,
                    checked && styles.itemLabelChecked,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>

      {petData.sources.length > 0 && (
        <View style={styles.sourcesWrap}>
          <Text style={styles.sourcesTitle}>Sources</Text>
          {petData.sources.map((source, i) => (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(source.url)}
              style={styles.sourceRow}
            >
              <Ionicons name="open-outline" size={11} color={tokens.color.primary} />
              <Text style={styles.sourceLabel} numberOfLines={2}>
                {source.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: tokens.space.sm,
    gap: tokens.space.md,
  },
  section: {
    gap: tokens.space.sm,
  },
  sectionDivider: {
    paddingTop: tokens.space.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  sectionTitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodyBold,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  description: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  checklist: {
    gap: tokens.space.xs,
  },
  groupHeader: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyBold,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    marginTop: tokens.space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: tokens.color.subtext,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  itemLabel: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 18,
  },
  itemLabelChecked: {
    color: tokens.color.subtext,
    textDecorationLine: "line-through",
  },
  disclaimer: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    fontStyle: "italic",
  },
  petWrap: {
    marginTop: tokens.space.sm,
    paddingTop: tokens.space.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: tokens.space.sm,
  },
  petSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  petSummaryText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 18,
  },
  petWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: tokens.color.goldLight,
    padding: 10,
    borderRadius: tokens.radius.sm,
  },
  petWarningText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 18,
  },
  petProgress: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyBold,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
  },
  sourcesWrap: {
    gap: 4,
    paddingTop: tokens.space.xs,
  },
  sourcesTitle: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyBold,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceLabel: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.primary,
  },
});
