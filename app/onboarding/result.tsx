import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calculateQuizResult, getGapMessage, TIER_LABELS, TIER_DESCRIPTIONS } from "@/src/data/quiz";
import type { Tier } from "@/src/data/quiz";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useCountry } from "@/contexts/CountryContext";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

const TIER_COLORS: Record<Tier, string> = {
  dreaming: "#9BA8C0",
  exploring: tokens.color.primary,
  ready: tokens.color.teal,
};

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { answers: answersStr } = useLocalSearchParams<{ answers?: string }>();
  const { completeOnboarding } = useOnboarding();
  const { setSelectedCountrySlug } = useCountry();

  const answers = useMemo(() => {
    try { return JSON.parse(answersStr ?? "{}"); } catch { return {}; }
  }, [answersStr]);

  const result = useMemo(() => calculateQuizResult(answers), [answers]);

  const tierColor = TIER_COLORS[result.tier];
  const gapMessage = getGapMessage(result.risks);

  const handleCreateAccount = async () => {
    await completeOnboarding(result, false);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "create_account" });
    router.replace("/auth?mode=register");
  };

  const handleExploreMatch = async () => {
    await completeOnboarding(result, true);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "explore_match" });
    if (result.topMatch.slug) {
      setSelectedCountrySlug(result.topMatch.slug);
      router.replace("/(tabs)/(home)");
    } else {
      router.replace("/(tabs)/(home)");
    }
  };

  const handleSkip = async () => {
    await completeOnboarding(result, true);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "skip" });
    router.replace("/(tabs)/(home)");
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.yourResult}>Your Readiness Score</Text>
          <View style={[styles.scoreCircle, { borderColor: tierColor }]}>
            <Text style={[styles.scoreNumber, { color: tierColor }]}>{result.score}</Text>
            <Text style={styles.scoreMax}>/16</Text>
          </View>
        </View>

        <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
          <Text style={styles.tierBadgeText}>{TIER_LABELS[result.tier]}</Text>
        </View>

        <Text style={styles.tierDescription}>{TIER_DESCRIPTIONS[result.tier]}</Text>

        <View style={styles.divider} />

        <View style={styles.matchSection}>
          <Text style={styles.matchLabel}>Your Top Match</Text>
          <View style={styles.matchCard}>
            <Text style={styles.matchFlag}>{result.topMatch.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchName}>{result.topMatch.name}</Text>
              <Text style={styles.matchDesc}>{result.topMatch.description}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.gapSection}>
          <Text style={styles.gapTitle}>
            {result.risks.length === 0 ? "Looking good" : "Gaps to address"}
          </Text>
          <Text style={styles.gapMessage}>{gapMessage}</Text>
          {result.risks.length > 0 ? (
            <View style={styles.riskList}>
              {result.risks.map((risk) => (
                <View key={risk} style={styles.riskRow}>
                  <Ionicons name="alert-circle" size={16} color={tokens.color.gold} />
                  <Text style={styles.riskText}>{risk}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: bottomPad + 16 }]}>
        <Pressable
          onPress={handleCreateAccount}
          style={({ pressed }) => [styles.primaryCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.primaryCtaText}>Create Free Account to Save Results</Text>
        </Pressable>

        {result.topMatch.slug ? (
          <Pressable
            onPress={handleExploreMatch}
            style={({ pressed }) => [styles.secondaryCta, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.secondaryCtaText}>
              Explore {result.topMatch.name}
            </Text>
          </Pressable>
        ) : null}

        <Pressable onPress={handleSkip} hitSlop={8}>
          <Text style={styles.skipText}>Skip for now</Text>
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
    paddingTop: 24,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  yourResult: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  scoreNumber: {
    fontSize: 36,
    fontFamily: tokens.font.display,
    fontWeight: "600",
  },
  scoreMax: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 8,
  },
  tierBadge: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 16,
  },
  tierBadgeText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  tierDescription: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(28,43,94,0.08)",
    marginVertical: 24,
  },
  matchSection: {
    gap: 12,
  },
  matchLabel: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
  },
  matchFlag: {
    fontSize: 40,
  },
  matchName: {
    fontSize: 20,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    marginBottom: 4,
  },
  matchDesc: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  gapSection: {
    gap: 8,
  },
  gapTitle: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  gapMessage: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 24,
  },
  riskList: {
    gap: 8,
    marginTop: 8,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  riskText: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
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
    gap: 10,
    alignItems: "center",
  },
  primaryCta: {
    backgroundColor: tokens.color.gold,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  primaryCtaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  secondaryCta: {
    backgroundColor: tokens.color.teal,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  secondaryCtaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  skipText: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 4,
  },
});
