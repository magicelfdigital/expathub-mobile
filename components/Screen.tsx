import { useLayout } from "@/src/hooks/useLayout";
import React from "react";
import { Image, StyleSheet, View, ViewStyle } from "react-native";
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
    <View style={styles.bg}>
      <Image
        source={mapImage}
        style={styles.mapImage}
        resizeMode="cover"
      />
      <View style={styles.mapFade} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(15,25,60,1)',
  },
  mapImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    opacity: 0.45,
  },
  mapFade: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    height: 80,
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
