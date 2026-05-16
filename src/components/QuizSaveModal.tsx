import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiUrl } from "@/lib/query-client";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

type Props = {
  visible: boolean;
  noCount: number;
  onClose: () => void;
  onContinue: () => void;
};

export function QuizSaveModal({ visible, noCount, onClose, onContinue }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The old mid-quiz placement fired `quiz_save_shown` from the quiz screen
  // when it decided to surface the modal. Now that the modal mounts on the
  // result screen we own the impression event here, so dashboards keep
  // getting a `shown` row for every appearance.
  const shownOnceRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      shownOnceRef.current = false;
      return;
    }
    if (shownOnceRef.current) return;
    shownOnceRef.current = true;
    trackEvent("quiz_save_shown", { noCount, placement: "result_screen" });
  }, [visible, noCount]);

  const handleSubmit = async () => {
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = new URL("/api/readiness-lead", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          tier: "quiz_save_blockers",
          score: noCount,
          risks: ["soft_save_after_q5"],
          answers: { source: "quiz_save_blockers", noCount: String(noCount) },
        }),
      });
      if (!res.ok) throw new Error("Could not save right now.");
      // `placement` distinguishes the new post-result modal from the
      // legacy mid-quiz one in admin dashboards. The modal currently only
      // mounts on the result screen, but we tag the event explicitly so
      // analytics consumers don't have to infer it.
      trackEvent("quiz_save_submitted", { noCount, placement: "result_screen" });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    trackEvent("quiz_save_dismissed", { noCount, submitted, placement: "result_screen" });
    setEmail("");
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const handleContinue = () => {
    setEmail("");
    setSubmitted(false);
    setError(null);
    onContinue();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Pressable onPress={handleClose} hitSlop={12} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={tokens.color.subtext} />
          </Pressable>

          {submitted ? (
            <>
              <View style={[s.iconWrap, { backgroundColor: "rgba(51,196,220,0.15)" }]}>
                <Ionicons name="checkmark-circle" size={32} color={tokens.color.teal} />
              </View>
              <Text style={s.title}>Check your inbox</Text>
              <Text style={s.body}>
                We'll send your blocker breakdown and starter guide shortly. Your results are ready below.
              </Text>
              {/*
                The legacy copy here was "Finish the quiz", which made
                sense when the modal mounted mid-quiz. Now that the modal
                only appears on the result screen (post-reveal), the
                accurate action is to dismiss back to the results.
              */}
              <Pressable onPress={handleContinue} style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>Back to my results</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={[s.iconWrap, { backgroundColor: "rgba(232,153,26,0.15)" }]}>
                <Ionicons name="bookmark" size={28} color={tokens.color.gold} />
              </View>
              <Text style={s.title}>Save your results</Text>
              <Text style={s.body}>
                You flagged {noCount} blockers in your readiness check. Drop your email and we'll send your full
                breakdown plus the worksheets that lift each score — no account required.
              </Text>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={tokens.color.subtext}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={s.input}
                editable={!busy}
              />
              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <Pressable
                onPress={handleSubmit}
                disabled={busy}
                style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.primaryBtnText}>Email me my starter guide</Text>
                )}
              </Pressable>

              <Pressable onPress={handleContinue} style={s.secondaryBtn}>
                <Text style={s.secondaryBtnText}>No thanks, keep going</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: tokens.color.bg,
    borderRadius: 18,
    padding: 24,
    paddingTop: 32,
    width: "100%",
    maxWidth: 400,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 8 },
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.15)" },
    }),
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 6,
    zIndex: 1,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    textAlign: "center" as const,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 21,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "rgba(28,43,94,0.15)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
    fontFamily: tokens.font.body,
    marginBottom: 8,
    textAlign: "center" as const,
  },
  primaryBtn: {
    backgroundColor: tokens.color.primary,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  secondaryBtn: {
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    color: tokens.color.subtext,
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
});
