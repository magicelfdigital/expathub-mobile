import React from "react";
import { Text, View } from "react-native";

import { tokens } from "@/theme/tokens";
import type { SourceType } from "@/src/data";

const LABEL: Record<SourceType, string> = {
  official: "OFFICIAL",
  authoritative: "AUTHORITATIVE",
  community: "COMMUNITY",
};

const BG: Record<SourceType, string> = {
  official: tokens.color.primarySoft,
  authoritative: tokens.color.primarySoft,
  community: tokens.color.surface,
};

const BORDER: Record<SourceType, string> = {
  official: tokens.color.primaryBorder,
  authoritative: tokens.color.primaryBorder,
  community: tokens.color.border,
};

const FG: Record<SourceType, string> = {
  official: tokens.color.primary,
  authoritative: tokens.color.primary,
  community: tokens.color.subtext,
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  const safe: SourceType = LABEL[sourceType] ? sourceType : "community";
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        backgroundColor: BG[safe],
        borderColor: BORDER[safe],
      }}
      accessibilityLabel={`Source: ${LABEL[safe]}`}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: tokens.weight.bold,
          color: FG[safe],
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
