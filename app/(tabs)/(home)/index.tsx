import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useCountry } from "@/contexts/CountryContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useContinue } from "@/src/contexts/ContinueContext";
import { useLayout } from "@/src/hooks/useLayout";
import { getCountries, getCountry, REGION_ORDER, sortCountriesAlpha, isLaunchCountry } from "@/src/data";
import { COVERAGE_SUMMARY } from "@/src/data";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedCountrySlug, setSelectedCountrySlug, isLoaded } = useCountry();
  const { lastViewedCountrySlug, lastViewedSection, clearContinue } = useContinue();
  const { shouldShowBanner, dismissBanner } = useOnboarding();
  const { isTablet } = useLayout();

  const continueCountry = useMemo(() => {
    const slug = lastViewedCountrySlug || selectedCountrySlug;
    if (!slug) return null;
    return getCountry(slug) ?? null;
  }, [lastViewedCountrySlug, selectedCountrySlug]);

  const grouped = useMemo(() => {
    const all = getCountries();
    const byRegion: Record<string, typeof all> = {};
    for (const c of all) {
      if (!byRegion[c.region]) byRegion[c.region] = [];
      byRegion[c.region].push(c);
    }
    return REGION_ORDER
      .filter((r) => byRegion[r]?.length)
      .map((region) => ({
        region,
        countries: byRegion[region].sort(sortCountriesAlpha),
      }));
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
    router.push({ pathname: "/(tabs)/(home)/country/[slug]", params: { slug } } as any);
  };

  const goContinue = () => {
    const slug = lastViewedCountrySlug || selectedCountrySlug;
    if (!slug) return;
    goCountryHub(slug);
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

        {shouldShowBanner && !user ? (
          <View style={styles.skipBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.skipBannerText}>
                Your results are saved on this device. Create an account to access them anywhere.
              </Text>
            </View>
            <View style={styles.skipBannerActions}>
              <Pressable onPress={() => router.push("/auth?mode=register")} hitSlop={8}>
                <Text style={styles.skipBannerLink}>Create Account</Text>
              </Pressable>
              <Pressable onPress={dismissBanner} hitSlop={8}>
                <Ionicons name="close" size={18} color={tokens.color.subtext} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoaded ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {!hasSelection ? (
              <View style={styles.welcomeSection}>
                <Image
                  source={require("../../../assets/brand/fulllogo_transparent_nobuffer.png")}
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

                <Text style={styles.primaryButtonHint}>Browse the countries below to get started</Text>

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
                  source={require("../../../assets/brand/fulllogo_transparent_nobuffer.png")}
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

                <Pressable onPress={() => { clearContinue(); setSelectedCountrySlug(null); }} hitSlop={10}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.countriesSection}>
              <Text style={styles.sectionTitle}>Choose a destination</Text>
              {grouped.map(({ region, countries }) => (
                <View key={region} style={styles.regionBlock}>
                  <Text style={styles.regionLabel}>{region}</Text>
                  <View style={[styles.listGap, isTablet && styles.listGrid]}>
                    {countries.map((c) => {
                      const isLaunch = isLaunchCountry(c.slug);
                      return isLaunch ? (
                        <Pressable
                          key={c.slug}
                          onPress={() => goCountryHub(c.slug)}
                          style={({ pressed }) => [styles.rowCard, isTablet && styles.rowCardTablet, pressed && styles.rowCardPressed]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{c.name}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={tokens.color.primary} />
                        </Pressable>
                      ) : (
                        <View key={c.slug} style={[styles.rowCardMuted, isTablet && styles.rowCardTablet]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitleMuted}>{c.name}</Text>
                          </View>
                          <Text style={styles.comingSoonTag}>Coming soon</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
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
    fontFamily: tokens.font.body,
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
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    textAlign: "center" as const,
    lineHeight: 34,
  },

  welcomeBody: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
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
    fontFamily: tokens.font.body,
    lineHeight: 20,
  },

  primaryButtonHint: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    fontFamily: tokens.font.bodyMedium,
    textAlign: "center" as const,
  },

  coverageNote: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },

  coverageNoteText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
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
    fontFamily: tokens.font.display,
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
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  },

  continueSub: {
    fontSize: tokens.text.body,
    color: "rgba(255,255,255,0.8)",
    fontFamily: tokens.font.body,
    lineHeight: 18,
    marginTop: 2,
  },

  clearText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
    textAlign: "center" as const,
    marginTop: 2,
  },

  countriesSection: {
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },

  sectionTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodySemiBold,
    color: tokens.color.text,
  },

  regionBlock: {
    gap: tokens.space.sm,
  },

  regionLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },

  listGap: { gap: 6 },

  listGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },

  rowCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.lg,
  },

  rowCardTablet: {
    width: "48.5%" as any,
  },

  rowCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  rowTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },

  rowCardMuted: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.lg,
    opacity: 0.6,
  },

  rowTitleMuted: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
  },

  comingSoonTag: {
    fontSize: 10,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.subtext,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.bg,
    overflow: "hidden" as const,
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
    color: tokens.color.text,
    fontFamily: tokens.font.body,
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
    fontFamily: tokens.font.bodyBold,
  },
  footerDot: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
  },
  footerCopy: {
    fontSize: 11,
    color: tokens.color.subtext,
    fontFamily: tokens.font.body,
  },
  skipBanner: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: tokens.space.xl,
    marginBottom: tokens.space.md,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(28,43,94,0.08)",
  },
  skipBannerText: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  },
  skipBannerActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  skipBannerLink: {
    fontSize: 14,
    fontFamily: tokens.font.bodySemiBold,
    fontWeight: "600" as const,
    color: tokens.color.primary,
  },
} as const;
