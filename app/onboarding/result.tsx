import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  calculateQuizResult,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  type Blocker,
  type BlockerLevel,
  type Tier,
} from "@/src/data/quiz";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";

const TIER_COLORS: Record<Tier, string> = {
  dreaming: "#9BA8C0",
  exploring: tokens.color.primary,
  ready: tokens.color.teal,
};

const LEVEL_COLORS: Record<BlockerLevel, { border: string; bg: string; label: string; chip: string }> = {
  critical: { border: "#D9534F", bg: "#FDF2F1", label: "Critical", chip: "#D9534F" },
  moderate: { border: "#E8991A", bg: "#FFF8E8", label: "Moderate", chip: "#E8991A" },
  explore: { border: "#3E81DD", bg: "#EEF4FC", label: "Explore", chip: "#3E81DD" },
};

const SECTION_TITLES: Record<BlockerLevel, string> = {
  critical: "What's holding you back most",
  moderate: "Worth your attention",
  explore: "Areas to explore",
};

function getBaseUrl(): string {
  if (Platform.OS === "web") return getApiUrl().replace(/\/$/, "");
  return getBackendBase();
}

function BlockerCard({ blocker }: { blocker: Blocker }) {
  const c = LEVEL_COLORS[blocker.level];
  return (
    <View style={[styles.blockerCard, { borderLeftColor: c.border, backgroundColor: c.bg }]}>
      <View style={styles.blockerHeader}>
        <View style={[styles.levelChip, { backgroundColor: c.chip }]}>
          <Text style={styles.levelChipText}>{c.label}</Text>
        </View>
      </View>
      <Text style={styles.blockerTitle}>{blocker.title}</Text>
      <Text style={styles.blockerLabel}>What this means</Text>
      <Text style={styles.blockerBody}>{blocker.whatThisMeans}</Text>
      <Text style={styles.blockerLabel}>First action</Text>
      <Text style={styles.blockerBody}>{blocker.firstAction}</Text>
    </View>
  );
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { answers: answersStr } = useLocalSearchParams<{ answers?: string }>();
  const { completeOnboarding } = useOnboarding();
  const { user } = useAuth();

  const answers = useMemo(() => {
    try { return JSON.parse(answersStr ?? "{}"); } catch { return {}; }
  }, [answersStr]);

  const result = useMemo(() => calculateQuizResult(answers), [answers]);

  const viewedRef = React.useRef(false);
  React.useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      trackEvent("result_screen_viewed", {
        matchScore: result.score,
        tier: result.tier,
      });
    }
  }, [result]);

  const tierColor = TIER_COLORS[result.tier];

  const grouped = useMemo(() => {
    const g: Record<BlockerLevel, Blocker[]> = { critical: [], moderate: [], explore: [] };
    for (const b of result.blockers) g[b.level].push(b);
    return g;
  }, [result.blockers]);

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [saveCardDismissed, setSaveCardDismissed] = useState(false);

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

  const handleCreateAccount = async () => {
    await completeOnboarding(result, false);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "create_account" });
    router.replace("/auth?mode=register");
  };

  const handleContinue = async () => {
    await completeOnboarding(result, true);
    trackEvent("quiz_completed", { tier: result.tier, score: result.score, action: "continue" });
    router.replace("/(tabs)/(home)");
  };

  const handleUnlockRoadmap = async () => {
    await completeOnboarding(result, true);
    trackEvent("paywall_unlock_tapped", { source: "result_screen", tier: result.tier });
    router.push("/subscribe");
  };

  const handleRestart = () => {
    router.replace("/onboarding/quiz");
  };

  const renderSaveCard = () => {
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

  const renderBlockerSection = (level: BlockerLevel) => {
    const items = grouped[level];
    if (items.length === 0) return null;
    return (
      <View style={styles.blockerSection}>
        <Text style={styles.sectionHeading}>{SECTION_TITLES[level]}</Text>
        <View style={{ gap: 12 }}>
          {items.map((b) => (
            <BlockerCard key={b.questionId} blocker={b} />
          ))}
        </View>
      </View>
    );
  };

  const renderPaywallCta = () => (
    <Pressable
      onPress={handleUnlockRoadmap}
      style={({ pressed }) => [styles.paywallCta, pressed && { opacity: 0.9 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.paywallCtaTitle}>Unlock your full roadmap</Text>
        <Text style={styles.paywallCtaSub}>Country-specific guides, planner, and unlimited compare</Text>
      </View>
      <Ionicons name="lock-open-outline" size={22} color="#fff" />
    </Pressable>
  );

  const showPaywallAfterUrgent = grouped.critical.length > 0 || grouped.moderate.length > 0;

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

        {renderBlockerSection("critical")}
        {renderBlockerSection("moderate")}

        {showPaywallAfterUrgent ? renderPaywallCta() : null}

        {renderBlockerSection("explore")}

        {result.blockers.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={18} color={tokens.color.teal} />
              <Text style={[styles.successText, { fontFamily: tokens.font.bodySemiBold, fontWeight: "600" }]}>
                No critical gaps identified. Focus on locking in your timeline and target country.
              </Text>
            </View>
          </View>
        ) : null}

        {renderSaveCard()}

        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [styles.exploreCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.exploreCtaText}>Continue to ExpatHub</Text>
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
  blockerSection: {
    gap: 10,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    marginTop: 4,
    marginBottom: 4,
  },
  blockerCard: {
    borderRadius: 14,
    borderLeftWidth: 5,
    padding: 18,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(28,43,94,0.06)",
    borderRightColor: "rgba(28,43,94,0.06)",
    borderBottomColor: "rgba(28,43,94,0.06)",
  },
  blockerHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  levelChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  levelChipText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  blockerTitle: {
    fontSize: 17,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    color: tokens.color.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  blockerLabel: {
    fontSize: 12,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600",
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  blockerBody: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  paywallCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#606CB9",
    borderRadius: 14,
    padding: 18,
  },
  paywallCtaTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: tokens.font.display,
    fontWeight: "600",
    marginBottom: 2,
  },
  paywallCtaSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: tokens.font.body,
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
