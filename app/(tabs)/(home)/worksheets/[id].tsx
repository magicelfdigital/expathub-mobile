import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { fetch as expoFetch } from "expo/fetch";

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";
import {
  useSubmitWorksheet,
  useWorksheetResponse,
  useWorksheetResponses,
} from "@/src/hooks/useWorksheets";
import {
  WORKSHEET_BY_ID,
  type WorksheetAnswers,
} from "@/src/data/worksheets";
import { tokens } from "@/theme/tokens";

// Resolve the backend base URL the same way useWorksheets does — prefer the
// explicit billing backend on native, fall back to the shared API URL on web
// or when EXPO_PUBLIC_BACKEND_URL is unset (Expo Go dev).
function resolveBackendBase(): string {
  if (Platform.OS === "web") return getApiUrl().replace(/\/$/, "");
  try {
    return getBackendBase();
  } catch {
    return getApiUrl().replace(/\/$/, "");
  }
}

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 34 : 0;

export default function WorksheetDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useAuth();
  const { hasFullAccess } = useSubscription();
  // Worksheet definitions are statically bundled, so we render them from
  // local data rather than a gated backend fetch. Gating now happens at
  // OPEN (see the effect below): a non-entitled user who has already
  // completed one worksheet is redirected to /subscribe before they can
  // fill anything in. The POST endpoint still enforces entitlement
  // server-side as a backstop and surfaces 402 as a user-visible error.
  const worksheet = id ? WORKSHEET_BY_ID[id] ?? null : null;
  const existing = useWorksheetResponse(id);
  const { data: allResponses } = useWorksheetResponses();
  const submit = useSubmitWorksheet();

  const [answers, setAnswers] = useState<WorksheetAnswers>({});
  // Once the user has touched the form, never overwrite their local answers
  // from server cache changes. Previously the hydrate effect would re-run on
  // any change to existing?.worksheetId — including the cache invalidation
  // triggered by a successful save — which could clobber the freshly-typed
  // state if the screen re-rendered before navigation completed.
  const userEditedRef = useRef(false);
  const updateAnswer = (qid: string, val: number | string) => {
    userEditedRef.current = true;
    setAnswers((a) => ({ ...a, [qid]: val }));
  };

  // Hydrate from existing response when present, but only if the user
  // hasn't started filling in their own answers yet.
  useEffect(() => {
    if (userEditedRef.current) return;
    if (existing?.answers) setAnswers(existing.answers);
  }, [existing?.worksheetId, existing?.answers]);

  // Anonymous deep-link guard. The list screen sends logged-out users
  // to /auth on row tap, but someone may land here directly via a
  // shared link — bounce them to register with a redirectTo back here.
  useEffect(() => {
    if (!worksheet) return;
    if (user) return;
    router.replace({
      pathname: "/auth" as any,
      params: {
        mode: "register",
        redirectTo: `/(tabs)/(home)/worksheets/${worksheet.id}`,
        entryPoint: "worksheet_detail_anon",
      },
    });
  }, [worksheet, user, router]);

  // Paywall at OPEN, not at submit. Free users get one worksheet
  // end-to-end; any subsequent attempt redirects to /subscribe BEFORE
  // they fill anything in. Users editing a previously completed
  // worksheet are always allowed through.
  useEffect(() => {
    if (!worksheet) return;
    if (hasFullAccess) return;
    if (existing) return; // already completed — they can edit it
    const completedCount = (allResponses ?? []).length;
    if (completedCount >= 1) {
      // Surface tag lets analytics split detail-open redirects from
      // list-tap redirects, since they happen at different points in the
      // funnel. unlockLabel mirrors the list-row gating copy.
      router.replace({
        pathname: "/subscribe" as any,
        params: {
          redirectTo: `/(tabs)/(home)/worksheets/${worksheet.id}`,
          entryPoint: "worksheet_detail",
          unlockLabel: "the remaining 7 worksheets",
        },
      });
    }
  }, [worksheet, hasFullAccess, existing, allResponses, router]);

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
      router.push({
        pathname: "/auth" as any,
        params: { mode: "register", redirectTo: `/(tabs)/(home)/worksheets/${worksheet.id}` },
      });
      return;
    }
    try {
      await submit.mutateAsync({
        worksheetId: worksheet.id,
        answers,
      });
      // Some entry paths (deep link, post-signup redirect, paywall replace)
      // leave no router history, so router.back() silently no-ops and the
      // user sees the freshly-saved response render in place — looking like
      // the screen "refreshed". Fall back to the worksheets list whenever
      // there's nothing to go back to.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/(home)/worksheets" as any);
      }
    } catch (err: any) {
      // Self-heal: when the server returns 402 but the client knows the
      // user IS entitled, the most likely cause is a RevenueCat → auth
      // backend sync gap. Force-refresh the upstream entitlement, then
      // retry the save once. Never bounce the user to the paywall while
      // hasFullAccess is true — that creates a navigation loop where
      // /subscribe sees the client entitlement and immediately
      // router.replace()s back here, stacking duplicate detail screens.
      if (err?.code === "subscription_required" && hasFullAccess) {
        // Fail fast if we somehow lost the auth token — calling refresh
        // without a Bearer header would return 401 upstream and we'd loop.
        if (!token) {
          Alert.alert(
            "Could not save",
            "Your subscription could not be verified. Please try again in a moment or contact support@expathub.website",
          );
          return;
        }
        try {
          const base = resolveBackendBase();
          const refreshRes = await expoFetch(`${base}/api/billing/mobile/refresh`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              userId: user?.id,
              source: "revenuecat",
            }),
          });
          if (refreshRes.ok) {
            try {
              await submit.mutateAsync({
                worksheetId: worksheet.id,
                answers,
              });
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/(home)/worksheets" as any);
              }
              return;
            } catch (retryErr: any) {
              if (retryErr?.code === "subscription_required") {
                Alert.alert(
                  "Could not save",
                  "Your subscription could not be verified. Please try again in a moment or contact support@expathub.website",
                );
                return;
              }
              const retryDetail =
                retryErr?.message ||
                (retryErr?.status ? `Server returned ${retryErr.status}.` : "Please try again.");
              Alert.alert("Could not save", retryDetail);
              return;
            }
          }
          // Refresh itself failed (non-2xx). Don't navigate — surface
          // the issue and let the user retry.
          Alert.alert(
            "Could not save",
            "Your subscription could not be verified. Please try again in a moment or contact support@expathub.website",
          );
          return;
        } catch {
          Alert.alert(
            "Could not save",
            "Your subscription could not be verified. Please try again in a moment or contact support@expathub.website",
          );
          return;
        }
      }
      if (err?.code === "subscription_required") {
        // Legitimately unpaid user — show the paywall.
        router.push({
          pathname: "/subscribe" as any,
          params: {
            redirectTo: `/(tabs)/(home)/worksheets/${worksheet.id}`,
            entryPoint: "worksheet_submit_402",
            unlockLabel: "the remaining 7 worksheets",
          },
        });
        return;
      }
      // Surface a concrete message even when the underlying error has no
      // .message (some native fetch failures throw bare TypeErrors). The
      // status code and body excerpt from useSubmitWorksheet make it much
      // easier to triage a "form did nothing" report.
      const detail =
        err?.message ||
        (err?.status ? `Server returned ${err.status}.` : "Please try again.");
      Alert.alert("Could not save", detail);
    }
  };

  // Worksheet definitions are bundled with the app, so the only reason
  // we'd land here is an unknown id from a stale deep link.
  if (!worksheet) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + WEB_TOP_INSET }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: tokens.color.subtext }}>
          Worksheet not available.
        </Text>
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
                        onPress={() => updateAnswer(q.id, n)}
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
                        onPress={() => updateAnswer(q.id, opt.value)}
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
