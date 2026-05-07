import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/theme/tokens";

type Props = {
  lastReviewedAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function FreshnessBanner({ lastReviewedAt }: Props) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <Ionicons name="information-circle-outline" size={14} color={tokens.color.subtext} />
      <Text style={styles.text}>
        Information current as of {formatDate(lastReviewedAt)} — verify with official sources before acting.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  text: {
    flex: 1,
    fontSize: 11,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 15,
  },
});
