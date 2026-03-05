import { useLayout } from "@/src/hooks/useLayout";
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_CONTENT_WIDTH = 900;
const MAX_CONTENT_WIDTH_TABLET = 960;

export function Screen({
  children,
  style,
  maxWidth,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  maxWidth?: number;
}) {
  const { isTablet } = useLayout();

  return (
    <SafeAreaView
      style={[styles.safe, isTablet && styles.safeCentered]}
      edges={["left", "right"]}
    >
      <View
        style={[
          styles.content,
          isTablet && { maxWidth: maxWidth ?? MAX_CONTENT_WIDTH_TABLET, width: "100%" },
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
    backgroundColor: 'transparent',
  },
  safeCentered: {
    alignItems: "center",
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
