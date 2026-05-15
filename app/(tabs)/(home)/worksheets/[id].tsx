import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  useSubmitWorksheet,
  useWorksheetDetail,
  useWorksheetResponse,
} from "@/src/hooks/useWorksheets";
import type { WorksheetAnswers } from "@/src/data/worksheets";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 34 : 0;

export default function WorksheetDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { hasFullAccess } = useSubscription();
  const { data: worksheet, isLoading: detailLoading } = useWorksheetDetail(id);
  const existing = useWorksheetResponse(id);
  const submit = useSubmitWorksheet();

  const [answers, setAnswers] = useState<WorksheetAnswers>({});

  // Hydrate from existing response when present.
  useEffect(() => {
    if (existing?.answers) setAnswers(existing.answers);
  }, [existing?.worksheetId]);

  // Gate routing — runs before the detail query because the query is
  // disabled when the user is not signed in or non-entitled. This prevents
  // a perpetual spinner for free / logged-out users. The /subscribe screen
  // routes back here once entitlement becomes active.
  useEffect(() => {
    if (!id) return;
    if (!user) {
      router.replace({
        pathname: "/auth" as any,
        params: { mode: "register" },
      });
      return;
    }
    if (!hasFullAccess) {
      router.replace({
        pathname: "/subscribe" as any,
        params: { redirectTo: `/(tabs)/(home)/worksheets/${id}` },
      });
    }
  }, [id, user, hasFullAccess, router]);

  const allAnswered = useMemo(() => {
    if (!worksheet) return false;
    return worksheet.questions.every((q) => {
      const v = answers[q.id];
      if (v === undefined || v === null || v === "") return false;
      return true;
    });
  }, [worksheet, answers]);

  const onSubmit = async () => {
    if (!worksheet || !allAnswered) return;
    if (!user) {
      Alert.alert("Sign in", "Create a free account to save your answers.");
      return;
    }
    try {
      await submit.mutateAsync({ worksheetId: worksheet.id, answers });
      router.back();
    } catch (err: any) {
      Alert.alert("Could not save", err?.message ?? "Please try again.");
    }
  };

  // While we redirect non-entitled / unauth users, or while the detail is
  // genuinely loading for an entitled user, show a spinner. If the query
  // settled with no worksheet (e.g. 404), the redirect effect above will
  // already be in flight; the spinner is a safe interim state.
  if (!worksheet) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + WEB_TOP_INSET }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {detailLoading || !user || !hasFullAccess ? (
          <ActivityIndicator color={tokens.color.primary} />
        ) : (
          <Text style={{ color: tokens.color.subtext }}>
            Worksheet not available.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + WEB_TOP_INSET }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
          testID="worksheet-back"
        >
          <Ionicons name="chevron-back" size={22} color={tokens.color.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {worksheet.dimension}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{worksheet.title}</Text>
        <Text style={styles.desc}>{worksheet.description}</Text>

        <View style={styles.questions}>
          {worksheet.questions.map((q, idx) => (
            <View key={q.id} style={styles.qBlock}>
              <Text style={styles.qNum}>Question {idx + 1}</Text>
              <Text style={styles.qText}>{q.text}</Text>
              {q.helper ? <Text style={styles.qHelper}>{q.helper}</Text> : null}

              {q.type === "scale" ? (
                <View style={styles.scaleRow}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const selected = Number(answers[q.id]) === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                        style={[styles.scaleBtn, selected && styles.scaleBtnOn]}
                        testID={`scale-${q.id}-${n}`}
                      >
                        <Text style={[styles.scaleNum, selected && styles.scaleNumOn]}>
                          {n}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.choices}>
                  {q.options?.map((opt) => {
                    const selected = answers[q.id] === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setAnswers((a) => ({ ...a, [q.id]: opt.value }))}
                        style={[styles.choice, selected && styles.choiceOn]}
                        testID={`choice-${q.id}-${opt.value}`}
                      >
                        <Ionicons
                          name={selected ? "radio-button-on" : "radio-button-off"}
                          size={18}
                          color={selected ? tokens.color.primary : tokens.color.subtext}
                        />
                        <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + WEB_BOTTOM_INSET + tokens.space.md },
        ]}
      >
        <Pressable
          onPress={onSubmit}
          disabled={!allAnswered || submit.isPending}
          style={({ pressed }) => [
            styles.submitBtn,
            (!allAnswered || submit.isPending) && styles.submitBtnDisabled,
            pressed && styles.submitBtnPressed,
          ]}
          testID="worksheet-submit"
        >
          {submit.isPending ? (
            <ActivityIndicator color={tokens.color.white} />
          ) : (
            <Text style={styles.submitText}>
              {existing ? "Update worksheet" : "Save worksheet"}
            </Text>
          )}
        </Pressable>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: tokens.text.h3,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.text,
  },
  scroll: { paddingHorizontal: tokens.space.xl, paddingTop: tokens.space.sm },
  title: {
    fontSize: tokens.text.h2,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  desc: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    marginTop: tokens.space.xs,
  },
  questions: { gap: tokens.space.lg, marginTop: tokens.space.xl },
  qBlock: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    gap: tokens.space.sm,
  },
  qNum: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyMedium,
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  qText: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.text,
    lineHeight: 20,
  },
  qHelper: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.textSoft,
  },
  scaleRow: {
    flexDirection: "row",
    gap: tokens.space.sm,
    marginTop: tokens.space.xs,
  },
  scaleBtn: {
    flex: 1,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.bg,
  },
  scaleBtnOn: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  scaleNum: {
    fontSize: tokens.text.h3,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.text,
  },
  scaleNumOn: { color: tokens.color.white },
  choices: { gap: tokens.space.xs, marginTop: tokens.space.xs },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  },
  choiceOn: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primarySoft,
  },
  choiceLabel: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
  },
  choiceLabelOn: { fontFamily: tokens.font.bodyMedium },
  footer: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.sm,
    backgroundColor: tokens.color.bg,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  submitBtn: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnPressed: { opacity: 0.9 },
  submitText: {
    color: tokens.color.white,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
  },
});
