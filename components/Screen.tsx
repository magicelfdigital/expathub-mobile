import { useLayout } from "@/src/hooks/useLayout";
import React from "react";
import { ImageBackground, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_CONTENT_WIDTH = 900;
const MAX_CONTENT_WIDTH_TABLET = 960;

const mapImage = require("../assets/images/expathub-map.png");

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
    <ImageBackground
      source={mapImage}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,25,60,0.50)',
  },
  safe: {
    flex: 1,
  },
  safeCentered: {
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
});
