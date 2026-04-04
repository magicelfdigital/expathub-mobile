import { Stack } from "expo-router";
import React from "react";
import { tokens } from "@/theme/tokens";

export default function ShortlistLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.bg },
      }}
    />
  );
}
