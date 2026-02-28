import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { COUNTRIES } from "@/data/countries";
import { usePlan } from "@/src/contexts/PlanContext";
import { PLAN_STEPS, type PlanStep } from "@/src/data/planSteps";
import { tokens } from "@/theme/tokens";
import EligibilitySnapshot from "@/src/components/EligibilitySnapshot";

function ChecklistItemRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={s.checklistRow}>
      <View style={[s.checkbox, checked && s.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={[s.checklistLabel, checked && s.checklistLabelChecked]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StepCard({
  step,
  isHighlighted,
  completedSteps,
  onCompleteStep,
  onUncompleteStep,
  countrySlug,
  pathwayId,
}: {
  step: PlanStep;
  isHighlighted: boolean;
  completedSteps: string[];
  onCompleteStep: (id: string) => void;
  onUncompleteStep: (id: string) => void;
  countrySlug?: string;
  pathwayId?: string;
}) {
  const [expanded, setExpanded] = useState(isHighlighted);
  const completedCount = step.checklist.filter((item) =>
    completedSteps.includes(item.id),
  ).length;
  const allDone = completedCount === step.checklist.length;

  return (
    <View
      style={[
        s.stepCard,
        isHighlighted && s.stepCardHighlighted,
        allDone && s.stepCardDone,
      ]}
    >
      <Pressable onPress={() => setExpanded((prev) => !prev)} style={s.stepHeader}>
        <View style={s.stepLeft}>
          <View
            style={[
              s.stepNumber,
              allDone && s.stepNumberDone,
              isHighlighted && !allDone && s.stepNumberHighlighted,
            ]}
          >
            {allDone ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text
                style={[
                  s.stepNumberText,
                  isHighlighted && s.stepNumberTextHighlighted,
                ]}
              >
                {step.number}
              </Text>
            )}
          </View>
          <View style={s.stepTitleWrap}>
            <Text style={s.stepTitle}>{step.title}</Text>
            <Text style={s.stepProgress}>
              {completedCount} of {step.checklist.length}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={tokens.color.subtext}
        />
      </Pressable>

      {expanded && (
        <View style={s.stepBody}>
          <Text style={s.stepDescription}>{step.description}</Text>
          <View style={s.checklist}>
            {step.checklist.map((item) => {
              const checked = completedSteps.includes(item.id);
              return (
                <ChecklistItemRow
                  key={item.id}
                  label={item.label}
                  checked={checked}
                  onToggle={() =>
                    checked
                      ? onUncompleteStep(item.id)
                      : onCompleteStep(item.id)
                  }
                />
              );
            })}
          </View>
          {step.id === "confirm_pathway" && countrySlug && pathwayId ? (
            <EligibilitySnapshot countrySlug={countrySlug} pathwayId={pathwayId} />
          ) : null}
        </View>
      )}
    </View>
  );
}

export function PlanModule() {
  const { activeCountrySlug, activePathwayId, completedSteps, completeStep, uncompleteStep } =
    usePlan();

  const country = COUNTRIES.find((c) => c.slug === activeCountrySlug);
  const countryName = country?.name ?? "Your Country";

  const stepsWithCompletion = PLAN_STEPS.map((step) => {
    const done = step.checklist.every((item) =>
      completedSteps.includes(item.id),
    );
    return { step, done };
  });

  const completedStepCount = stepsWithCompletion.filter((s) => s.done).length;
  const firstIncomplete = stepsWithCompletion.find((s) => !s.done);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="map-outline" size={18} color={tokens.color.primary} />
        </View>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>{countryName} Plan</Text>
          <Text style={s.headerProgress}>
            {completedStepCount} of {PLAN_STEPS.length} steps completed
          </Text>
        </View>
      </View>

      {firstIncomplete && (
        <View style={s.nextStepBanner}>
          <Ionicons
            name="arrow-forward-circle"
            size={16}
            color={tokens.color.primary}
          />
          <Text style={s.nextStepText}>
            Recommended next step: {firstIncomplete.step.title}
          </Text>
        </View>
      )}

      <View style={s.progressBar}>
        <View
          style={[
            s.progressFill,
            {
              width: `${(completedStepCount / PLAN_STEPS.length) * 100}%` as any,
            },
          ]}
        />
      </View>

      <View style={s.steps}>
        {PLAN_STEPS.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            isHighlighted={firstIncomplete?.step.id === step.id}
            completedSteps={completedSteps}
            onCompleteStep={completeStep}
            onUncompleteStep={uncompleteStep}
            countrySlug={activeCountrySlug ?? undefined}
            pathwayId={activePathwayId ?? undefined}
          />
        ))}
      </View>
    </View>
  );
}

const s = {
  container: {
    gap: tokens.space.md,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },
  headerProgress: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },
  nextStepBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  nextStepText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.border,
    overflow: "hidden" as const,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.primary,
  },
  steps: {
    gap: tokens.space.sm,
  },
  stepCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    overflow: "hidden" as const,
  },
  stepCardHighlighted: {
    borderColor: tokens.color.primaryBorder,
    backgroundColor: "#F8FCFC",
  },
  stepCardDone: {
    borderColor: "#D4ECEA",
    backgroundColor: "#F5FAF8",
  },
  stepHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: tokens.space.lg,
  },
  stepLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.space.sm,
    flex: 1,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stepNumberHighlighted: {
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1.5,
    borderColor: tokens.color.primary,
  },
  stepNumberDone: {
    backgroundColor: tokens.color.primary,
  },
  stepNumberText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
  },
  stepNumberTextHighlighted: {
    color: tokens.color.primary,
  },
  stepTitleWrap: {
    flex: 1,
    gap: 1,
  },
  stepTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  stepProgress: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },
  stepBody: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.sm,
  },
  stepDescription: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  checklist: {
    gap: tokens.space.xs,
    marginTop: 4,
  },
  checklistRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: tokens.space.sm,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  checklistLabel: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  checklistLabelChecked: {
    color: tokens.color.subtext,
    textDecorationLine: "line-through" as const,
  },
} as const;
