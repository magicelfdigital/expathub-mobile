import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUIZ_QUESTIONS } from "@/src/data/quiz";
import { QuizSaveModal } from "@/src/components/QuizSaveModal";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

const TOTAL = QUIZ_QUESTIONS.length;
const SAVE_PROMPT_TRIGGER_INDEX = 4; // After Q5
const SAVE_PROMPT_NO_THRESHOLD = 3;

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
      if (!completedRef.current && answeredCount > 0 && answeredCount < TOTAL) {
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

  const selectAnswer = useCallback((value: string) => {
    const q = QUIZ_QUESTIONS[currentIndex];
    const questionId = q.id;
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);

    trackEvent("quiz_question_answered", {
      questionId,
      questionIndex: currentIndex,
      category: q.category,
      answer: value,
    });

    if (currentIndex < TOTAL - 1) {
      const noCount = Object.values(newAnswers).filter((v) => v === "no").length;
      const shouldPrompt =
        currentIndex === SAVE_PROMPT_TRIGGER_INDEX &&
        noCount >= SAVE_PROMPT_NO_THRESHOLD &&
        !savePromptShownRef.current;

      if (shouldPrompt) {
        savePromptShownRef.current = true;
        setSavePromptNoCount(noCount);
        setSavePromptVisible(true);
        trackEvent("quiz_save_shown", { questionIndex: currentIndex, noCount });
        return;
      }

      animateTransition("forward", () => setCurrentIndex(currentIndex + 1));
    } else {
      completedRef.current = true;
      trackEvent("quiz_completed", { totalQuestions: TOTAL });
      router.push({
        pathname: "/onboarding/result",
        params: { answers: JSON.stringify(newAnswers) },
      });
    }
  }, [currentIndex, answers, animateTransition, router]);

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
        {question.type === "region" && (
          <Text style={styles.categoryLabel}>{question.category}</Text>
        )}
        <Text style={styles.questionText}>{question.text}</Text>

        <View style={styles.optionsWrap}>
          {question.options.map((opt) => {
            const selected = answers[question.id] === opt.value;
            return (
              <Pressable
                key={opt.value}
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
            );
          })}
        </View>
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
    justifyContent: "center",
    paddingBottom: 80,
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
    fontWeight: "600",
    color: tokens.color.text,
    lineHeight: 30,
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
});
