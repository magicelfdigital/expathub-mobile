import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad + 40 }]}>
      <View style={styles.logoWrap}>
        <Image
          source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
          resizeMode="contain"
          style={{ height: 64, width: 260 }}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="compass" size={36} color={tokens.color.primary} />
        </View>

        <Text style={styles.headline}>
          Think You've Chosen the Right Country?{"\n"}Run This First.
        </Text>

        <Text style={styles.subtext}>
          Most relocation mistakes aren't about the country. They're about fit.
        </Text>

        <Pressable
          onPress={() => router.push("/onboarding/quiz")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>Run the 2-Minute Fit Check</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        <Text style={styles.small}>9 questions \u00b7 Takes about 2 minutes</Text>
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
  logoWrap: {
    alignItems: "center",
    marginBottom: 48,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 120,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(62,129,221,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  headline: {
    fontSize: 26,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 16,
  },
  subtext: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 40,
    maxWidth: 320,
  },
  cta: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  small: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 16,
  },
});
