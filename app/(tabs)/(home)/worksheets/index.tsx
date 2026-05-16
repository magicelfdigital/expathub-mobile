import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  useWorksheetList,
  useWorksheetResponses,
} from "@/src/hooks/useWorksheets";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 34 : 0;

export default function WorksheetsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasFullAccess } = useSubscription();
  const { data: worksheets, isLoading } = useWorksheetList();
  const { data: responses } = useWorksheetResponses();

  const responseByQid = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of responses ?? []) m.set(r.questionId, r.dimensionScore);
    return m;
  }, [responses]);

  const completedCount = responseByQid.size;
  const total = worksheets?.length ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + WEB_TOP_INSET }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
          testID="worksheets-back"
        >
          <Ionicons name="chevron-back" size={22} color={tokens.color.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Readiness worksheets</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + WEB_BOTTOM_INSET + tokens.space.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Each worksheet replaces the score for one quiz dimension with a
          deeper self-check. Complete a few to sharpen your readiness picture.
        </Text>

        {total > 0 ? (
          <Text style={styles.progress}>
            {completedCount} of {total} complete
          </Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={tokens.color.primary} style={styles.loading} />
        ) : null}

        {/*
          Free users get one worksheet end-to-end. Anything beyond their
          first completed worksheet is locked, and the row shows a "Pro"
          badge so the upgrade ask is visible BEFORE the user invests time
          filling it in. The gate has also moved off the submit endpoint
          (see worksheets/[id].tsx and the open-time redirect there).
        */}
        <View style={styles.list}>
          {(worksheets ?? []).map((w) => {
            const score = responseByQid.get(w.questionId);
            const completed = typeof score === "number";
            const locked = !hasFullAccess && !completed && completedCount >= 1;
            return (
              <Pressable
                key={w.id}
                onPress={() => {
                  if (locked) {
                    // Tag the paywall surface so dashboards can attribute
                    // views/dismissals/conversions to the worksheet-list
                    // placement specifically. unlockLabel personalizes the
                    // paywall headline with what's actually behind the gate.
                    router.push({
                      pathname: "/subscribe" as any,
                      params: {
                        redirectTo: `/(tabs)/(home)/worksheets/${w.id}`,
                        entryPoint: "worksheet_list",
                        unlockLabel: "unlock remaining 7 worksheets",
                      },
                    });
                    return;
                  }
                  router.push({
                    pathname: "/(tabs)/(home)/worksheets/[id]" as any,
                    params: { id: w.id },
                  });
                }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                testID={`worksheet-row-${w.id}`}
              >
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={completed ? "checkmark-circle" : locked ? "lock-closed" : "ellipse-outline"}
                    size={18}
                    color={completed ? tokens.color.teal : locked ? tokens.color.gold : tokens.color.subtext}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{w.title}</Text>
                  <Text style={styles.rowSub}>{w.dimension}</Text>
                </View>
                {completed ? (
                  <Text style={styles.scorePill}>{score!.toFixed(1)} / 3</Text>
                ) : locked ? (
                  <Text style={styles.proPill} testID={`worksheet-pro-${w.id}`}>Pro</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={tokens.color.subtext} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
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
  intro: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
    marginBottom: tokens.space.md,
  },
  progress: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodyMedium,
    color: tokens.color.text,
    marginBottom: tokens.space.sm,
  },
  loading: { marginTop: tokens.space.lg },
  list: { gap: tokens.space.sm, marginTop: tokens.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
  },
  rowPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.text,
  },
  rowSub: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 2,
  },
  scorePill: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.teal,
    backgroundColor: tokens.color.tealLight,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
  },
  proPill: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.gold,
    backgroundColor: "rgba(232,153,26,0.15)",
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
