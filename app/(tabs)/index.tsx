import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { useContinue } from "@/src/contexts/ContinueContext";
import { getCountries, getCountry, getPopularCountries } from "@/src/data";
import { COVERAGE_SUMMARY } from "@/src/data";
import { getApiUrl } from "@/lib/query-client";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedCountrySlug, setSelectedCountrySlug, isLoaded } = useCountry();
  const { lastViewedCountrySlug, lastViewedSection, clearContinue } = useContinue();

  const selected = useMemo(() => {
    if (!selectedCountrySlug) return null;
    return getCountry(selectedCountrySlug) ?? null;
  }, [selectedCountrySlug]);

  const continueCountry = useMemo(() => {
    const slug = lastViewedCountrySlug || selectedCountrySlug;
    if (!slug) return null;
    return getCountry(slug) ?? null;
  }, [lastViewedCountrySlug, selectedCountrySlug]);

  const popular = useMemo(() => {
    const flagged = getPopularCountries();
    const list = flagged.length ? flagged : getCountries();
    return list.slice(0, 6);
  }, []);

  const sectionLabel = useMemo(() => {
    if (!lastViewedSection) return null;
    const labels: Record<string, string> = {
      resources: "Resources",
      vendors: "Vendors",
      community: "Community",
    };
    return labels[lastViewedSection] ?? null;
  }, [lastViewedSection]);

  const goCountryHub = (slug: string) => {
    setSelectedCountrySlug(slug);
    router.push({ pathname: "/country-view", params: { slug } } as any);
  };

  const goContinue = () => {
    const slug = lastViewedCountrySlug || selectedCountrySlug;
    if (!slug) return;
    setSelectedCountrySlug(slug);
    if (lastViewedSection) {
      router.push({ pathname: `/(tabs)/country/[slug]/${lastViewedSection}` as any, params: { slug } });
    } else {
      router.push({ pathname: "/country-view", params: { slug } } as any);
    }
  };

  const goBrowseCountries = () => {
    router.push("/(tabs)/country");
  };

  const hasSelection = Boolean(continueCountry);

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === "web" ? WEB_TOP_INSET : insets.top) + tokens.space.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={{ width: 28 }} />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => router.push(user ? "/account" : ("/auth?mode=register" as any))}
            hitSlop={12}
          >
            <Ionicons
              name={user ? "person-circle" : "person-circle-outline"}
              size={28}
              color={user ? tokens.color.primary : tokens.color.subtext}
            />
          </Pressable>
        </View>

        {!isLoaded ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {!hasSelection ? (
              <View style={styles.welcomeSection}>
                <Image
                  source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
                  resizeMode="contain"
                  style={styles.welcomeLogo}
                />
                <Text style={styles.welcomeTitle}>
                  Move abroad with clarity
                </Text>
                <Text style={styles.welcomeBody}>
                  ExpatHub helps you understand visa options, work authorization rules, and residency pathways so you can make confident decisions about relocating internationally.
                </Text>

                <View style={styles.valueProps}>
                  <View style={styles.valuePropRow}>
                    <View style={styles.valuePropIcon}>
                      <Ionicons name="shield-checkmark" size={16} color={tokens.color.primary} />
                    </View>
                    <Text style={styles.valuePropText}>Decision Briefs that clarify what work is actually allowed</Text>
                  </View>
                  <View style={styles.valuePropRow}>
                    <View style={styles.valuePropIcon}>
                      <Ionicons name="git-compare-outline" size={16} color={tokens.color.primary} />
                    </View>
                    <Text style={styles.valuePropText}>Compare pathways side-by-side across countries</Text>
                  </View>
                  <View style={styles.valuePropRow}>
                    <View style={styles.valuePropIcon}>
                      <Ionicons name="people-outline" size={16} color={tokens.color.primary} />
                    </View>
                    <Text style={styles.valuePropText}>Verified vendors, resources, and community connections</Text>
                  </View>
                </View>

                <Pressable onPress={goBrowseCountries} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Choose your country</Text>
                  <Ionicons name="arrow-forward" size={16} color={tokens.color.white} />
                </Pressable>

                <View style={styles.coverageNote}>
                  <Ionicons name="checkmark-circle" size={14} color={tokens.color.primary} />
                  <Text style={styles.coverageNoteText}>
                    Decision-ready: {COVERAGE_SUMMARY.ready}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.returningSection}>
                <Image
                  source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
                  resizeMode="contain"
                  style={[styles.welcomeLogo, { alignSelf: "center" }]}
                />
                <Text style={[styles.returningGreeting, { textAlign: "center" }]}>{user ? "Welcome back" : "Continue exploring"}</Text>

                <Pressable onPress={goContinue} style={styles.continueCard}>
                  <View style={styles.continueRow}>
                    <View style={styles.continueFlagCircle}>
                      <Ionicons name="flag" size={18} color={tokens.color.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.continueTitle}>{continueCountry!.name}</Text>
                      <Text style={styles.continueSub}>
                        {sectionLabel ? sectionLabel : "Pick up where you left off"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={tokens.color.white} />
                  </View>
                </Pressable>

                <Pressable onPress={clearContinue} hitSlop={10}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.popularSection}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Popular destinations</Text>
                {!hasSelection ? (
                  <Pressable onPress={goBrowseCountries} hitSlop={10}>
                    <Text style={styles.sectionLink}>See all</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.listGap}>
                {popular.map((c) => (
                  <Pressable
                    key={c.slug}
                    onPress={() => {
                      setSelectedCountrySlug(c.slug);
                      goCountryHub(c.slug);
                    }}
                    style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{c.name}</Text>
                      <Text style={styles.rowSubtitle}>{c.region}</Text>
                    </View>
                    <View style={styles.openPill}>
                      <Text style={styles.openPillText}>Open</Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={goBrowseCountries} style={styles.browseAllButton}>
                <Text style={styles.browseAllText}>Browse All Countries</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => Linking.openURL("https://www.expathub.website")}
              style={({ pressed }) => [styles.websiteCta, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.websiteCtaText}>Check out our website at</Text>
              <Image
                source={require("@/assets/brand/fulllogo_transparent_nobuffer no_tag.png")}
                style={styles.websiteCtaLogo}
                resizeMode="contain"
              />
            </Pressable>

            <View style={styles.footer}>
              <View style={styles.footerDivider} />
              <View style={styles.footerLinks}>
                <Pressable onPress={() => { Linking.openURL("https://www.expathub.website/privacy"); }} hitSlop={8}>
                  <Text style={styles.footerLinkText}>Privacy Policy</Text>
                </Pressable>
                <Text style={styles.footerDot}>&middot;</Text>
                <Pressable onPress={() => { Linking.openURL("https://www.expathub.website/terms"); }} hitSlop={8}>
                  <Text style={styles.footerLinkText}>Terms of Service</Text>
                </Pressable>
                <Text style={styles.footerDot}>&middot;</Text>
                <Pressable onPress={() => router.push(user ? "/account" : ("/auth?mode=register" as any))} hitSlop={8}>
                  <Text style={styles.footerLinkText}>Account</Text>
                </Pressable>
              </View>
              <Text style={styles.footerCopy}>2026 Magic Elf Digital</Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: { paddingBottom: tokens.space.xxl },

  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    paddingHorizontal: tokens.space.lg,
    marginBottom: 4,
  },

  loadingCard: {
    padding: tokens.space.xl,
    margin: tokens.space.xl,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: "center" as const,
  },
  loadingText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  },

  welcomeSection: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.xl,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.md,
    alignItems: "center" as const,
  },

  welcomeLogo: {
    height: 64,
    width: 260,
    marginBottom: tokens.space.sm,
  },

  welcomeTitle: {
    fontSize: 28,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    textAlign: "center" as const,
    lineHeight: 34,
  },

  welcomeBody: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    lineHeight: 22,
    paddingHorizontal: tokens.space.sm,
  },

  valueProps: {
    width: "100%" as const,
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },

  valuePropRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },

  valuePropIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },

  valuePropText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.text,
    lineHeight: 20,
  },

  primaryButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    width: "100%" as const,
    paddingVertical: 16,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.primary,
    marginTop: tokens.space.sm,
  },

  primaryButtonText: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.white,
  },

  coverageNote: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },

  coverageNoteText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
  },

  returningSection: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.xl,
    paddingBottom: tokens.space.sm,
    gap: tokens.space.sm,
  },

  returningGreeting: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  continueCard: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
  },

  continueRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },

  continueFlagCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  continueTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.white,
  },

  continueSub: {
    fontSize: tokens.text.body,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 18,
    marginTop: 2,
  },

  clearText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    textAlign: "center" as const,
    marginTop: 2,
  },

  popularSection: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.lg,
    gap: tokens.space.sm,
  },

  sectionRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "space-between" as const,
  },

  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  sectionLink: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  listGap: { gap: tokens.space.sm },

  rowCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
  },

  rowCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  rowTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
  },

  rowSubtitle: {
    marginTop: 2,
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },

  openPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
  },

  openPillText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  browseAllButton: {
    marginTop: tokens.space.sm,
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.primary,
    alignItems: "center" as const,
  },

  browseAllText: {
    color: tokens.color.white,
    fontWeight: tokens.weight.black,
  },

  websiteCta: {
    marginTop: tokens.space.lg,
    marginHorizontal: tokens.space.xl,
    alignItems: "center" as const,
    paddingVertical: 10,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 6,
  },
  websiteCtaText: {
    fontSize: 12,
    color: tokens.color.subtext,
  },
  websiteCtaLogo: {
    width: 140,
    height: 32,
  },

  footer: {
    marginTop: tokens.space.xxl,
    paddingHorizontal: tokens.space.xl,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  footerDivider: {
    width: "100%" as const,
    height: 1,
    backgroundColor: tokens.color.border,
    marginBottom: tokens.space.sm,
  },
  footerLinks: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  footerLinkText: {
    fontSize: tokens.text.small,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },
  footerDot: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },
  footerCopy: {
    fontSize: 11,
    color: tokens.color.subtext,
  },
} as const;
