import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

let _onboardingTracked = false;

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
    text: "Your relocation readiness on a clear scale \u2014 from just getting started to ready to plan",
  },
  {
    icon: "checkmark-circle-outline" as const,
    text: "Your top blockers named specifically \u2014 not generic advice, your actual gaps",
  },
  {
    icon: "warning-outline" as const,
    text: "A first action for each blocker so you know exactly where to start",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I\u2019d been pinning Lisbon photos for two years before I finally took this. Two minutes in it told me the D7 wouldn\u2019t work for my income \u2014 which actually pointed me at a visa I\u2019d never heard of. We landed in March.",
    attribution: "Sarah, Lisbon",
  },
  {
    quote:
      "I thought I had Spain figured out. The quiz flagged that my partner and I weren\u2019t actually on the same page about leaving. That conversation took six months \u2014 really glad we had it before we packed.",
    attribution: "Marcus, Spain",
  },
  {
    quote:
      "I kept telling myself I\u2019d figure it out \u201cnext year.\u201D This made me admit I had no real timeline and no backup plan. Two months later I had both. Living in the Algarve now.",
    attribution: "Jamie, Algarve",
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { skipOnboarding } = useOnboarding();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  React.useEffect(() => {
    if (!_onboardingTracked) {
      _onboardingTracked = true;
      trackEvent("onboarding_started");
    }
  }, []);

  return (
    <View style={s.root}>
      <ScrollView
        style={[s.container, { paddingTop: topPad + 16 }]}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPad + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.logoWrap}>
          <Image
            source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
            resizeMode="contain"
            style={s.logo}
          />
        </View>

        <Text style={s.headline}>
          Not Sure Which Country Is Right for You?
        </Text>
        <Text style={s.subtitle}>
          Take the 90-second quiz. Get a personalised fit score, your top country match, and exactly what's holding you back.
        </Text>

        <Text style={s.sectionLabel}>WHAT YOU'LL GET</Text>
        <View style={s.benefitList}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={s.benefitRow}>
              <View style={s.benefitIcon}>
                <Ionicons name={b.icon} size={16} color={TEAL} />
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
            <Text style={s.scoreLabel}>Relocation readiness</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: "69%" }]} />
            </View>

            <View style={s.tierRow}>
              <View style={s.tierBadge}>
                <Text style={s.tierBadgeText}>Serious researcher</Text>
              </View>
              <Text style={s.tierDesc}>
                You&rsquo;ve done real homework. A few gaps to close before committing.
              </Text>
            </View>

            <View style={s.matchCard}>
              <Ionicons name="alert-circle" size={26} color={AMBER} />
              <View style={s.matchTextWrap}>
                <Text style={s.matchTitle}>Top blocker</Text>
                <Text style={s.matchDesc}>
                  Visa pathway not yet identified
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

        <Text style={[s.sectionLabel, { marginTop: 24 }]}>WHAT OTHERS SAY</Text>
        <View style={s.testimonialList}>
          {TESTIMONIALS.map((t, i) => (
            <View key={i} style={s.testimonialCard}>
              <Text style={s.testimonialQuote}>&ldquo;{t.quote}&rdquo;</Text>
              <Text style={s.testimonialAttribution}>&mdash; {t.attribution}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[s.stickyFooter, { paddingBottom: bottomPad + 12 }]}>
        <Pressable
          onPress={() => router.push("/onboarding/quiz")}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.ctaText}>Take the quiz</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        <View style={s.footerMeta}>
          <View style={s.metaRow}>
            <Ionicons name="time-outline" size={14} color={BODY_COLOR} />
            <Text style={s.metaText}>Takes 2 minutes. No sign-up required.</Text>
          </View>

          <Pressable
            onPress={async () => {
              await skipOnboarding();
              router.replace("/(tabs)/(home)");
            }}
            hitSlop={12}
            style={s.skipBtn}
          >
            <Text style={s.skipText}>Skip and explore on my own</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  logoWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  logo: {
    height: 52,
    width: 240,
  },

  headline: {
    fontSize: 28,
    fontFamily: tokens.font.display,
    fontWeight: "700",
    color: HEADING_COLOR,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 23,
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
    letterSpacing: 1,
    marginBottom: 14,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TEAL_BG,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 0,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 20,
    paddingTop: 3,
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
    gap: 14,
  },

  scoreLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 17,
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
    gap: 3,
  },
  matchTitle: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: HEADING_COLOR,
  },
  matchDesc: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 17,
  },

  gapRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  gapText: {
    flex: 1,
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 17,
  },
  gapBold: {
    fontFamily: tokens.font.bodyBold,
    fontWeight: "700",
  },

  trustText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 20,
    marginBottom: 8,
  },

  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(28,43,94,0.08)",
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

  footerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
  },

  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
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
    fontSize: 13,
    fontFamily: tokens.font.body,
    fontStyle: "italic",
    color: BODY_COLOR,
    lineHeight: 20,
    marginBottom: 8,
    textAlign: "left",
  },
  testimonialAttribution: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    fontStyle: "italic",
    color: HEADING_COLOR,
    textAlign: "left",
  },
});
