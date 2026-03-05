import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { COUNTRIES } from "@/data/countries";
import { PATHWAYS } from "@/data/pathways";
import { usePlan } from "@/src/contexts/PlanContext";
import { PLAN_STEPS, getStep3Checklist, type PlanStep } from "@/src/data/planSteps";
import { getPetRequirements } from "@/src/data/petRequirements";
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
        {checked && <Ionicons name="checkmark" size={13} color={tokens.color.white} />}
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
              <Ionicons name="checkmark" size={14} color={tokens.color.white} />
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
            {(() => {
              let lastGroup: string | undefined;
              return step.checklist.map((item) => {
                const checked = completedSteps.includes(item.id);
                const showGroupHeader = item.group && item.group !== lastGroup;
                lastGroup = item.group;
                return (
                  <React.Fragment key={item.id}>
                    {showGroupHeader && (
                      <Text style={s.groupHeader}>{item.group}</Text>
                    )}
                    <ChecklistItemRow
                      label={item.label}
                      checked={checked}
                      onToggle={() =>
                        checked
                          ? onUncompleteStep(item.id)
                          : onCompleteStep(item.id)
                      }
                    />
                  </React.Fragment>
                );
              });
            })()}
          </View>
          {step.disclaimer && (
            <Text style={s.disclaimer}>{step.disclaimer}</Text>
          )}
          {step.id === "confirm_pathway" && countrySlug && pathwayId ? (
            <EligibilitySnapshot
              countrySlug={countrySlug}
              pathwayId={pathwayId}
              availablePathways={(PATHWAYS[countrySlug] ?? []).map((p) => ({ key: p.key, title: p.title }))}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function PetChecklist({
  countrySlug,
  completedSteps,
  onCompleteStep,
  onUncompleteStep,
}: {
  countrySlug: string;
  completedSteps: string[];
  onCompleteStep: (id: string) => void;
  onUncompleteStep: (id: string) => void;
}) {
  const petData = getPetRequirements(countrySlug);
  if (!petData) return null;

  const completedCount = petData.checklist.filter((item) =>
    completedSteps.includes(item.id),
  ).length;

  let lastGroup: string | undefined;

  return (
    <View style={s.petContainer}>
      <View style={s.petSummaryCard}>
        <Ionicons name="paw-outline" size={20} color={tokens.color.primary} />
        <Text style={s.petSummaryText}>{petData.summary}</Text>
      </View>

      {petData.quarantineNote && (
        <View style={s.petWarningCard}>
          <Ionicons name="warning-outline" size={16} color={tokens.color.gold} />
          <Text style={s.petWarningText}>{petData.quarantineNote}</Text>
        </View>
      )}

      {petData.breedNote && (
        <View style={s.petWarningCard}>
          <Ionicons name="alert-circle-outline" size={16} color={tokens.color.gold} />
          <Text style={s.petWarningText}>{petData.breedNote}</Text>
        </View>
      )}

      <Text style={s.petProgress}>
        {completedCount} of {petData.checklist.length} items completed
      </Text>

      <View style={s.checklist}>
        {petData.checklist.map((item) => {
          const checked = completedSteps.includes(item.id);
          const showGroupHeader = item.group && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <React.Fragment key={item.id}>
              {showGroupHeader && (
                <Text style={s.groupHeader}>{item.group}</Text>
              )}
              <ChecklistItemRow
                label={item.label}
                checked={checked}
                onToggle={() =>
                  checked ? onUncompleteStep(item.id) : onCompleteStep(item.id)
                }
              />
            </React.Fragment>
          );
        })}
      </View>

      <Text style={s.disclaimer}>
        Pet import rules change frequently. Always confirm current requirements with the destination country's veterinary authority before travel.
      </Text>

      {petData.sources.length > 0 && (
        <View style={s.sourcesSection}>
          <Text style={s.sourcesTitle}>Sources</Text>
          {petData.sources.map((source, i) => (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(source.url)}
              style={s.sourceRow}
            >
              <Ionicons name="open-outline" size={12} color={tokens.color.primary} />
              <Text style={s.sourceLabel} numberOfLines={2}>{source.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function PlanModule() {
  const {
    activeCountrySlug, activePathwayId, completedSteps,
    completeStep, uncompleteStep, hasPets, setHasPets,
  } = usePlan();
  const [activeTab, setActiveTab] = useState<"plan" | "pets">("plan");

  const country = COUNTRIES.find((c) => c.slug === activeCountrySlug);
  const countryName = country?.name ?? "Your Country";
  const petData = activeCountrySlug ? getPetRequirements(activeCountrySlug) : null;

  const resolvedSteps = PLAN_STEPS.map((step) => {
    if (step.id === "prepare_docs" && activeCountrySlug) {
      const countryChecklist = getStep3Checklist(activeCountrySlug);
      return { ...step, checklist: countryChecklist };
    }
    return step;
  });

  const stepsWithCompletion = resolvedSteps.map((step) => {
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

      {hasPets && petData && (
        <View style={s.tabRow}>
          <Pressable
            style={[s.tab, activeTab === "plan" && s.tabActive]}
            onPress={() => setActiveTab("plan")}
          >
            <Ionicons
              name="list-outline"
              size={14}
              color={activeTab === "plan" ? tokens.color.primary : tokens.color.subtext}
            />
            <Text style={[s.tabText, activeTab === "plan" && s.tabTextActive]}>
              Your Plan
            </Text>
          </Pressable>
          <Pressable
            style={[s.tab, activeTab === "pets" && s.tabActive]}
            onPress={() => setActiveTab("pets")}
          >
            <Ionicons
              name="paw-outline"
              size={14}
              color={activeTab === "pets" ? tokens.color.primary : tokens.color.subtext}
            />
            <Text style={[s.tabText, activeTab === "pets" && s.tabTextActive]}>
              Pet Checklist
            </Text>
          </Pressable>
        </View>
      )}

      {!hasPets && (
        <Pressable
          style={s.petToggleRow}
          onPress={() => {
            setHasPets(true);
            if (petData) setActiveTab("pets");
          }}
        >
          <Ionicons name="paw-outline" size={16} color={tokens.color.subtext} />
          <Text style={s.petToggleText}>Traveling with pets?</Text>
          <Ionicons name="add-circle-outline" size={16} color={tokens.color.primary} />
        </Pressable>
      )}

      {activeTab === "plan" && (
        <>
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
            {resolvedSteps.map((step) => (
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
        </>
      )}

      {activeTab === "pets" && hasPets && activeCountrySlug && (
        <>
          <PetChecklist
            countrySlug={activeCountrySlug}
            completedSteps={completedSteps}
            onCompleteStep={completeStep}
            onUncompleteStep={uncompleteStep}
          />
          <Pressable
            style={s.petDismissRow}
            onPress={() => {
              setHasPets(false);
              setActiveTab("plan");
            }}
          >
            <Text style={s.petDismissText}>Not traveling with pets</Text>
          </Pressable>
        </>
      )}
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
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  headerProgress: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
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
    fontFamily: tokens.font.bodyBold,
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
    backgroundColor: tokens.color.tealLight,
  },
  stepCardDone: {
    borderColor: tokens.color.teal,
    backgroundColor: tokens.color.tealLight,
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
    fontFamily: tokens.font.bodyBold,
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
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  stepProgress: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  stepBody: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.sm,
  },
  stepDescription: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
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
    borderColor: tokens.color.teal,
    backgroundColor: tokens.color.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: tokens.color.teal,
    borderColor: tokens.color.teal,
  },
  checklistLabel: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  checklistLabelChecked: {
    color: tokens.color.subtext,
    textDecorationLine: "line-through" as const,
  },
  groupHeader: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginTop: tokens.space.md,
    marginBottom: 2,
  },
  disclaimer: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    fontStyle: "italic" as const,
    marginTop: tokens.space.md,
    lineHeight: 18,
  },
  tabRow: {
    flexDirection: "row" as const,
    gap: tokens.space.xs,
    backgroundColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.sm,
  },
  tabActive: {
    backgroundColor: tokens.color.surface,
  },
  tabText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
  },
  tabTextActive: {
    color: tokens.color.primary,
  },
  petToggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderStyle: "dashed" as const,
    backgroundColor: tokens.color.surface,
  },
  petToggleText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  petContainer: {
    gap: tokens.space.md,
  },
  petSummaryCard: {
    flexDirection: "row" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },
  petSummaryText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  petWarningCard: {
    flexDirection: "row" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.goldLight,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    borderWidth: 1,
    borderColor: tokens.color.gold,
  },
  petWarningText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.gold,
    lineHeight: 18,
  },
  petProgress: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  petDismissRow: {
    alignItems: "center" as const,
    paddingVertical: tokens.space.sm,
  },
  petDismissText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  sourcesSection: {
    marginTop: tokens.space.md,
    gap: tokens.space.xs,
  },
  sourcesTitle: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sourceRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 4,
  },
  sourceLabel: {
    flex: 1,
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.primary,
    lineHeight: 16,
  },
} as const;
