import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";

type Props = {
  visible: boolean;
  message: string;
  variant?: "success" | "info";
  onHide?: () => void;
  durationMs?: number;
};

export function Toast({ visible, message, variant = "info", onHide, durationMs = 3000 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        () => {
          onHide?.();
        },
      );
    }, durationMs);
    return () => clearTimeout(t);
  }, [visible, durationMs, onHide, opacity]);

  if (!visible) return null;

  const iconName = variant === "success" ? "checkmark-circle" : "information-circle";
  const iconColor = variant === "success" ? tokens.color.primary : tokens.color.gold;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]} testID="toast">
      <View style={styles.inner}>
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 1000,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  text: {
    color: tokens.color.text,
    fontFamily: tokens.font.body,
    fontSize: 14,
    flexShrink: 1,
  },
});
