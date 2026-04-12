import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { tokens } from "@/theme/tokens";

const SECTION_LABEL = "#606CB9";
const BODY_COLOR = "#5A6785";
const HEADING_COLOR = "#1C2B5E";
const TEAL = "#33C4DC";
const TEAL_BG = "rgba(51, 196, 220, 0.15)";
const PURPLE_BORDER = "rgba(96,108,185,0.2)";
const PURPLE_LIGHT_BG = "rgba(96,108,185,0.08)";
const PURPLE_LIGHT_BORDER = "rgba(96,108,185,0.15)";
const CTA_BG = "#606CB9";
const AMBER = "#d97706";
const BG = "#F7F6F2";

const BENEFITS = [
  {
    icon: "locate-outline" as const,
    text: "A readiness score (0\u201316) and your tier \u2014 Dreaming, Exploring, or Ready to Act",
  },
  {
    icon: "checkmark-circle-outline" as const,
    text: "Your top country match based on your visa options, lifestyle priorities, and budget",
  },
  {
    icon: "warning-outline" as const,
    text: "A gap analysis showing the 1\u20133 things most likely to derail your move",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I\u2019d been researching Portugal for months. The quiz told me in 2 minutes that my income type was the wrong fit for the D7 \u2014 saved me from a very expensive mistake.",
    name: "James R.",
    detail: "Beta tester \u00B7 moved to Spain instead",
  },
  {
    quote:
      "I thought I was ready. The gap analysis flagged my exit strategy and timeline. Both were real problems I hadn\u2019t thought through.",
    name: "Priya M.",
    detail: "Beta tester \u00B7 currently applying for NLV",
  },
  {
    quote:
      "Brutally honest. Didn\u2019t tell me what I wanted to hear \u2014 told me what I needed to fix. That\u2019s rare.",
    name: "David K.",
    detail: "Beta tester \u00B7 Exploring tier, targeting 2026",
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { skipOnboarding } = useOnboarding();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      style={[s.container, { paddingTop: topPad + 24 }]}
      contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPad + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.headline}>
        Not Sure Which Country Is Right for You?
      </Text>
      <Text style={s.subtitle}>
        Answer 9 questions. Get a personalised fit score, your top country match, and exactly what's holding you back.
      </Text>

      <Text style={s.sectionLabel}>WHAT YOU'LL GET</Text>
      <View style={s.benefitList}>
        {BENEFITS.map((b, i) => (
          <View key={i} style={s.benefitRow}>
            <View style={s.benefitIcon}>
              <Ionicons name={b.icon} size={12} color={TEAL} />
            </View>
            <Text style={s.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>

      <View style={s.previewCard}>
        <View style={s.previewHeader}>
          <Text style={s.previewHeaderText}>SAMPLE RESULT PREVIEW</Text>
        </View>

        <View style={s.previewBody}>
          <View style={s.scoreRow}>
            <Text style={s.scoreLabel}>Readiness Score</Text>
            <Text style={s.scoreValue}>11 / 16</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: "69%" }]} />
          </View>

          <View style={s.tierRow}>
            <View style={s.tierBadge}>
              <Text style={s.tierBadgeText}>Exploring</Text>
            </View>
            <Text style={s.tierDesc}>
              Serious, but a few gaps to close before committing.
            </Text>
          </View>

          <View style={s.matchCard}>
            <Text style={s.matchFlag}>{"\uD83C\uDDF5\uD83C\uDDF9"}</Text>
            <View style={s.matchTextWrap}>
              <Text style={s.matchTitle}>Top Match — Portugal</Text>
              <Text style={s.matchDesc}>
                D7 pathway, Algarve or Lisbon — strong fit for your profile.
              </Text>
            </View>
          </View>

          <View style={s.gapRow}>
            <Ionicons name="warning-outline" size={14} color={AMBER} />
            <Text style={s.gapText}>
              Main gap: <Text style={s.gapBold}>Visa Pathway</Text> — identify your specific visa before committing.
            </Text>
          </View>
        </View>
      </View>

      <Text style={s.trustText}>
        ExpatHub analyzes over 250 data points across healthcare, cost of living, visa complexity, and tax treaties to match your profile to a country.
      </Text>

      <Pressable
        onPress={() => router.push("/onboarding/quiz")}
        style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}
      >
        <Text style={s.ctaText}>See My Results</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </Pressable>

      <View style={s.metaRow}>
        <Ionicons name="time-outline" size={14} color={BODY_COLOR} />
        <Text style={s.metaText}>Takes 2 minutes. No sign-up required.</Text>
      </View>

      <View style={s.skipWrap}>
        <Pressable
          onPress={async () => {
            await skipOnboarding();
            router.replace("/(tabs)/(home)");
          }}
          hitSlop={8}
        >
          <Text style={s.skipText}>Skip and explore on my own</Text>
        </Pressable>
      </View>

      <Text style={[s.sectionLabel, { marginTop: 32 }]}>WHAT OTHERS SAY</Text>
      <View style={s.testimonialList}>
        {TESTIMONIALS.map((t, i) => (
          <View key={i} style={s.testimonialCard}>
            <Text style={s.testimonialQuote}>"{t.quote}"</Text>
            <Text style={s.testimonialName}>{t.name}</Text>
            <Text style={s.testimonialDetail}>{t.detail}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  headline: {
    fontSize: 32,
    fontFamily: tokens.font.display,
    fontWeight: "700",
    color: HEADING_COLOR,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 24,
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 10,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
    letterSpacing: 1,
    marginBottom: 16,
  },

  benefitList: {
    gap: 14,
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  benefitIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TEAL_BG,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 20,
  },

  previewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
    overflow: "hidden",
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    }),
  },
  previewHeader: {
    backgroundColor: PURPLE_LIGHT_BG,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: PURPLE_BORDER,
  },
  previewHeaderText: {
    fontSize: 10,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
    letterSpacing: 0.8,
  },
  previewBody: {
    padding: 16,
    gap: 12,
  },

  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
  },
  scoreValue: {
    fontSize: 16,
    fontFamily: tokens.font.bodyBold,
    fontWeight: "700",
    color: HEADING_COLOR,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    backgroundColor: TEAL,
    borderRadius: 4,
  },

  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tierBadge: {
    backgroundColor: TEAL,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierBadgeText: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tierDesc: {
    flex: 1,
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 16,
  },

  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PURPLE_LIGHT_BORDER,
    padding: 12,
  },
  matchFlag: {
    fontSize: 24,
  },
  matchTextWrap: {
    flex: 1,
    gap: 2,
  },
  matchTitle: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: HEADING_COLOR,
  },
  matchDesc: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 16,
  },

  gapRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  gapText: {
    flex: 1,
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 16,
  },
  gapBold: {
    fontFamily: tokens.font.bodyBold,
    fontWeight: "700",
  },

  trustText: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 18,
    marginBottom: 16,
  },

  cta: {
    backgroundColor: CTA_BG,
    height: 56,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
  },

  skipWrap: {
    alignItems: "center",
    marginTop: 10,
  },
  skipText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    paddingVertical: 4,
  },

  testimonialList: {
    gap: 12,
  },
  testimonialCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PURPLE_LIGHT_BORDER,
    padding: 16,
  },
  testimonialQuote: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    fontStyle: "italic",
    color: BODY_COLOR,
    lineHeight: 20,
    marginBottom: 10,
  },
  testimonialName: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: HEADING_COLOR,
    marginBottom: 2,
  },
  testimonialDetail: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
  },
});
