import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useBookmarks } from "@/contexts/BookmarkContext";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectMonthly: () => void;
  onSelectAnnual: () => void;
};

export function ExpiryModal({
  visible,
  onClose,
  onSelectMonthly,
  onSelectAnnual,
}: Props) {
  const { bookmarkCount, notesCount } = useBookmarks();
  // Total exploration signals during the 48h preview. We count both
  // saved countries and move notes so the prompt always reflects some
  // activity, even for users who only used one or the other.
  const explorationCount = bookmarkCount + notesCount;
  const exploredLabel =
    explorationCount === 1 ? "1 exploration" : `${explorationCount} explorations`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="hourglass" size={26} color={tokens.color.gold} />
            </View>
            <Text style={styles.title}>Your free preview has ended</Text>
          </View>

          <Text style={styles.body}>
            You made <Text style={styles.bodyStrong}>{exploredLabel}</Text> during
            your 48-hour preview. Choose a plan to keep your full ExpatHub Pro
            access without losing what you've saved.
          </Text>

          <View style={styles.statsList}>
            <View style={styles.statRow}>
              <Ionicons name="bookmark" size={16} color={tokens.color.gold} />
              <Text style={styles.statLabel}>Saved countries</Text>
              <Text style={styles.statValue}>{bookmarkCount}</Text>
            </View>
            <View style={styles.statRow}>
              <Ionicons
                name="document-text"
                size={16}
                color={tokens.color.teal}
              />
              <Text style={styles.statLabel}>Move notes</Text>
              <Text style={styles.statValue}>{notesCount}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              testID="expiry-modal-monthly"
              onPress={() => {
                trackEvent("paywall_unlock_tapped", {
                  source: "expiry_modal",
                  plan: "monthly",
                });
                onSelectMonthly();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Continue Monthly</Text>
            </Pressable>
            <Pressable
              testID="expiry-modal-annual"
              onPress={() => {
                trackEvent("paywall_unlock_tapped", {
                  source: "expiry_modal",
                  plan: "annual",
                });
                onSelectAnnual();
              }}
              style={({ pressed }) => [
                styles.secondaryCta,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.secondaryCtaText}>Continue Annual</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.tertiaryBtn}>
              <Text style={styles.tertiaryBtnText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 28,
    width: "100%",
    maxWidth: 400,
    gap: 18,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.goldLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  body: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  bodyStrong: {
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    fontWeight: "700",
  },
  statsList: { gap: 10 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  actions: { gap: 8, marginTop: 4 },
  primaryBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
  secondaryCta: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  secondaryCtaText: {
    color: tokens.color.primary,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
  tertiaryBtn: { paddingVertical: 10, alignItems: "center" },
  tertiaryBtnText: {
    color: tokens.color.subtext,
    fontSize: 13,
    fontFamily: tokens.font.body,
  },
});
