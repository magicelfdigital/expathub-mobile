import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  type DimensionValue,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useBookmarks } from "@/contexts/BookmarkContext";
import { useCountry } from "@/contexts/CountryContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { usePlan } from "@/src/contexts/PlanContext";
import { PlannerConfetti } from "@/src/components/PlannerConfetti";
import { PlannerLegacyStepBody } from "@/src/components/PlannerLegacyStepBody";
import { useProgress } from "@/src/hooks/useProgress";
import { useAutoCompletePlannerSteps } from "@/src/hooks/useAutoCompletePlannerSteps";
import { PLANNER_BOUNCE_THRESHOLD_MS, trackEvent } from "@/src/lib/analytics";
import {
  GENERIC_PLAN_STEPS,
  PLAN_STAGES,
  PLAN_UPSELL_COPY,
  type GenericPlanStep,
  type PlanStageKey,
} from "@/src/data/planSteps";
import {
  shouldFirePlannerCompleted,
  shouldResetPlannerCompletionGuard,
} from "@/src/data/plannerCompletion";
import { getCountry, getPathways, isLaunchCountry } from "@/src/data";
import { tokens } from "@/theme/tokens";
import { PAID_TIER_DISPLAY_NAME } from "@/constants/tiers";
import EligibilitySnapshot from "@/src/components/EligibilitySnapshot";
import { PATHWAYS } from "@/data/pathways";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

type StepWithDone = GenericPlanStep & { done: boolean };

function StageGroup({
  stage,
  steps,
  countrySlug,
  countryName,
  pathwayId,
  isPaid,
  isPending,
  onToggle,
  onUpsell,
  expandedId,
  setExpandedId,
}: {
  stage: { key: PlanStageKey; title: string };
  steps: StepWithDone[];
  countrySlug: string;
  countryName: string;
  pathwayId?: string | null;
  isPaid: boolean;
  isPending: boolean;
  onToggle: (id: string) => void;
  onUpsell: () => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  if (steps.length === 0) return null;
  return (
    <View style={styles.stageGroup}>
      <Text style={styles.stageHeading}>{stage.title}</Text>
      <View style={styles.stageList}>
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            countrySlug={countrySlug}
            countryName={countryName}
            pathwayId={pathwayId}
            isPaid={isPaid}
            isPending={isPending}
            onToggle={onToggle}
            onUpsell={onUpsell}
            expanded={expandedId === step.id}
            onExpand={() => setExpandedId(expandedId === step.id ? null : step.id)}
          />
        ))}
      </View>
    </View>
  );
}

function StepCard({
  step,
  countrySlug,
  countryName,
  pathwayId,
  isPaid,
  isPending,
  onToggle,
  onUpsell,
  expanded,
  onExpand,
}: {
  step: StepWithDone;
  countrySlug: string;
  countryName: string;
  pathwayId?: string | null;
  isPaid: boolean;
  isPending: boolean;
  onToggle: (id: string) => void;
  onUpsell: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const handleCheckboxPress = () => {
    if (!isPaid) {
      onUpsell();
      return;
    }
    onToggle(step.id);
  };

  const hasReference =
    isPaid &&
    ((step.legacyModuleIds && step.legacyModuleIds.length > 0) ||
      step.id === "research_quiz" ||
      step.id === "school_research" ||
      step.id === "move_date_set" ||
      step.id === "housing_research" ||
      step.id === "flight_booked");

  return (
    <View
      style={[
        styles.stepCard,
        step.done && styles.stepCardDone,
      ]}
    >
      <View style={styles.stepRow}>
        <Pressable
          onPress={handleCheckboxPress}
          style={styles.checkboxPressable}
          testID={`planner-step-checkbox-${step.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: step.done, disabled: !isPaid }}
        >
          <View
            style={[
              styles.checkbox,
              step.done && styles.checkboxChecked,
              !isPaid && styles.checkboxDisabled,
            ]}
          >
            {step.done ? (
              <Ionicons name="checkmark" size={14} color={tokens.color.white} />
            ) : !isPaid ? (
              <Ionicons name="lock-closed" size={11} color={tokens.color.subtext} />
            ) : null}
          </View>
        </Pressable>

        <Pressable
          style={styles.stepBody}
          onPress={isPaid ? onExpand : onUpsell}
        >
          <Text
            style={[
              styles.stepTitle,
              step.done && styles.stepTitleDone,
            ]}
          >
            {step.title}
          </Text>
          <Text style={styles.stepDescription} numberOfLines={expanded ? undefined : 2}>
            {step.description}
          </Text>
          {step.autoCompleteHint && (
            <Text style={styles.autoHint}>{step.autoCompleteHint}</Text>
          )}
        </Pressable>

        {hasReference ? (
          <Pressable onPress={onExpand} hitSlop={8} style={styles.chevron}>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={tokens.color.subtext}
            />
          </Pressable>
        ) : null}
      </View>

      {expanded && (
        <View style={styles.stepReference}>
          <ReferencePanel
            step={step}
            countrySlug={countrySlug}
            countryName={countryName}
            pathwayId={pathwayId}
          />
        </View>
      )}

      {!isPaid && (
        <Pressable onPress={onUpsell} style={styles.upsellRow}>
          <Ionicons name="lock-closed-outline" size={12} color={tokens.color.primary} />
          <Text style={styles.upsellText}>{PLAN_UPSELL_COPY.title}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ReferencePanel({
  step,
  countrySlug,
  countryName,
  pathwayId,
}: {
  step: GenericPlanStep;
  countrySlug: string;
  countryName: string;
  pathwayId?: string | null;
}) {
  const router = useRouter();

  if (step.id === "research_quiz") {
    return (
      <View style={styles.referenceTextWrap}>
        <Text style={styles.referenceBody}>
          Retake the 90-second readiness quiz any time. Your latest score replaces the previous one and updates your country matches.
        </Text>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/onboarding/quiz" as any,
              params: { mode: "retake" },
            })
          }
          style={styles.referenceCta}
          testID="planner-retake-quiz"
        >
          <Ionicons name="refresh" size={14} color={tokens.color.white} />
          <Text style={styles.referenceCtaText}>Retake the quiz</Text>
        </Pressable>
      </View>
    );
  }

  // visa pathway: pair EligibilitySnapshot with the confirm_pathway checklist
  if (step.id === "visa_pathway" && countrySlug) {
    return (
      <View style={styles.legacyWrap}>
        {pathwayId ? (
          <EligibilitySnapshot
            countrySlug={countrySlug}
            pathwayId={pathwayId}
            availablePathways={(PATHWAYS[countrySlug] ?? []).map((p) => ({
              key: p.key,
              title: p.title,
            }))}
          />
        ) : null}
        <PlannerLegacyStepBody
          legacyStepIds={step.legacyModuleIds ?? ["confirm_pathway"]}
          countrySlug={countrySlug}
        />
      </View>
    );
  }

  if (step.legacyModuleIds && step.legacyModuleIds.length > 0 && countrySlug) {
    return (
      <PlannerLegacyStepBody
        legacyStepIds={step.legacyModuleIds}
        countrySlug={countrySlug}
      />
    );
  }

  if (step.id === "flight_booked" && countrySlug) {
    return (
      <View style={styles.referenceTextWrap}>
        <Text style={styles.referenceBody}>
          Wait until your visa is approved before locking in non-refundable flights. Build in a few buffer days for residency-card pickup and address registration.
        </Text>
        <PlannerLegacyStepBody
          legacyStepIds={[]}
          countrySlug={countrySlug}
          showPetRequirements
        />
      </View>
    );
  }

  if (step.id === "housing_research") {
    return (
      <View style={styles.referenceTextWrap}>
        <Text style={styles.referenceBody}>
          Pick a target neighbourhood, set a monthly budget, and shortlist 3-5 long-term rentals. Booking a 30-day short-term let on arrival gives you time to view places in person before signing a lease.
        </Text>
      </View>
    );
  }

  if (step.id === "school_research") {
    return (
      <View style={styles.referenceTextWrap}>
        <Text style={styles.referenceBody}>
          If you're not moving with school-age dependants, mark this one done and skip ahead.
          Otherwise, line up applications early — international and bilingual schools fill up
          months in advance.
        </Text>
      </View>
    );
  }

  if (step.id === "move_date_set") {
    return (
      <View style={styles.referenceTextWrap}>
        <Text style={styles.referenceBody}>
          Pick a target departure date, then back-plan: shipping container booking (2–3 months
          out), pet travel (1–2 months out), final utilities and lease cancellations (4 weeks out).
        </Text>
      </View>
    );
  }

  return null;
}

export default function PlannerScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { selectedCountrySlug } = useCountry();
  const {
    hasActiveSubscription,
    hasFullAccess,
    loading: subscriptionLoading,
    lastRefreshAt,
  } = useSubscription();
  const { loading: authLoading, token } = useAuth();
  const {
    activeCountrySlug: planCountrySlug,
    activePathwayId,
    startPlan,
    isLoaded: planLoaded,
  } = usePlan();
  const { quizResult } = useOnboarding();
  const { bookmarkCount } = useBookmarks();

  const urlSlug = typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : "";
  const countrySlug = urlSlug || selectedCountrySlug || "";

  const countryName = useMemo(() => {
    if (!countrySlug) return "Country";
    return getCountry(countrySlug)?.name ?? "Country";
  }, [countrySlug]);

  const pathways = useMemo(() => getPathways(countrySlug), [countrySlug]);
  const isLaunch = useMemo(() => isLaunchCountry(countrySlug), [countrySlug]);
  const hasPlanForThisCountry = planCountrySlug === countrySlug;
  // Canonical entitlement: full subscription access. Per-country lifetime
  // unlocks were dropped in the 2-tier model.
  const isPaidUser = hasActiveSubscription || hasFullAccess;

  const {
    isStepComplete,
    setStep,
    toggleStep,
    completedCount,
    percent,
    isPending,
    isReady,
    isLoading: progressLoading,
  } = useProgress(hasPlanForThisCountry ? countrySlug : null);

  useAutoCompletePlannerSteps({
    countrySlug,
    isPaidUser,
    isReady,
    progressLoading,
    hasPlanForThisCountry,
    quizResult,
    bookmarkCount,
    isStepComplete,
    setStep,
  });

  const [showConfetti, setShowConfetti] = useState(false);
  const firedConfettiRef = useRef(false);
  useEffect(() => {
    if (
      shouldFirePlannerCompleted({
        percent,
        hasPlanForThisCountry,
        isPaidUser,
        alreadyFired: firedConfettiRef.current,
      })
    ) {
      firedConfettiRef.current = true;
      setShowConfetti(true);
      trackEvent("planner_completed", { country: countrySlug });
    }
    if (shouldResetPlannerCompletionGuard(percent)) {
      firedConfettiRef.current = false;
    }
  }, [percent, hasPlanForThisCountry, isPaidUser, countrySlug]);

  const [confettiSize, setConfettiSize] = useState({ width: 360, height: 600 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setConfettiSize({ width, height });
  }, []);

  const grouped = useMemo(() => {
    return PLAN_STAGES.map((stage) => ({
      stage,
      steps: GENERIC_PLAN_STEPS.filter((s) => s.stage === stage.key).map((step) => ({
        ...step,
        done: isStepComplete(step.id),
      })) as StepWithDone[],
    }));
  }, [isStepComplete]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const trackedExpansionsRef = useRef<Set<string>>(new Set());
  const openedStepRef = useRef<
    { stepId: string; country: string; openedAt: number } | null
  >(null);
  const isPaidUserRef = useRef(isPaidUser);
  useEffect(() => {
    isPaidUserRef.current = isPaidUser;
  }, [isPaidUser]);
  useEffect(() => {
    trackedExpansionsRef.current = new Set();
  }, [countrySlug]);

  const fireCollapsed = useCallback(() => {
    const open = openedStepRef.current;
    if (!open || !isPaidUserRef.current) {
      openedStepRef.current = null;
      return;
    }
    const msOpen = Date.now() - open.openedAt;
    // Tag very-short open/close cycles as bounced so the analytics
    // warehouse can filter accidental taps / fat-fingered chevron
    // presses out of the dwell-time distribution without losing the
    // signal entirely (the event itself is still emitted, including
    // the unmount-on-close case where the user opened a step then
    // immediately navigated away).
    // See PLANNER_BOUNCE_THRESHOLD_MS in src/lib/analytics.ts.
    trackEvent("planner_step_collapsed", {
      stepId: open.stepId,
      country: open.country,
      msOpen,
      bounced: msOpen < PLANNER_BOUNCE_THRESHOLD_MS,
    });
    openedStepRef.current = null;
  }, []);

  const handleSetExpandedId = useCallback(
    (nextId: string | null) => {
      if (nextId !== expandedId && isPaidUser) {
        if (openedStepRef.current) {
          fireCollapsed();
        }
        if (nextId !== null) {
          openedStepRef.current = {
            stepId: nextId,
            country: countrySlug,
            openedAt: Date.now(),
          };
          if (!trackedExpansionsRef.current.has(nextId)) {
            trackedExpansionsRef.current.add(nextId);
            trackEvent("planner_step_expanded", {
              stepId: nextId,
              country: countrySlug,
            });
          }
        }
      }
      setExpandedId(nextId);
    },
    [expandedId, isPaidUser, countrySlug, fireCollapsed],
  );

  useEffect(() => {
    return () => {
      fireCollapsed();
    };
  }, [fireCollapsed]);

  const handleUpsell = useCallback(() => {
    router.push({
      pathname: "/subscribe",
      params: { country: countrySlug },
    });
  }, [router, countrySlug]);

  // Render gate. Hold a calm neutral state until every async source that
  // decides which body to render has settled, then latch "ready" so later
  // background refreshes never flash the screen back to a spinner.
  //
  // The cold-start trap: the entitlement check runs once *before* the auth
  // token has hydrated from secure store. That first pass has no token, so it
  // returns "not subscribed" yet still stamps lastRefreshAt — which would open
  // a naive gate on a transient free/locked layout. The token then hydrates, a
  // second check runs, isPaidUser flips true, and the real tracker replaces the
  // preview. To the user that reads as a flicker. We therefore only trust an
  // entitlement result recorded *after* auth settled: for a signed-in session
  // we require lastRefreshAt >= authReadyAt; signed-out users have no post-auth
  // refresh, so the first settled result is already correct. We also wait for
  // the first progress fetch when a plan exists so the step count does not jump
  // from 0% to its real value.
  const authReadyAtRef = useRef<number | null>(null);
  const screenReadyRef = useRef(false);
  if (!screenReadyRef.current && !authLoading) {
    if (authReadyAtRef.current == null) authReadyAtRef.current = Date.now();
    const hasSession = !!token;
    // Entitlement is settled when no refresh is in flight AND one of:
    //  - lastRefreshAt is null: entitlement reached a terminal state without
    //    ever recording a refresh (e.g. the RC init error path sets loading
    //    false but never stamps lastRefreshAt) — treat as settled and fail
    //    closed rather than spin on a spinner forever.
    //  - signed-out: the first settled (token-less) result is already correct.
    //  - signed-in: trust only an entitlement recorded AFTER auth settled, so
    //    the pre-token false-negative refresh is ignored.
    const entitlementSettled =
      !subscriptionLoading &&
      (lastRefreshAt == null ||
        !hasSession ||
        lastRefreshAt >= authReadyAtRef.current);
    const progressSettled = !hasPlanForThisCountry || !progressLoading;
    // Latch once every driver has settled, so a later background entitlement
    // or progress refresh (which briefly flips its loading flag) never sends
    // the screen back to a spinner.
    if (entitlementSettled && planLoaded && progressSettled) {
      screenReadyRef.current = true;
    }
  }
  const screenReady = screenReadyRef.current;

  if (!screenReady) {
    return (
      <Screen>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={tokens.color.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Your Plan</Text>
            <Text style={styles.subtitle}>
              {hasPlanForThisCountry
                ? `Step-by-step relocation tracker for ${countryName}.`
                : `Start a structured plan for ${countryName}.`}
            </Text>
          </View>

          {hasPlanForThisCountry ? (
            <>
              <View style={styles.progressCard}>
                <View style={styles.progressTopRow}>
                  <View style={styles.progressTextWrap}>
                    <Text style={styles.progressCount}>
                      {completedCount} of {GENERIC_PLAN_STEPS.length} steps complete
                    </Text>
                    <Text style={styles.progressSub}>
                      Track every macro stage of your move.
                    </Text>
                  </View>
                  <Text style={styles.progressPercent}>{percent}%</Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${percent}%` as DimensionValue },
                    ]}
                  />
                </View>
              </View>

              {grouped.map((g) => (
                <StageGroup
                  key={g.stage.key}
                  stage={g.stage}
                  steps={g.steps}
                  countrySlug={countrySlug}
                  countryName={countryName}
                  pathwayId={activePathwayId}
                  isPaid={isPaidUser}
                  isPending={isPending}
                  onToggle={toggleStep}
                  onUpsell={handleUpsell}
                  expandedId={expandedId}
                  setExpandedId={handleSetExpandedId}
                />
              ))}
            </>
          ) : isPaidUser && isLaunch && pathways.length > 0 ? (
            <View style={styles.focusSection}>
              <View style={styles.focusIconRow}>
                <View style={styles.focusIconCircle}>
                  <Ionicons name="flag-outline" size={20} color={tokens.color.primary} />
                </View>
              </View>
              <Text style={styles.focusTitle}>Turn this into a structured plan</Text>
              <Text style={styles.focusBody}>
                If this country feels like a strong option, you can focus here and walk
                through the 10-step relocation tracker.
              </Text>
              <Pressable
                style={styles.focusButton}
                onPress={() => {
                  const firstPathway = pathways[0];
                  if (!firstPathway) return;
                  startPlan(countrySlug, firstPathway.key, countryName);
                }}
              >
                <Ionicons name="flag" size={16} color={tokens.color.white} />
                <Text style={styles.focusButtonText}>Focus on {countryName}</Text>
              </Pressable>
              <Text style={styles.focusMicrocopy}>You can switch your focus at any time.</Text>
            </View>
          ) : !isPaidUser && isLaunch ? (
            <>
              {/* Free preview — show all 10 step titles with locked checkboxes */}
              <View style={styles.progressCard}>
                <View style={styles.progressTopRow}>
                  <View style={styles.progressTextWrap}>
                    <Text style={styles.progressCount}>
                      {PLAN_UPSELL_COPY.freePreviewProgressLabel(GENERIC_PLAN_STEPS.length)}
                    </Text>
                    <Text style={styles.progressSub}>
                      {PLAN_UPSELL_COPY.freePreviewProgressSub(PAID_TIER_DISPLAY_NAME)}
                    </Text>
                  </View>
                  <Text style={styles.progressPercent}>0%</Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: "0%" }]} />
                </View>
              </View>

              {grouped.map((g) => (
                <StageGroup
                  key={g.stage.key}
                  stage={g.stage}
                  steps={g.steps}
                  countrySlug={countrySlug}
                  countryName={countryName}
                  pathwayId={null}
                  isPaid={false}
                  isPending={false}
                  onToggle={() => undefined}
                  onUpsell={handleUpsell}
                  expandedId={expandedId}
                  setExpandedId={handleSetExpandedId}
                />
              ))}

              <Pressable style={styles.focusButton} onPress={handleUpsell}>
                <Text style={styles.focusButtonText}>View plans</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.lockedSection}>
              <Ionicons name="time-outline" size={28} color={tokens.color.subtext} />
              <Text style={styles.lockedTitle}>{PLAN_UPSELL_COPY.comingSoonTitle}</Text>
              <Text style={styles.lockedBody}>
                {PLAN_UPSELL_COPY.comingSoonBody(countryName)}
              </Text>
            </View>
          )}
        </ScrollView>

        <PlannerConfetti
          visible={showConfetti}
          width={confettiSize.width}
          height={confettiSize.height}
          onComplete={() => setShowConfetti(false)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  loadingWrap: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.lg,
  },
  header: {
    gap: tokens.space.xs,
    marginBottom: tokens.space.sm,
  },
  title: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  subtitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  progressCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.teal,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  progressTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
  },
  progressTextWrap: {
    flex: 1,
    gap: 2,
  },
  progressCount: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  progressSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  progressPercent: {
    fontSize: 32,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.teal,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.border,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.teal,
  },
  stageGroup: {
    gap: tokens.space.sm,
  },
  stageHeading: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stageList: {
    gap: tokens.space.sm,
  },
  stepCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    gap: tokens.space.sm,
  },
  stepCardDone: {
    borderColor: tokens.color.teal,
    backgroundColor: tokens.color.tealLight,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space.sm,
  },
  checkboxPressable: {
    paddingTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: tokens.color.teal,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: tokens.color.teal,
    borderColor: tokens.color.teal,
  },
  checkboxDisabled: {
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  stepTitleDone: {
    color: tokens.color.subtext,
  },
  stepDescription: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  autoHint: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.primary,
    marginTop: 2,
  },
  chevron: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  stepReference: {
    paddingTop: tokens.space.xs,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    marginTop: tokens.space.xs,
  },
  legacyWrap: {
    gap: tokens.space.md,
  },
  referenceTextWrap: {
    paddingTop: tokens.space.sm,
    gap: tokens.space.xs,
  },
  referenceTitle: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  referenceBody: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  referenceCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
  },
  referenceCtaText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.white,
  },
  upsellRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: tokens.space.xs,
  },
  upsellText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.primary,
  },
  focusSection: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.xl,
    alignItems: "center",
    gap: tokens.space.sm,
  },
  focusIconRow: {
    marginBottom: tokens.space.xs,
  },
  focusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  focusTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.text,
    textAlign: "center",
  },
  focusBody: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    textAlign: "center",
  },
  focusButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    paddingHorizontal: tokens.space.xl,
    marginTop: tokens.space.xs,
  },
  focusButtonText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  },
  focusMicrocopy: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
  },
  lockedSection: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.xl,
    alignItems: "center",
    gap: tokens.space.sm,
  },
  lockedTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.text,
    textAlign: "center",
  },
  lockedBody: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    textAlign: "center",
  },
});
