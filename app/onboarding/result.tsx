import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calculateQuizResult, getGapMessage, hasFullGuide, TIER_LABELS, TIER_DESCRIPTIONS } from "@/src/data/quiz";
import type { Tier } from "@/src/data/quiz";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";

const TIER_COLORS: Record<Tier, string> = {
  dreaming: "#9BA8C0",
  exploring: tokens.color.primary,
  ready: tokens.color.teal,
};

function getBaseUrl(): string {
  if (Platform.OS === "web") return getApiUrl().replace(/\/$/, "");
  return getBackendBase();
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { answers: answersStr } = useLocalSearchParams<{ answers?: string }>();
  const { completeOnboarding } = useOnboarding();
  const { user } = useAuth();
  const { setSelectedCountrySlug } = useCountry();

  const answers = useMemo(() => {
    try { return JSON.parse(answersStr ?? "{}"); } catch { return {}; }
  }, [answersStr]);

  const result = useMemo(() => calculateQuizResult(answers), [answers]);

  const tierColor = TIER_COLORS[result.tier];
  const gapMessage = getGapMessage(result.risks);
  const countryHasGuide = hasFullGuide(result.topMatch.slug);

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [saveCardDismissed, setSaveCardDismissed] = useState(false);

  const [interestEmail, setInterestEmail] = useState("");
  const [interestSent, setInterestSent] = useState(false);
  const [interestSending, setInterestSending] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const knownEmail = user?.email ?? null;

  const handleEmailResults = async () => {
    const addr = email;
    if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return;
    setEmailSending(true);
    try {
      const base = getBaseUrl();
      await fetch(`${base}/api/readiness-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr, score: result.score, tier: result.tier, risks: result.risks, answers }),
      });
      setEmailSent(true);
      trackEvent("readiness_lead_saved", { tier: result.tier, score: result.score });
    } catch {} finally { setEmailSending(false); }
  };

  const handleCountryInterestKnown = async () => {
    if (!knownEmail) return;
    setInterestSending(true);
    try {
      const base = getBaseUrl();
      const slug = result.topMatch.slug ?? result.topMatch.name.toLowerCase().replace(/[\s,]+/g, "-");
      await fetch(`${base}/api/country-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: knownEmail, country_slug: slug }),
      });
      setInterestSent(true);
      trackEvent("country_interest_submitted", { country: result.topMatch.name });
    } catch {} finally { setInterestSending(false); }
  };

  const handleCountryInterestAnon = async () => {
    if (!interestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interestEmail)) return;
    setInterestSending(true);
    try {
      const base = getBaseUrl();
      const slug = result.topMatch.slug ?? result.topMatch.name.toLowerCase().replace(/[\s,]+/g, "-");
      await fetch(`${base}/api/country-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: interestEmail, country_slug: slug }),
      });
      setInterestSent(true);
      trackEvent("country_interest_submitted", { country: result.topMatch.name });
    } catch {} finally { setInterestSending(false); }
  };

  const handleCreateAccount = async () => {
    await completeOnboarding(result, false);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "create_account" });
    router.replace("/auth?mode=register");
  };

  const handleExploreMatch = async () => {
    await completeOnboarding(result, true);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "explore_match" });
    if (result.topMatch.slug && countryHasGuide) {
      setSelectedCountrySlug(result.topMatch.slug);
    }
    router.replace("/(tabs)/(home)");
  };

  const handleRestart = () => {
    router.replace("/onboarding/quiz");
  };

  const renderAvailabilityNotice = () => {
    if (countryHasGuide || noticeDismissed) return null;

    if (interestSent) {
      return (
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle" size={16} color={tokens.color.teal} />
          <Text style={styles.successText}>You're on the list - we'll let you know when it launches.</Text>
        </View>
      );
    }

    return (
      <View style={styles.amberNotice}>
        <Ionicons name="information-circle" size={18} color="#92670A" />
        <View style={{ flex: 1 }}>
          <Text style={styles.amberText}>
            No full guide for {result.topMatch.name} yet - get notified when it's ready?
          </Text>

          {knownEmail ? (
            <View style={styles.noticeActions}>
              <Pressable
                onPress={handleCountryInterestKnown}
                disabled={interestSending}
                style={({ pressed }) => [styles.notifyBtnInline, pressed && { opacity: 0.8 }]}
              >
                {interestSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.notifyBtnText}>Yes, notify me</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setNoticeDismissed(true)} hitSlop={8}>
                <Text style={styles.noThanksLink}>No thanks</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.notifyRow}>
              <TextInput
                style={styles.notifyInput}
                placeholder="your@email.com"
                placeholderTextColor={tokens.color.subtext}
                value={interestEmail}
                onChangeText={setInterestEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={handleCountryInterestAnon}
                disabled={interestSending}
                style={({ pressed }) => [styles.notifyBtn, pressed && { opacity: 0.9 }]}
              >
                {interestSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.notifyBtnText}>Notify me</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderSaveCard = () => {
    if (!countryHasGuide) return null;

    if (emailSent) {
      return (
        <View style={styles.card}>
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color={tokens.color.teal} />
            <Text style={styles.successText}>Sent! Check your inbox. Your full breakdown is on its way.</Text>
          </View>
        </View>
      );
    }

    if (saveCardDismissed) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.emailLabel}>Save your results</Text>
        <Text style={styles.emailSubtext}>No sales calls. No spam. Just your breakdown.</Text>
        <TextInput
          style={styles.emailInput}
          placeholder="your@email.com"
          placeholderTextColor={tokens.color.subtext}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={handleCreateAccount}
          style={({ pressed }) => [styles.goldBtn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.goldBtnText}>Create Free Account to Save Results</Text>
        </Pressable>
        <View style={styles.secondaryLinks}>
          <Pressable onPress={handleEmailResults} disabled={emailSending} hitSlop={8}>
            {emailSending ? (
              <ActivityIndicator size="small" color={tokens.color.subtext} />
            ) : (
              <Text style={styles.secondaryLink}>Just email me the results</Text>
            )}
          </Pressable>
          <Text style={styles.linkDot}>|</Text>
          <Pressable onPress={() => setSaveCardDismissed(true)} hitSlop={8}>
            <Text style={styles.secondaryLink}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Your Readiness Score</Text>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreCircle, { borderColor: tierColor }]}>
              <Text style={[styles.scoreNumber, { color: tierColor }]}>{result.score}</Text>
              <Text style={styles.scoreMax}>/16</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 20 }}>
              <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
                <Text style={styles.tierBadgeText}>{TIER_LABELS[result.tier]}</Text>
              </View>
              <Text style={styles.tierDescription}>{TIER_DESCRIPTIONS[result.tier]}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Your Top Match</Text>
          <View style={styles.matchRow}>
            <Text style={styles.matchFlag}>{result.topMatch.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchName}>{result.topMatch.name}</Text>
              <Text style={styles.matchDesc}>{result.topMatch.description}</Text>
            </View>
          </View>
          {renderAvailabilityNotice()}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {result.risks.length === 0 ? "Looking Good" : "Gaps to Address"}
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

        {renderSaveCard()}

        <Pressable
          onPress={handleExploreMatch}
          style={({ pressed }) => [styles.exploreCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.exploreCtaText}>Explore {result.topMatch.name}</Text>
        </Pressable>

        <Pressable onPress={handleRestart} hitSlop={8} style={{ alignSelf: "center", marginTop: 4 }}>
          <Text style={styles.restartLink}>Restart quiz</Text>
        </Pressable>
      </ScrollView>
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
    gap: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 14,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  scoreNumber: {
    fontSize: 30,
    fontFamily: tokens.font.display,
    fontWeight: "600",
  },
  scoreMax: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 6,
  },
  tierBadge: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  tierBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  tierDescription: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
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
  amberNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    backgroundColor: "#FFF8E8",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F0DCA0",
  },
  amberText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: "#92670A",
    lineHeight: 20,
    marginBottom: 10,
  },
  noticeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  notifyBtnInline: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  noThanksLink: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: "#92670A",
    textDecorationLine: "underline",
  },
  notifyRow: {
    flexDirection: "row",
    gap: 10,
  },
  notifyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: "#fff",
  },
  notifyBtn: {
    backgroundColor: tokens.color.gold,
    paddingHorizontal: 18,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  notifyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.teal,
    lineHeight: 20,
  },
  gapMessage: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 22,
    marginBottom: 4,
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
  emailLabel: {
    fontSize: 16,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.text,
    marginBottom: 4,
  },
  emailSubtext: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginBottom: 14,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    backgroundColor: tokens.color.bg,
    marginBottom: 12,
  },
  goldBtn: {
    backgroundColor: tokens.color.gold,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  goldBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  secondaryLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  secondaryLink: {
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textDecorationLine: "underline",
  },
  linkDot: {
    fontSize: 13,
    color: tokens.color.subtext,
  },
  exploreCta: {
    backgroundColor: tokens.color.teal,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  exploreCtaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
  },
  restartLink: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textDecorationLine: "underline",
    paddingVertical: 8,
  },
});
