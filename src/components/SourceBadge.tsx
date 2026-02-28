import React from "react";
import { Text, View } from "react-native";

import { tokens } from "@/theme/tokens";
import type { SourceType } from "@/src/data";

const LABEL: Record<SourceType, string> = {
  official: "OFFICIAL",
  authoritative: "AUTHORITATIVE",
  community: "COMMUNITY",
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  const safe: SourceType = LABEL[sourceType] ? sourceType : "community";
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        backgroundColor: tokens.color.surface,
        borderColor: tokens.color.border,
      }}
      accessibilityLabel={`Source: ${LABEL[safe]}`}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: tokens.weight.bold,
          color: tokens.color.subtext,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        numberOfLines={1}
      >
        {LABEL[safe]}
      </Text>
    </View>
  );
}
