import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { tokens } from "@/theme/tokens";

const FEATURES = [
  { icon: "map-outline" as const, text: "Country guides with visa pathways, costs, and timelines" },
  { icon: "shield-checkmark-outline" as const, text: "Vetted resources from official and authoritative sources" },
  { icon: "people-outline" as const, text: "Community insights from expats who've done it" },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { skipOnboarding } = useOnboarding();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad + 24 }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 + bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <Image
            source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
            resizeMode="contain"
            style={{ height: 56, width: 240 }}
          />
        </View>

        <Text style={styles.welcome}>Welcome to ExpatHub</Text>
        <Text style={styles.tagline}>
          Your guide to relocating abroad with confidence.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={22} color={tokens.color.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.quizSection}>
          <View style={styles.quizIconCircle}>
            <Ionicons name="compass" size={28} color={tokens.color.gold} />
          </View>
          <Text style={styles.quizHeadline}>Find your best-fit country</Text>
          <Text style={styles.quizSubtext}>
            Take a quick readiness check to see where you stand and which country matches your situation.
          </Text>
          <Text style={styles.quizMeta}>9 questions - about 2 minutes</Text>
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: bottomPad + 16 }]}>
        <Pressable
          onPress={() => router.push("/onboarding/quiz")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>Take the Quiz</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
        <Pressable
          onPress={async () => {
            await skipOnboarding();
            router.replace("/(tabs)/(home)");
          }}
          hitSlop={8}
        >
          <Text style={styles.skipText}>Skip and explore on my own</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  scrollContent: {
    paddingHorizontal: tokens.space.xl,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 32,
  },
  welcome: {
    fontSize: 28,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    textAlign: "center",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    maxWidth: 320,
    alignSelf: "center",
  },
  featureList: {
    gap: 18,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(62,129,221,0.1)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 22,
    paddingTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(28,43,94,0.08)",
    marginBottom: 28,
  },
  quizSection: {
    alignItems: "center",
  },
  quizIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(232,153,26,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  quizHeadline: {
    fontSize: 20,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    textAlign: "center",
    marginBottom: 8,
  },
  quizSubtext: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: 8,
  },
  quizMeta: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  ctaBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space.xl,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(28,43,94,0.08)",
    gap: 12,
    alignItems: "center",
  },
  cta: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  skipText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    paddingVertical: 4,
  },
});
