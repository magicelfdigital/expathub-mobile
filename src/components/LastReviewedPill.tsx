import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/theme/tokens";

type Props = {
  lastReviewedAt: string;
  confidenceLevel: "high" | "medium" | "low";
};

const CONFIDENCE_CONFIG = {
  high: {
    label: "High confidence",
    color: tokens.color.primary,
    icon: "shield-checkmark" as const,
    explanation: "This brief was recently reviewed against official sources. The information reflects current rules and requirements with no known discrepancies.",
  },
  medium: {
    label: "Medium confidence",
    color: "#D4880F",
    icon: "alert-circle" as const,
    explanation: "Some details in this brief may be outdated or partially verified. We recommend double-checking key requirements with official sources before making decisions.",
  },
  low: {
    label: "Low confidence",
    color: "#C83C3C",
    icon: "warning" as const,
    explanation: "This brief needs a thorough review. Significant changes may have occurred since the last update. Please verify all information with official government sources.",
  },
};

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function LastReviewedPill({ lastReviewedAt, confidenceLevel }: Props) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const config = CONFIDENCE_CONFIG[confidenceLevel];
  const dateLabel = formatReviewDate(lastReviewedAt);

  return (
    <>
      <Pressable
        onPress={() => setTooltipVisible(true)}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${config.label}. Reviewed ${dateLabel}. Tap for details.`}
      >
        <Ionicons name={config.icon} size={13} color={config.color} />
        <Text style={[styles.text, { color: config.color }]}>
          Reviewed {dateLabel}
        </Text>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <Text style={[styles.text, { color: config.color }]}>
          {config.label}
        </Text>
        <Ionicons name="information-circle-outline" size={12} color={config.color} style={{ opacity: 0.7 }} />
      </Pressable>

      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setTooltipVisible(false)}>
          <View style={styles.tooltip}>
            <View style={styles.tooltipHeader}>
              <Ionicons name={config.icon} size={20} color={config.color} />
              <Text style={[styles.tooltipTitle, { color: config.color }]}>{config.label}</Text>
            </View>
            <Text style={styles.tooltipBody}>{config.explanation}</Text>
            <Text style={styles.tooltipDate}>Last reviewed: {dateLabel}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.pill,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignSelf: "flex-start",
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    fontSize: 11,
    fontWeight: tokens.weight.bold,
    letterSpacing: 0.2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  tooltip: {
    backgroundColor: "#fff",
    borderRadius: tokens.radius.lg,
    padding: 20,
    maxWidth: 340,
    width: "100%",
    gap: 12,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tooltipTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
  },
  tooltipBody: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  tooltipDate: {
    fontSize: 11,
    color: tokens.color.subtext,
    opacity: 0.7,
  },
});
