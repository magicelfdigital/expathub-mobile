import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "@/theme/tokens";

export default function ComingSoonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { label } = useLocalSearchParams<{ label?: string }>();
  const title = label ?? "This guide";

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/(home)"))}
        hitSlop={12}
        style={styles.closeButton}
      >
        <Ionicons name="close" size={24} color={tokens.color.text} />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles-outline" size={32} color={tokens.color.primary} />
        </View>
        <Text style={styles.title}>{title} — coming soon.</Text>
        <Text style={styles.body}>You'll be notified when this is ready.</Text>

        <Pressable
          onPress={() => router.replace("/(tabs)/(home)")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>Back to ExpatHub</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space.xl,
  },
  closeButton: {
    alignSelf: "flex-end",
    padding: 8,
    marginTop: 8,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EEF4FC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    textAlign: "center",
    lineHeight: 30,
  },
  body: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 22,
  },
  cta: {
    marginTop: 24,
    backgroundColor: tokens.color.teal,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
});
