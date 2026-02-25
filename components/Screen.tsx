import { tokens } from "@/theme/tokens";
import React from "react";
import { StyleSheet, View, ViewStyle, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const LARGE_SCREEN = 768;
const MAX_CONTENT_WIDTH = 900;

export function Screen({
  children,
  style,
  maxWidth,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  maxWidth?: number;
}) {
  const { width } = useWindowDimensions();
  const isLarge = width >= LARGE_SCREEN;

  return (
    <SafeAreaView
      style={[styles.safe, isLarge && styles.safeCentered]}
      edges={["left", "right"]}
    >
      <View
        style={[
          styles.content,
          isLarge && { maxWidth: maxWidth ?? MAX_CONTENT_WIDTH, width: "100%" },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  safeCentered: {
    alignItems: "center",
  },
  content: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
});
