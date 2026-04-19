import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";

type Level = "critical" | "moderate" | "explore";

const LEVEL_COLORS: Record<Level, { border: string; bg: string; chip: string; label: string }> = {
  critical: { border: "#D9534F", bg: "#FDF2F1", chip: "#D9534F", label: "Critical" },
  moderate: { border: "#E8991A", bg: "#FFF8E8", chip: "#E8991A", label: "Moderate" },
  explore: { border: "#3E81DD", bg: "#EEF4FC", chip: "#3E81DD", label: "Explore" },
};

function getBaseUrl(): string {
  if (Platform.OS === "web") return getApiUrl().replace(/\/$/, "");
  return getBackendBase();
}

export default function BlockerGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const params = useLocalSearchParams<{
    blockerId?: string;
    questionId?: string;
    level?: string;
    title?: string;
    whatThisMeans?: string;
    firstAction?: string;
    label?: string;
  }>();

  const blockerId = (params.blockerId ?? "unknown").toString();
  const level = ((params.level ?? "explore") as Level);
  const colors = LEVEL_COLORS[level] ?? LEVEL_COLORS.explore;
  const title = params.title?.toString() ?? "Detailed guide coming soon";
  const whatThisMeans = params.whatThisMeans?.toString() ?? "";
  const firstAction = params.firstAction?.toString() ?? "";
  const label = params.label?.toString() ?? "Get notified when this guide is ready";

  const viewedRef = useRef(false);
  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      trackEvent("blocker_guide_viewed", { blockerId, level });
    }
  }, [blockerId, level]);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleNotify = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setSubmitting(true);
    try {
      const base = getBaseUrl();
      await fetch(`${base}/api/readiness-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "blocker_guide",
          blockerId,
          level,
        }),
      }).catch(() => {});
      trackEvent("blocker_guide_notify_signup", { blockerId, level });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    router.replace("/(tabs)/(home)" as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else handleContinue();
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={tokens.color.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }]}>
          <View style={[styles.chip, { backgroundColor: colors.chip }]}>
            <Text style={styles.chipText}>{colors.label}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>

        {whatThisMeans ? (
          <View style={styles.card}>
            <Text style={styles.label}>What this means</Text>
            <Text style={styles.body}>{whatThisMeans}</Text>
          </View>
        ) : null}

        {firstAction ? (
          <View style={styles.card}>
            <Text style={styles.label}>Start here</Text>
            <Text style={styles.body}>{firstAction}</Text>
          </View>
        ) : null}

        <View style={styles.notifyCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="construct-outline" size={22} color={tokens.color.primary} />
          </View>
          <Text style={styles.notifyHeading}>Step-by-step guide in the works</Text>
          <Text style={styles.notifySub}>
            We're building a deeper walkthrough for this blocker — checklists, examples, and the exact steps for your destination. Drop your email and we'll let you know when it's live.
          </Text>

          {submitted ? (
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={18} color={tokens.color.teal} />
              <Text style={styles.successText}>You're on the list. We'll be in touch.</Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={tokens.color.subtext}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
              />
              <Pressable
                onPress={handleNotify}
                disabled={submitting}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>{label}</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <Pressable onPress={handleContinue} style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.secondaryBtnText}>Explore countries instead</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  topBar: { paddingHorizontal: tokens.space.xl, paddingVertical: 12 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backText: { fontSize: 15, fontFamily: tokens.font.body, color: tokens.color.text },
  scroll: { paddingHorizontal: tokens.space.xl, paddingTop: 8, gap: 16 },
  headerCard: {
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
  chip: { alignSelf: "flex-start", paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, marginBottom: 10 },
  chipText: { color: "#fff", fontSize: 11, fontFamily: tokens.font.bodySemiBold, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { fontSize: 20, fontFamily: tokens.font.display, fontWeight: "600", color: tokens.color.text, lineHeight: 28 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
  },
  label: { fontSize: 12, fontFamily: tokens.font.bodySemiBold, fontWeight: "600", color: tokens.color.subtext, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  body: { fontSize: 15, fontFamily: tokens.font.body, color: tokens.color.text, lineHeight: 22 },
  notifyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
    alignItems: "center",
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(62,129,221,0.1)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  notifyHeading: { fontSize: 17, fontFamily: tokens.font.display, fontWeight: "600", color: tokens.color.text, textAlign: "center", marginBottom: 6 },
  notifySub: { fontSize: 14, fontFamily: tokens.font.body, color: tokens.color.subtext, textAlign: "center", lineHeight: 20, marginBottom: 14 },
  input: {
    width: "100%",
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
  primaryBtn: {
    width: "100%",
    backgroundColor: tokens.color.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: tokens.font.bodySemiBold, fontWeight: "600" },
  successRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  successText: { fontSize: 14, fontFamily: tokens.font.body, color: tokens.color.teal, flex: 1 },
  secondaryBtn: { paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: { fontSize: 15, fontFamily: tokens.font.body, color: tokens.color.subtext, textDecorationLine: "underline" },
});
