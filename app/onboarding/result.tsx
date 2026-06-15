import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DragBottomSheet, type DragBottomSheetHandle } from "@/src/components/DragBottomSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  calculateQuizResult,
  getReadinessLabel,
  MAX_SCORE,
  type Blocker,
  type BlockerLevel,
  type ReadinessLevel,
} from "@/src/data/quiz";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlement } from "@/src/contexts/EntitlementContext";
import { tokens } from "@/theme/tokens";
import { trackEvent, logFbEvent, identifyByEmail } from "@/src/lib/analytics";
import { cancelQuizReminders } from "@/src/lib/notifications";
import { maybeRequestReview } from "@/src/lib/rating";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setUserAttributes } from "@/src/subscriptions/revenuecat";
import {
  buildLeadSavePayload,
  buildResultCtaPayload,
  deriveResultFirstName,
  getResultFillPercent,
  groupBlockersByLevel,
  isValidResultEmail,
  shouldShowPaywallAfterUrgent,
} from "@/src/onboarding/resultFlow";
import { WORKSHEET_BY_QUESTION_ID } from "@/src/data/worksheets";
import { QuizSaveModal } from "@/src/components/QuizSaveModal";
import { WorksheetDeltaBanner } from "@/src/components/WorksheetDeltaBanner";
import type { WorksheetDelta } from "@/src/onboarding/worksheetDelta";

const READINESS_COLORS: Record<ReadinessLevel, string> = {
  just_getting_started: "#9BA8C0",
  curious_explorer: tokens.color.primary,
  serious_researcher: tokens.color.teal,
  ready_to_plan: tokens.color.teal,
};

const LEVEL_COLORS: Record<BlockerLevel, { border: string; bg: string; label: string; chip: string }> = {
  critical: { border: "#D9534F", bg: "#FDF2F1", label: "Critical", chip: "#D9534F" },
  moderate: { border: "#E8991A", bg: "#FFF8E8", label: "Moderate", chip: "#E8991A" },
  explore: { border: "#3E81DD", bg: "#EEF4FC", label: "Explore", chip: "#3E81DD" },
};

const SECTION_TITLES: Record<BlockerLevel, string> = {
  critical: "What's holding you back most",
  moderate: "Worth your attention",
  explore: "Areas to explore",
};

function getBaseUrl(): string {
  if (Platform.OS === "web") return getApiUrl().replace(/\/$/, "");
  return getBackendBase();
}

function BlockerCard({
  blocker,
  onPress,
}: {
  blocker: Blocker;
  onPress: (b: Blocker) => void;
}) {
  const c = LEVEL_COLORS[blocker.level];
  return (
    <Pressable
      onPress={() => onPress(blocker)}
      style={({ pressed }) => [
        styles.blockerCard,
        { borderLeftColor: c.border, backgroundColor: c.bg },
        pressed && { opacity: 0.92 },
      ]}
      testID={`blocker-card-${blocker.questionId}`}
      accessibilityRole="button"
      accessibilityLabel={`${c.label}: ${blocker.title}`}
      accessibilityHint="Opens details with the option to update this score"
    >
      <View style={styles.blockerHeader}>
        <View style={[styles.levelChip, { backgroundColor: c.chip }]}>
          <Text style={styles.levelChipText}>{c.label}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={18} color={tokens.color.subtext} />
      </View>
      <Text style={styles.blockerTitle}>{blocker.title}</Text>
      <Text style={styles.blockerBody} numberOfLines={2}>
        {blocker.whatThisMeans}
      </Text>
    </Pressable>
  );
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { answers: answersStr } = useLocalSearchParams<{ answers?: string }>();
  const {
    completeOnboarding,
    quizResult: persistedQuizResult,
    pendingWorksheetDelta,
    clearPendingWorksheetDelta,
  } = useOnboarding();
  const { user } = useAuth();
  const { hasProAccess, loading: entitlementLoading } = useEntitlement();

  type AnswersShape = Record<string, unknown> & {
    firstName?: string;
    first_name?: string;
  };

  const answers = useMemo<AnswersShape>(() => {
    try {
      const parsed = JSON.parse(answersStr ?? "{}");
      return parsed && typeof parsed === "object" ? (parsed as AnswersShape) : {};
    } catch {
      return {};
    }
  }, [answersStr]);

  // Prefer the persisted, worksheet-adjusted QuizResult from context when
  // it exists — so returning to this screen after submitting a worksheet
  // shows the new readiness numbers, not the original quiz baseline.
  // Fall back to deriving from the URL `answers` param for the first-run
  // post-quiz flow (where the context may not yet be populated).
  const freshResult = useMemo(
    () => calculateQuizResult(answers as unknown as Record<number, string>),
    [answers],
  );
  const result = useMemo(
    () => persistedQuizResult ?? freshResult,
    [persistedQuizResult, freshResult],
  );

  // Q1–Q9 answers in the canonical numeric-keyed shape that
  // calculateQuizResultWithWorksheets expects, persisted alongside the
  // result so worksheet submissions can re-derive readiness without losing
  // somewhat / not_sure / region info.
  const numericAnswers = useMemo<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (let i = 1; i <= 9; i++) {
      const v = (answers as Record<string, unknown>)[String(i)];
      if (typeof v === "string") out[i] = v;
    }
    return out;
  }, [answers]);

  const readiness = useMemo(
    () => result.readiness ?? getReadinessLabel(result.score, result.maxScore ?? MAX_SCORE),
    [result.readiness, result.score, result.maxScore],
  );
  const maxScore = result.maxScore ?? MAX_SCORE;

  const viewedRef = React.useRef(false);
  React.useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      trackEvent("result_screen_viewed", {
        matchScore: result.score,
        readiness_level: readiness.level,
      });
      logFbEvent("CompletedQuiz", undefined, {
        top_country: result.topMatch?.slug ?? "none",
        readiness_level: readiness.level,
      });

      // Persist quiz attributes for personalized paywall + RC analytics
      const topCountry = result.topMatch?.slug ?? null;
      const firstName = deriveResultFirstName({
        answers,
        userEmail: user?.email ?? null,
      });

      (async () => {
        try {
          if (topCountry) await AsyncStorage.setItem("user_top_country", topCountry);
          if (firstName) await AsyncStorage.setItem("user_first_name", firstName);
          await AsyncStorage.setItem("user_quiz_completed", "true");
        } catch {}
        try {
          await setUserAttributes({
            top_country: topCountry,
            first_name: firstName,
            quiz_completed: "true",
            quiz_readiness_level: readiness.level,
            quiz_score: String(result.score),
          });
        } catch {}
      })();

      // Quiz is complete: cancel the re-engagement reminders, then offer the
      // App Store rating prompt (gated on dwell time and shown only once).
      (async () => {
        await cancelQuizReminders();
        await maybeRequestReview();
      })();
    }
  }, [result, readiness, answers, user?.email]);

  const tierColor = READINESS_COLORS[readiness.level];
  const fillPct = getResultFillPercent(result.score, maxScore);

  const grouped = useMemo(
    () => groupBlockersByLevel(result.blockers),
    [result.blockers],
  );

  const realCounts = useMemo(
    () => ({
      critical: grouped.critical.length,
      moderate: grouped.moderate.length,
      explore: grouped.explore.length,
    }),
    [grouped.critical.length, grouped.moderate.length, grouped.explore.length],
  );

  // One-shot capture of a pending worksheet delta so animations start from
  // the "before" state and the banner doesn't re-fire on subsequent renders.
  const [activeDelta, setActiveDelta] = useState<WorksheetDelta | null>(null);
  useEffect(() => {
    if (pendingWorksheetDelta) {
      setActiveDelta(pendingWorksheetDelta);
      clearPendingWorksheetDelta();
    }
  }, [pendingWorksheetDelta, clearPendingWorksheetDelta]);

  const startFillPct = activeDelta
    ? getResultFillPercent(activeDelta.previousScore, activeDelta.previousMax)
    : fillPct;
  const startCounts = activeDelta?.previousCounts ?? realCounts;

  const transition = useRef(new Animated.Value(activeDelta ? 0 : 1)).current;
  const [displayFillPct, setDisplayFillPct] = useState<number>(startFillPct);
  const [displayCounts, setDisplayCounts] = useState(startCounts);

  useEffect(() => {
    if (!activeDelta) {
      transition.setValue(1);
      setDisplayFillPct(fillPct);
      setDisplayCounts(realCounts);
      return;
    }
    transition.setValue(0);
    setDisplayFillPct(startFillPct);
    setDisplayCounts(startCounts);
    const id = transition.addListener(({ value }) => {
      setDisplayFillPct(startFillPct + (fillPct - startFillPct) * value);
      setDisplayCounts({
        critical: Math.round(
          startCounts.critical + (realCounts.critical - startCounts.critical) * value,
        ),
        moderate: Math.round(
          startCounts.moderate + (realCounts.moderate - startCounts.moderate) * value,
        ),
        explore: Math.round(
          startCounts.explore + (realCounts.explore - startCounts.explore) * value,
        ),
      });
    });
    Animated.timing(transition, {
      toValue: 1,
      duration: 900,
      delay: 200,
      useNativeDriver: false,
    }).start();
    return () => transition.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDelta]);

  const animatedBarWidth = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [`${startFillPct}%`, `${fillPct}%`],
  });

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [saveCardDismissed, setSaveCardDismissed] = useState(false);
  const [savePromptVisible, setSavePromptVisible] = useState(false);
  const savePromptShownRef = React.useRef(false);

  // Replaces the mid-quiz save modal. Trigger the same email-capture moment
  // here on the result screen, AFTER the score is revealed, when the user
  // landed with at least 3 "no" answers. Analytics events (quiz_save_shown
  // / quiz_save_submitted / quiz_save_dismissed) are still fired from the
  // QuizSaveModal component itself so existing dashboards keep working.
  const savePromptNoCount = useMemo(() => {
    let n = 0;
    for (let i = 1; i <= 9; i++) {
      if ((answers as Record<string, unknown>)[String(i)] === "no") n++;
    }
    return n;
  }, [answers]);

  React.useEffect(() => {
    if (savePromptShownRef.current) return;
    if (savePromptNoCount < 3) return;
    savePromptShownRef.current = true;
    // Let the result reveal land before surfacing the ask.
    const t = setTimeout(() => setSavePromptVisible(true), 900);
    return () => clearTimeout(t);
  }, [savePromptNoCount]);

  const handleEmailResults = async () => {
    const addr = email;
    if (!isValidResultEmail(addr)) return;
    setEmailSending(true);
    // Promote the live mobile distinct_id from `anon:<random>` to
    // `email:<sha256>` BEFORE the POST so the `/api/readiness-lead` and the
    // subsequent `readiness_lead_saved` event both land on the same
    // email-keyed distinct_id. Mirrors what `identifyByEmail` does on web.
    identifyByEmail(addr);
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/readiness-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addr,
          score: result.score,
          // Server stores this in `readiness_level` and dual-writes to the
          // legacy `tier` column during the rename rollout (task #115).
          readinessLevel: readiness.level,
          risks: result.risks,
          answers,
        }),
      });
      // Only mark "sent" and fire the funnel event if the backend
      // actually accepted the lead. A 4xx/5xx must NOT count as a saved
      // lead (would over-report conversions in PostHog and confuse the
      // user with a "we got it" UI when we didn't).
      if (res?.ok) {
        setEmailSent(true);
        trackEvent(
          "readiness_lead_saved",
          buildLeadSavePayload({
            readinessLevel: readiness.level,
            score: result.score,
          }),
        );
        // Mid-funnel signal for Meta App Promotion: the readiness-quiz email
        // gate is another email-capture surface, so emit `Lead` here too —
        // mirroring the country waitlist and web quiz-save modal. No raw
        // email is forwarded into the payload (PII guardrail).
        logFbEvent("Lead", undefined, { source: "readiness_quiz_gate" });
      }
    } catch {} finally { setEmailSending(false); }
  };

  const handleCreateAccount = async () => {
    await completeOnboarding(result, false, numericAnswers);
    trackEvent(
      "quiz_completed",
      buildResultCtaPayload({
        action: "create_account",
        readinessLevel: readiness.level,
        score: result.score,
      }),
    );
    // If the user has urgent blockers, the result screen would normally
    // surface an "Unlock your full roadmap" CTA — but only to logged-in
    // users. Without a redirectTo, post-signup the user lands on the
    // home tab and never sees the paywall. Carry the paywall destination
    // through signup so the trial offer is presented immediately after.
    const shouldRouteToPaywall = shouldShowPaywallAfterUrgent(result.blockers);
    if (shouldRouteToPaywall) {
      const redirectTo =
        `/subscribe?entryPoint=result_screen&unlockLabel=${encodeURIComponent("your full readiness roadmap")}`;
      router.replace(
        `/auth?mode=register&redirectTo=${encodeURIComponent(redirectTo)}` as any,
      );
    } else {
      router.replace("/auth?mode=register");
    }
  };

  const handleContinue = async () => {
    await completeOnboarding(result, true, numericAnswers);
    trackEvent(
      "quiz_completed",
      buildResultCtaPayload({
        action: "continue",
        readinessLevel: readiness.level,
        score: result.score,
      }),
    );
    router.replace("/(tabs)/(home)");
  };

  const handleUnlockRoadmap = async () => {
    await completeOnboarding(result, true, numericAnswers);
    trackEvent("paywall_unlock_tapped", { source: "result_screen", readiness_level: readiness.level });
    // Pass surface so ProPaywall tags its own view/dismiss/conversion
    // events with `entryPoint: "result_screen"`, keeping this placement
    // distinguishable from the legacy mid-list paywall in dashboards.
    router.push({
      pathname: "/subscribe" as any,
      params: {
        entryPoint: "result_screen",
        unlockLabel: "your full readiness roadmap",
      },
    });
  };

  const handleRestart = () => {
    router.replace("/onboarding/quiz");
  };

  const handleEditAnswers = () => {
    trackEvent("result_edit_answers_tapped", {
      readiness_level: readiness.level,
    });
    router.replace({
      pathname: "/onboarding/quiz",
      params: { prefill: JSON.stringify(answers), edit: "1" },
    });
  };

  const handleExploreTopMatch = async () => {
    if (!result.topMatch?.slug) return;
    await completeOnboarding(result, true, numericAnswers);
    trackEvent("result_top_match_tapped", {
      country: result.topMatch.slug,
      readiness_level: readiness.level,
    });
    router.push({
      pathname: "/(tabs)/(home)/country/[slug]",
      params: { slug: result.topMatch.slug },
    } as any);
  };

  const renderSaveCard = () => {
    if (emailSent) {
      return (
        <View style={styles.card}>
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color={tokens.color.teal} />
            <Text style={styles.successText}>Sent. Check your inbox — your full breakdown is on its way.</Text>
          </View>
        </View>
      );
    }

    if (saveCardDismissed) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.emailLabel}>Save your results</Text>
        <Text style={styles.emailSubtext}>No sales calls. No spam. Just your breakdown.</Text>
        <TextInput
          style={styles.emailInput}
          placeholder="your@email.com"
          placeholderTextColor={tokens.color.subtext}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={handleEmailResults}
          disabled={emailSending}
          style={({ pressed }) => [styles.goldBtn, pressed && { opacity: 0.9 }]}
        >
          {emailSending ? (
            <ActivityIndicator size="small" color={tokens.color.text} />
          ) : (
            <Text style={styles.goldBtnText}>Email me the results</Text>
          )}
        </Pressable>
        <View style={styles.secondaryLinks}>
          <Pressable onPress={() => setSaveCardDismissed(true)} hitSlop={8}>
            <Text style={styles.secondaryLink}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const scrollRef = React.useRef<ScrollView | null>(null);
  const sectionYRef = React.useRef<Record<BlockerLevel, number>>({
    critical: 0,
    moderate: 0,
    explore: 0,
  });

  const [revealedLevels, setRevealedLevels] = useState<Record<BlockerLevel, boolean>>({
    critical: false,
    moderate: false,
    explore: false,
  });
  const [sheetBlocker, setSheetBlocker] = useState<Blocker | null>(null);
  const sheetRef = React.useRef<DragBottomSheetHandle | null>(null);
  const openBlockerSheet = async (blocker: Blocker) => {
    // Single-tap behavior: skip the bottom-sheet intermediary and go
    // straight to the matching worksheet. The sheet UI is retained for
    // any other entry point that still wants it.
    trackEvent("result_blocker_card_tapped", {
      questionId: blocker.questionId,
      level: blocker.level,
    });
    const ws = WORKSHEET_BY_QUESTION_ID[blocker.questionId];
    if (!ws) {
      // Fall back to the sheet if there's no matching worksheet so the
      // user still sees the blocker context rather than a dead tap.
      setSheetBlocker(blocker);
      return;
    }
    trackEvent("result_blocker_worksheet_tapped", {
      questionId: blocker.questionId,
      level: blocker.level,
      worksheet_id: ws.id,
      source: "result_card",
    });
    await completeOnboarding(result, true, numericAnswers);
    router.push(`/(tabs)/(home)/worksheets/${ws.id}` as any);
  };
  const closeSheet = () => setSheetBlocker(null);
  const requestSheetClose = () => {
    if (sheetRef.current) {
      sheetRef.current.close();
    } else {
      closeSheet();
    }
  };
  const scrollToSection = (level: BlockerLevel) => {
    if (grouped[level].length === 0) return;
    const wasRevealed = revealedLevels[level];
    setRevealedLevels((prev) => ({ ...prev, [level]: !wasRevealed }));
    if (wasRevealed) {
      return;
    }
    const doScroll = () => {
      const y = sectionYRef.current[level];
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    };
    setTimeout(doScroll, 60);
    trackEvent("result_pill_opened", { level, count: grouped[level].length });
  };
  const openWorksheetFromSheet = async () => {
    if (!sheetBlocker) return;
    const ws = WORKSHEET_BY_QUESTION_ID[sheetBlocker.questionId];
    if (!ws) return;
    trackEvent("result_blocker_worksheet_tapped", {
      questionId: sheetBlocker.questionId,
      level: sheetBlocker.level,
      worksheet_id: ws.id,
      source: "result_sheet",
    });
    setSheetBlocker(null);
    await completeOnboarding(result, true, numericAnswers);
    router.push(`/(tabs)/(home)/worksheets/${ws.id}` as any);
  };

  const renderBlockerSection = (level: BlockerLevel) => {
    const items = grouped[level];
    if (items.length === 0) return null;
    if (!revealedLevels[level]) return null;
    return (
      <View
        style={styles.blockerSection}
        onLayout={(e) => {
          sectionYRef.current[level] = e.nativeEvent.layout.y;
        }}
      >
        <Text style={styles.sectionHeading}>{SECTION_TITLES[level]}</Text>
        <View style={{ gap: 12 }}>
          {items.map((b) => (
            <BlockerCard key={b.questionId} blocker={b} onPress={openBlockerSheet} />
          ))}
        </View>
      </View>
    );
  };

  const counts = realCounts;
  const hasAnyBlockers =
    counts.critical + counts.moderate + counts.explore > 0 ||
    (activeDelta &&
      activeDelta.previousCounts.critical +
        activeDelta.previousCounts.moderate +
        activeDelta.previousCounts.explore >
        0);
  const primaryCtaLabel = user ? "Continue to ExpatHub" : "Create free account to save";
  const handlePrimaryCta = user ? handleContinue : handleCreateAccount;

  const renderPaywallCta = () => (
    <Pressable
      onPress={handleUnlockRoadmap}
      style={({ pressed }) => [styles.paywallCta, pressed && { opacity: 0.9 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.paywallCtaTitle}>Unlock your full roadmap</Text>
        <Text style={styles.paywallCtaSub}>Country-specific guides, planner, and unlimited compare</Text>
      </View>
      <Ionicons name="lock-open-outline" size={22} color="#fff" />
    </Pressable>
  );

  // Only surface the "Unlock your full roadmap" paywall CTA to users who don't
  // already have access. An entitled user (e.g. an active subscriber) tapping it
  // would otherwise land on the paywall's "Manage Subscription" dead-end instead
  // of their already-unlocked roadmap. They can reach all content via the primary
  // "Continue to ExpatHub" CTA below. While entitlement is still loading we hold
  // the CTA back so an entitled user never sees it flash in before resolution.
  const showPaywallAfterUrgent =
    shouldShowPaywallAfterUrgent(result.blockers) &&
    !hasProAccess &&
    !entitlementLoading;

  const handleSavePromptClose = () => setSavePromptVisible(false);
  const handleSavePromptContinue = () => setSavePromptVisible(false);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {activeDelta ? (
          <WorksheetDeltaBanner
            delta={activeDelta}
            onDismiss={() => setActiveDelta(null)}
          />
        ) : null}
        <View style={styles.card}>
          <View style={styles.readinessHeaderRow}>
            <Text style={styles.readinessLabel}>Relocation readiness</Text>
            <View style={styles.headerLinksRow}>
              <Pressable onPress={handleEditAnswers} hitSlop={8} testID="result-edit-answers-link">
                <Text style={styles.restartLinkInline} numberOfLines={1}>Edit</Text>
              </Pressable>
              <Text style={styles.headerLinkDot}>·</Text>
              <Pressable onPress={handleRestart} hitSlop={8} testID="result-restart-link">
                <Text style={styles.restartLinkInline} numberOfLines={1}>Restart</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.readinessPctRow}>
            <Text style={styles.readinessPctValue} testID="readiness-pct-value">
              {Math.round(displayFillPct)}%
            </Text>
            <Text style={styles.readinessPctOf}>of fully ready</Text>
          </View>
          <View style={styles.readinessBarTrack} testID="readiness-bar-track">
            <Animated.View
              style={[styles.readinessBarFill, { width: animatedBarWidth, backgroundColor: tokens.color.teal }]}
              testID="readiness-bar-fill"
            />
          </View>
          <View style={[styles.tierBadge, { backgroundColor: tierColor }]} testID="readiness-tier-badge">
            <Text style={styles.tierBadgeText}>{readiness.label}</Text>
          </View>
          <Text style={styles.tierDescription}>{readiness.description}</Text>
          {hasAnyBlockers ? (
            <>
              <View style={styles.countPillRow}>
                {(["critical", "moderate", "explore"] as const).map((lvl) => {
                  const shown = displayCounts[lvl];
                  const prev = activeDelta?.previousCounts[lvl] ?? 0;
                  // Keep the pill visible during a transition from N → 0 so
                  // the counter can animate down rather than vanish.
                  if (counts[lvl] === 0 && prev === 0) return null;
                  const revealed = revealedLevels[lvl];
                  const disabled = counts[lvl] === 0;
                  return (
                    <Pressable
                      key={lvl}
                      onPress={() => scrollToSection(lvl)}
                      disabled={disabled}
                      unstable_pressDelay={0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [
                        styles.countPill,
                        { backgroundColor: LEVEL_COLORS[lvl].bg, borderColor: LEVEL_COLORS[lvl].border },
                        revealed && { borderWidth: 2 },
                        disabled && { opacity: 0.55 },
                        pressed && { opacity: 0.85 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: revealed, disabled }}
                      accessibilityLabel={`${revealed ? "Hide" : "Show"} ${shown} ${LEVEL_COLORS[lvl].label} items`}
                      accessibilityHint="Expands the list below"
                      testID={`count-pill-${lvl}`}
                    >
                      <View style={[styles.countPillDot, { backgroundColor: LEVEL_COLORS[lvl].chip }]} />
                      <Text style={styles.countPillText}>{shown} {LEVEL_COLORS[lvl].label.toLowerCase()}</Text>
                      <Ionicons
                        name={revealed ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={LEVEL_COLORS[lvl].chip}
                      />
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.pillHint}>Tap a label above to see what's affecting that part of your score.</Text>
            </>
          ) : null}
        </View>

        {renderBlockerSection("critical")}
        {renderBlockerSection("moderate")}
        {renderBlockerSection("explore")}

        {result.topMatch ? (
          <Pressable
            onPress={handleExploreTopMatch}
            disabled={!result.topMatch.slug}
            style={({ pressed }) => [styles.card, styles.topMatchCard, pressed && result.topMatch?.slug ? { opacity: 0.92 } : null]}
            accessibilityRole={result.topMatch.slug ? "button" : undefined}
            accessibilityLabel={`Top region to explore: ${result.topMatch.name}`}
            testID="result-top-match-card"
          >
            <Text style={styles.sectionLabel}>Top region to explore</Text>
            <View style={styles.matchRow}>
              <Text style={styles.matchFlag}>{result.topMatch.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchName}>Start with {result.topMatch.name}</Text>
                <Text style={styles.matchDesc}>{result.topMatch.description}</Text>
              </View>
              {result.topMatch.slug ? (
                <Ionicons name="chevron-forward" size={20} color={tokens.color.subtext} />
              ) : null}
            </View>
            <Text style={styles.topMatchFootnote}>
              Based on the region you picked. You can compare other countries any time.
            </Text>
          </Pressable>
        ) : null}

        {/*
          The paywall CTA used to sit BETWEEN the urgent (critical/moderate)
          blockers and the explore section, which interrupted the list the
          user had just earned and read as bait-and-switch. It now sits at
          the END of the blocker list so the upgrade ask is still one tap
          away without breaking up the content. A second sticky CTA at the
          bottom of the screen keeps it visible while scrolling.

          Blocker sections themselves now render directly under the pill
          row (above the Top Region card) so a tap on a pill reveals
          content in the user's eyeline rather than appearing off-screen
          below an intervening card — that off-screen reveal caused a
          perceived "needs two taps" bug because the first tap's
          scroll-to-section ran before the section had mounted and its
          y-offset was 0.
        */}
        {showPaywallAfterUrgent ? renderPaywallCta() : null}

        {result.blockers.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={18} color={tokens.color.teal} />
              <Text style={[styles.successText, { fontFamily: tokens.font.bodySemiBold, fontWeight: "600" }]}>
                No critical gaps identified. Focus on locking in your timeline and target country.
              </Text>
            </View>
          </View>
        ) : null}

        {renderSaveCard()}
      </ScrollView>

      <View style={[styles.stickyCtaBar, { paddingBottom: Math.max(bottomPad, 16) }]}>
        <Pressable
          onPress={handlePrimaryCta}
          style={({ pressed }) => [styles.stickyCta, pressed && { opacity: 0.9 }]}
          testID="result-primary-cta"
        >
          <Text style={styles.stickyCtaText}>{primaryCtaLabel}</Text>
        </Pressable>
      </View>

      <DragBottomSheet
        ref={sheetRef}
        visible={sheetBlocker !== null}
        onClose={closeSheet}
        testID="blocker-sheet"
      >
        <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          {sheetBlocker ? (
            <>
              <View style={styles.sheetHeader}>
                <View style={[styles.levelChip, { backgroundColor: LEVEL_COLORS[sheetBlocker.level].chip }]}>
                  <Text style={styles.levelChipText}>{LEVEL_COLORS[sheetBlocker.level].label}</Text>
                </View>
                <Text style={styles.sheetTitle} numberOfLines={2}>{sheetBlocker.title}</Text>
                <Pressable
                  onPress={requestSheetClose}
                  hitSlop={12}
                  style={styles.sheetClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  testID="sheet-close"
                >
                  <Ionicons name="close" size={22} color={tokens.color.text} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sheetBodyLabel}>What this means</Text>
                <Text style={styles.sheetBodyText}>{sheetBlocker.whatThisMeans}</Text>
                <Text style={[styles.sheetBodyLabel, { marginTop: 16 }]}>Next step</Text>
                <Text style={styles.sheetBodyText}>{sheetBlocker.firstAction}</Text>
              </ScrollView>
              {WORKSHEET_BY_QUESTION_ID[sheetBlocker.questionId] ? (
                <View style={styles.sheetCtaWrap}>
                  <Pressable
                    onPress={openWorksheetFromSheet}
                    style={({ pressed }) => [styles.sheetCta, pressed && { opacity: 0.9 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open worksheet to update this score"
                    testID="sheet-open-worksheet"
                  >
                    <Ionicons name="document-text-outline" size={18} color="#fff" />
                    <Text style={styles.sheetCtaText}>
                      Open worksheet · {WORKSHEET_BY_QUESTION_ID[sheetBlocker.questionId].questions.length} questions
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </DragBottomSheet>

      <QuizSaveModal
        visible={savePromptVisible}
        noCount={savePromptNoCount}
        onClose={handleSavePromptClose}
        onContinue={handleSavePromptContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  scrollContent: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: 24,
    gap: 16,
  },
  readinessPctValue: {
    fontSize: 32,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    lineHeight: 36,
  },
  readinessPctRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  },
  readinessPctOf: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  readinessHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  headerLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  headerLinkDot: {
    fontSize: 13,
    color: tokens.color.subtext,
  },
  restartLinkInline: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textDecorationLine: "underline",
  },
  topMatchFootnote: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 17,
  },
  countPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  countPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  countPillText: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.text,
  },
  blockerLeadIn: {
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.text,
  },
  pillHint: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 6,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  sheetClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  sheetSubtitle: {
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 12,
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  sheetScroll: {
    paddingHorizontal: tokens.space.xl,
  },
  sheetScrollContent: {
    paddingBottom: 12,
    gap: 10,
  },
  sheetCard: {
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
  },
  sheetCardBody: {
    gap: 8,
  },
  sheetCardTitle: {
    fontSize: 15,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.text,
  },
  sheetCardText: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 19,
  },
  sheetCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(28,43,94,0.08)",
  },
  sheetCardFooterText: {
    flex: 1,
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.teal,
  },
  sheetBodyLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sheetBodyText: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 22,
  },
  sheetCtaWrap: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(28,43,94,0.08)",
  },
  sheetCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: tokens.color.teal,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  sheetCtaText: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  stickyCtaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space.xl,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(28,43,94,0.08)",
  },
  stickyCta: {
    backgroundColor: tokens.color.teal,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  stickyCtaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
  },
  readinessLabel: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 1,
    flexShrink: 1,
  },
  readinessBarTrack: {
    height: 10,
    backgroundColor: "rgba(28,43,94,0.08)",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 14,
  },
  readinessBarFill: {
    height: 10,
    borderRadius: 5,
  },
  tierBadge: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  tierBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  tierDescription: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  blockerSection: {
    gap: 10,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    marginTop: 4,
    marginBottom: 4,
  },
  blockerCard: {
    borderRadius: 14,
    borderLeftWidth: 5,
    padding: 18,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(28,43,94,0.06)",
    borderRightColor: "rgba(28,43,94,0.06)",
    borderBottomColor: "rgba(28,43,94,0.06)",
  },
  blockerHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  levelChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  levelChipText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  blockerTitle: {
    fontSize: 17,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  blockerLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  blockerBody: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  paywallCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#606CB9",
    borderRadius: 14,
    padding: 18,
  },
  paywallCtaTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    marginBottom: 2,
  },
  paywallCtaSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: tokens.font.body,
  },
  topMatchCard: {
    borderWidth: 1,
    borderColor: "#E5DDD0",
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  matchFlag: {
    fontSize: 40,
  },
  matchName: {
    fontSize: 20,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    marginBottom: 4,
  },
  matchDesc: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  amberNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    backgroundColor: "#FFF8E8",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F0DCA0",
  },
  amberText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: "#92670A",
    lineHeight: 20,
    marginBottom: 10,
  },
  noticeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  notifyBtnInline: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  noThanksLink: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: "#92670A",
    textDecorationLine: "underline",
  },
  notifyRow: {
    flexDirection: "row",
    gap: 10,
  },
  notifyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: "#fff",
  },
  notifyBtn: {
    backgroundColor: tokens.color.gold,
    paddingHorizontal: 18,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  notifyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.teal,
    lineHeight: 20,
  },
  emailLabel: {
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.text,
    marginBottom: 4,
  },
  emailSubtext: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginBottom: 14,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: tokens.color.bg,
    marginBottom: 12,
  },
  goldBtn: {
    backgroundColor: tokens.color.gold,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  goldBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  secondaryLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  secondaryLink: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textDecorationLine: "underline",
  },
  linkDot: {
    fontSize: 13,
    color: tokens.color.subtext,
  },
  exploreCta: {
    backgroundColor: tokens.color.teal,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  exploreCtaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  restartLink: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textDecorationLine: "underline",
    paddingVertical: 8,
  },
});
