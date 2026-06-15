import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUIZ_QUESTIONS, TIMELINE_CALLOUTS, type QuizAnswer, type TimelineTone } from "@/src/data/quiz";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
import { setupQuizRemindersOnStart } from "@/src/lib/notifications";
import {
  buildQuizAnsweredPayload,
  decideQuizAdvance,
  shouldDeferAdvanceForTimeline,
  shouldFireAbandonment,
  TIMELINE_QUESTION_ID,
} from "@/src/onboarding/quizFlow";

const TOTAL = QUIZ_QUESTIONS.length;

const CALLOUT_TONE_COLORS: Record<TimelineTone, { bg: string; border: string; fg: string }> = {
  green: { bg: "rgba(46, 160, 105, 0.10)", border: "rgba(46, 160, 105, 0.35)", fg: "#1F7A4D" },
  amber: { bg: "rgba(232, 153, 26, 0.12)", border: "rgba(232, 153, 26, 0.40)", fg: "#A1660C" },
  teal: { bg: "rgba(51, 196, 220, 0.12)", border: "rgba(51, 196, 220, 0.40)", fg: "#0E7A8A" },
  neutral: { bg: "rgba(28, 43, 94, 0.06)", border: "rgba(28, 43, 94, 0.18)", fg: "#5A6785" },
};

export default function QuizScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { width: screenWidth } = useWindowDimensions();
  const { prefill, edit } = useLocalSearchParams<{ prefill?: string; edit?: string }>();
  const isEditMode = edit === "1";

  const prefillAnswers = useMemo<Record<number, string>>(() => {
    if (!prefill) return {};
    try {
      const parsed = JSON.parse(prefill);
      if (!parsed || typeof parsed !== "object") return {};
      const out: Record<number, string> = {};
      for (let i = 1; i <= QUIZ_QUESTIONS.length; i++) {
        const v = (parsed as Record<string, unknown>)[String(i)] ?? (parsed as Record<number, unknown>)[i];
        if (typeof v === "string") out[i] = v;
      }
      return out;
    } catch {
      return {};
    }
  }, [prefill]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(prefillAnswers);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const lastIndexRef = useRef(0);
  const answersRef = useRef<Record<number, string>>({});

  React.useEffect(() => {
    answersRef.current = answers;
    lastIndexRef.current = currentIndex;
  }, [answers, currentIndex]);

  React.useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      trackEvent("quiz_started");
      // Ask for notification permission at quiz start (not on cold open), then
      // schedule the 24h and 72h re-engagement reminders if permission is
      // granted. Skipped for users who already finished the quiz. Both reminders
      // are cancelled when the quiz is completed.
      void setupQuizRemindersOnStart();
    }
    return () => {
      const answeredCount = Object.keys(answersRef.current).length;
      if (
        shouldFireAbandonment({
          answeredCount,
          total: TOTAL,
          completed: completedRef.current,
        })
      ) {
        trackEvent("quiz_abandoned", {
          lastQuestionIndex: lastIndexRef.current,
          answered: answeredCount,
          totalQuestions: TOTAL,
        });
      }
    };
  }, []);

  const question = QUIZ_QUESTIONS[currentIndex];
  const progress = (currentIndex + 1) / TOTAL;

  const animateTransition = useCallback((direction: "forward" | "back", cb: () => void) => {
    if (Platform.OS === "web") {
      cb();
      return;
    }
    const toValue = direction === "forward" ? -screenWidth : screenWidth;
    Animated.timing(slideAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      cb();
      slideAnim.setValue(direction === "forward" ? screenWidth : -screenWidth);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [slideAnim, screenWidth]);

  const advanceFromAnswers = useCallback(
    (newAnswers: Record<number, string>) => {
      // The mid-quiz save prompt was removed. The equivalent email-capture
      // moment now fires on the result screen, after the score reveal —
      // see app/onboarding/result.tsx. We always pass
      // savePromptAlreadyShown=true here so decideQuizAdvance can never
      // return a "save_prompt" decision, even if older callers don't get
      // updated.
      const decision = decideQuizAdvance({
        currentIndex,
        total: TOTAL,
        answers: newAnswers,
        savePromptAlreadyShown: true,
      });
      if (decision.kind === "next") {
        animateTransition("forward", () => setCurrentIndex(currentIndex + 1));
        return;
      }
      // finish (save_prompt is suppressed above so this is the only
      // remaining non-next branch)
      completedRef.current = true;
      trackEvent("quiz_completed", { totalQuestions: TOTAL });
      const target = {
        pathname: "/onboarding/result" as const,
        params: { answers: JSON.stringify(newAnswers) },
      };
      if (isEditMode) router.replace(target);
      else router.push(target);
    },
    [currentIndex, animateTransition, router, isEditMode],
  );

  const handleUpdateResults = useCallback(() => {
    completedRef.current = true;
    const changedCount = Object.keys(answers).filter(
      (k) => answers[Number(k)] !== prefillAnswers[Number(k)],
    ).length;
    trackEvent("quiz_edit_resubmitted", { changedCount });
    router.replace({
      pathname: "/onboarding/result",
      params: { answers: JSON.stringify(answers) },
    });
  }, [router, answers, prefillAnswers]);

  const jumpToQuestion = useCallback(
    (index: number) => {
      if (index === currentIndex) return;
      const direction = index > currentIndex ? "forward" : "back";
      animateTransition(direction, () => setCurrentIndex(index));
    },
    [currentIndex, animateTransition],
  );

  const selectAnswer = useCallback(
    (value: string) => {
      const q = QUIZ_QUESTIONS[currentIndex];
      const questionId = q.id;
      const newAnswers = { ...answers, [questionId]: value };
      setAnswers(newAnswers);

      trackEvent(
        "quiz_question_answered",
        buildQuizAnsweredPayload({
          questionId,
          questionIndex: currentIndex,
          category: q.category,
          answer: value,
        }),
      );

      // In edit mode, don't auto-advance.
      if (isEditMode) return;

      // Timeline question: don't auto-advance — show inline callout + Next button.
      if (shouldDeferAdvanceForTimeline(questionId)) {
        return;
      }

      advanceFromAnswers(newAnswers);
    },
    [currentIndex, answers, advanceFromAnswers, isEditMode],
  );

  const handleNext = useCallback(() => {
    advanceFromAnswers(answers);
  }, [advanceFromAnswers, answers]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      animateTransition("back", () => setCurrentIndex(currentIndex - 1));
    } else {
      router.back();
    }
  }, [currentIndex, animateTransition, router]);

  return (
    <View style={[styles.container, { paddingTop: topPad + 12 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={tokens.color.text} />
        </Pressable>
        <Text style={styles.progressLabel}>Question {currentIndex + 1} of {TOTAL}</Text>
        {isEditMode ? (
          <Pressable
            onPress={handleUpdateResults}
            hitSlop={8}
            testID="quiz-update-results"
            accessibilityRole="button"
            accessibilityLabel="Save changes and update results"
          >
            <Text style={styles.updateResultsLink}>Update</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {isEditMode ? (
        <View style={styles.editBanner} testID="quiz-edit-banner">
          <Ionicons name="create-outline" size={14} color={tokens.color.teal} />
          <Text style={styles.editBannerText}>
            Editing your answers. Change anything and tap Update.
          </Text>
        </View>
      ) : null}

      {isEditMode ? (
        <View style={styles.questionStripWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.questionStrip}
          >
            {QUIZ_QUESTIONS.map((_, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = !!answers[QUIZ_QUESTIONS[idx].id];
              return (
                <Pressable
                  key={idx}
                  onPress={() => jumpToQuestion(idx)}
                  style={[
                    styles.questionDot,
                    isCurrent && styles.questionDotCurrent,
                    !isCurrent && isAnswered && styles.questionDotAnswered,
                  ]}
                >
                  <Text
                    style={[
                      styles.questionDotText,
                      (isCurrent || isAnswered) && styles.questionDotTextActive,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      <Animated.View style={[styles.questionWrap, { transform: [{ translateX: slideAnim }] }]}>
        {/*
          Flex-only layout (no ScrollView) so every question + its
          options fit on screen without scrolling. The tightest case is
          Q9 (5 region options) — option padding, gap and font sizes
          have been tuned so even that fits an iPhone SE viewport.
        */}
        <View style={styles.questionInner}>
          {question.type === "region" && (
            <Text style={styles.categoryLabel}>{question.category}</Text>
          )}
          <Text style={styles.questionText}>{question.text}</Text>

          <View style={styles.optionsWrap}>
            {question.options.map((opt) => {
              const selected = answers[question.id] === opt.value;
              const showCalloutHere =
                question.id === TIMELINE_QUESTION_ID &&
                selected &&
                answers[TIMELINE_QUESTION_ID] === opt.value;
              return (
                <React.Fragment key={opt.value}>
                  <Pressable
                    onPress={() => selectAnswer(opt.value)}
                    style={({ pressed }) => [
                      styles.optionCard,
                      selected && styles.optionCardSelected,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    {opt.emoji ? (
                      <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    ) : null}
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]} numberOfLines={2}>
                      {opt.label}
                    </Text>
                  </Pressable>
                  {showCalloutHere ? (
                    <TimelineCallout value={answers[TIMELINE_QUESTION_ID] as QuizAnswer} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>

          {question.id === TIMELINE_QUESTION_ID ? (
            <Pressable
              onPress={handleNext}
              disabled={!answers[TIMELINE_QUESTION_ID]}
              style={({ pressed }) => [
                styles.nextBtn,
                !answers[TIMELINE_QUESTION_ID] && styles.nextBtnDisabled,
                pressed && answers[TIMELINE_QUESTION_ID] && { opacity: 0.9 },
              ]}
              testID="quiz-timeline-next"
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "rgba(28,43,94,0.1)",
    borderRadius: 2,
    marginBottom: 20,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 4,
    backgroundColor: tokens.color.teal,
    borderRadius: 2,
  },
  questionWrap: {
    flex: 1,
    overflow: "hidden",
  },
  questionInner: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: "center",
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.teal,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  questionText: {
    fontSize: 20,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    lineHeight: 26,
    marginBottom: 18,
  },
  optionsWrap: {
    gap: 8,
  },
  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "rgba(28,43,94,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionCardSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: "rgba(62,129,221,0.06)",
  },
  optionEmoji: {
    fontSize: 20,
  },
  optionLabel: {
    fontSize: 17,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    flex: 1,
  },
  optionLabelSelected: {
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.primary,
  },
  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  calloutIcon: {
    marginTop: 1,
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: tokens.font.body,
  },
  nextBtn: {
    marginTop: 18,
    backgroundColor: tokens.color.primary,
    height: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  updateResultsLink: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.teal,
  },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(51, 196, 220, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(51, 196, 220, 0.30)",
    marginBottom: 12,
  },
  editBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: "#0E7A8A",
    lineHeight: 17,
  },
  questionStripWrapper: {
    marginBottom: 16,
  },
  questionStrip: {
    gap: 8,
    paddingRight: 20,
  },
  questionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(28,43,94,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.1)",
  },
  questionDotCurrent: {
    backgroundColor: tokens.color.teal,
    borderColor: tokens.color.teal,
  },
  questionDotAnswered: {
    backgroundColor: "rgba(51, 196, 220, 0.15)",
    borderColor: "rgba(51, 196, 220, 0.3)",
  },
  questionDotText: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
  },
  questionDotTextActive: {
    color: "#fff",
  },
});

function TimelineCallout({ value }: { value: QuizAnswer }) {
  const callout = TIMELINE_CALLOUTS[value];
  if (!callout) return null;
  const tone = CALLOUT_TONE_COLORS[callout.tone];
  return (
    <View
      style={[styles.callout, { backgroundColor: tone.bg, borderColor: tone.border }]}
      testID={`timeline-callout-${callout.tone}`}
    >
      <Ionicons name={callout.icon} size={14} color={tone.fg} style={styles.calloutIcon} />
      <Text style={[styles.calloutText, { color: tone.fg }]}>{callout.text}</Text>
    </View>
  );
}
