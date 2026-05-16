import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/theme/tokens";
import {
  summarizeDelta,
  type DeltaTone,
  type WorksheetDelta,
} from "@/src/onboarding/worksheetDelta";

const TONE_STYLES: Record<DeltaTone, { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }> = {
  up: {
    bg: tokens.color.tealLight,
    border: tokens.color.teal,
    icon: "arrow-up-circle",
    iconColor: tokens.color.teal,
  },
  down: {
    bg: "#FFF8E8",
    border: "#E8991A",
    icon: "information-circle",
    iconColor: "#E8991A",
  },
  neutral: {
    bg: tokens.color.surface,
    border: tokens.color.border,
    icon: "checkmark-circle",
    iconColor: tokens.color.subtext,
  },
};

interface Props {
  delta: WorksheetDelta;
  onDismiss: () => void;
}

export function WorksheetDeltaBanner({ delta, onDismiss }: Props) {
  const summary = summarizeDelta(delta);
  const tone = TONE_STYLES[summary.tone];

  return (
    <View
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityRole="alert"
      accessibilityLabel={`${summary.title}. ${summary.body ?? ""}`}
      testID="worksheet-delta-banner"
    >
      <Ionicons name={tone.icon} size={22} color={tone.iconColor} style={styles.icon} />
      <View style={styles.content}>
        <Text style={styles.title} testID="worksheet-delta-title">
          {summary.title}
        </Text>
        {summary.body ? (
          <Text style={styles.body} testID="worksheet-delta-body">
            {summary.body}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss readiness update"
        testID="worksheet-delta-dismiss"
      >
        <Ionicons name="close" size={18} color={tokens.color.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  icon: { marginTop: 2 },
  content: { flex: 1, gap: 2 },
  title: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: tokens.weight.semibold,
    color: tokens.color.text,
  },
  body: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  close: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
