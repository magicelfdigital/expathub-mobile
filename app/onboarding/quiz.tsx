import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUIZ_QUESTIONS, TIMELINE_CALLOUTS, type QuizAnswer, type TimelineTone } from "@/src/data/quiz";
import { QuizSaveModal } from "@/src/components/QuizSaveModal";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [savePromptVisible, setSavePromptVisible] = useState(false);
  const [savePromptNoCount, setSavePromptNoCount] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const savePromptShownRef = useRef(false);
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
      const decision = decideQuizAdvance({
        currentIndex,
        total: TOTAL,
        answers: newAnswers,
        savePromptAlreadyShown: savePromptShownRef.current,
      });
      if (decision.kind === "save_prompt") {
        savePromptShownRef.current = true;
        setSavePromptNoCount(decision.noCount);
        setSavePromptVisible(true);
        trackEvent("quiz_save_shown", {
          questionIndex: currentIndex,
          noCount: decision.noCount,
        });
        return;
      }
      if (decision.kind === "next") {
        animateTransition("forward", () => setCurrentIndex(currentIndex + 1));
        return;
      }
      // finish
      completedRef.current = true;
      trackEvent("quiz_completed", { totalQuestions: TOTAL });
      router.push({
        pathname: "/onboarding/result",
        params: { answers: JSON.stringify(newAnswers) },
      });
    },
    [currentIndex, animateTransition, router],
  );

  const selectAnswer = useCallback((value: string) => {
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

    // Timeline question: don't auto-advance — show inline callout + Next button.
    if (shouldDeferAdvanceForTimeline(questionId)) {
      return;
    }

    advanceFromAnswers(newAnswers);
  }, [currentIndex, answers, advanceFromAnswers]);

  const handleNext = useCallback(() => {
    advanceFromAnswers(answers);
  }, [advanceFromAnswers, answers]);

  const handleSavePromptContinue = useCallback(() => {
    setSavePromptVisible(false);
    animateTransition("forward", () => setCurrentIndex((idx) => idx + 1));
  }, [animateTransition]);

  const handleSavePromptClose = useCallback(() => {
    setSavePromptVisible(false);
    // Advance the quiz so the user is not stranded on the question they just answered.
    animateTransition("forward", () => setCurrentIndex((idx) => idx + 1));
  }, [animateTransition]);

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
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>

      <Animated.View style={[styles.questionWrap, { transform: [{ translateX: slideAnim }] }]}>
        <ScrollView
          style={styles.questionScroll}
          contentContainerStyle={styles.questionScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
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
        </ScrollView>
      </Animated.View>

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
    marginBottom: 32,
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
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: 16,
    paddingBottom: 32,
  },
  categoryLabel: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.teal,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 22,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    lineHeight: 32,
    marginBottom: 32,
  },
  optionsWrap: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
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
