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

// Single-row proof strip replaces the old 3-item benefits list AND the
// standalone trust paragraph. Three icons, three short claims — same
// promise, ~70% less vertical space.
const PROOF_STRIP = [
  { icon: "shield-checkmark-outline" as const, text: "250+ data points" },
  { icon: "time-outline" as const, text: "90 seconds" },
  { icon: "lock-closed-outline" as const, text: "No sign-up" },
];

// Rotated, not stacked: we still ship all three testimonials but show
// only one per visit so the page stays short. Random per render is fine
// here — the variance is the point.
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

  // Pick one testimonial per mount. Keeps the page short while still
  // exercising the full quote bank across sessions.
  const testimonial = React.useMemo(
    () => TESTIMONIALS[Math.floor(Math.random() * TESTIMONIALS.length)],
    [],
  );

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
          Find the country that actually fits you.
        </Text>
        <Text style={s.subtitle}>
          A 90-second quiz. Get your fit score, top country match, and what&rsquo;s holding you back.
        </Text>

        {/*
          Demo-first ordering: the preview card shows what the quiz
          produces, so the user can judge the promise visually instead of
          re-reading a benefits list. Trust strip + a single testimonial
          sit below as supporting proof.
        */}
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
          </View>
        </View>

        <View style={s.proofStrip}>
          {PROOF_STRIP.map((p) => (
            <View key={p.text} style={s.proofItem}>
              <Ionicons name={p.icon} size={16} color={TEAL} />
              <Text style={s.proofText}>{p.text}</Text>
            </View>
          ))}
        </View>

        <View style={s.testimonialCard}>
          <Text style={s.testimonialQuote}>&ldquo;{testimonial.quote}&rdquo;</Text>
          <Text style={s.testimonialAttribution}>&mdash; {testimonial.attribution}</Text>
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
    marginBottom: 14,
  },
  logo: {
    height: 36,
    width: 160,
  },

  headline: {
    fontSize: 26,
    fontFamily: tokens.font.display,
    fontWeight: "700",
    color: HEADING_COLOR,
    marginBottom: 6,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: BODY_COLOR,
    lineHeight: 21,
    marginBottom: 18,
  },

  sectionLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: SECTION_LABEL,
    letterSpacing: 1,
    marginBottom: 14,
  },

  proofStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: PURPLE_LIGHT_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PURPLE_LIGHT_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  proofItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  proofText: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: HEADING_COLOR,
  },

  previewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
    overflow: "hidden",
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
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
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
