import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COUNTRIES } from "@/data/countries";
import { usePlan } from "@/src/contexts/PlanContext";
import { trackEvent } from "@/src/lib/analytics";
import { COUNTRY_LIFETIME_PRICES } from "@/src/config/subscription";
import { tokens } from "@/theme/tokens";

export default function LifetimeOfferBanner() {
  const { activeCountrySlug, completedSteps } = usePlan();
  const router = useRouter();
  const hasTrackedShown = useRef(false);

  const country = COUNTRIES.find((c) => c.slug === activeCountrySlug);
  const countryName = country?.name ?? "this country";
  const price = activeCountrySlug
    ? COUNTRY_LIFETIME_PRICES[activeCountrySlug] ?? "$69"
    : "$69";

  const shouldShow = completedSteps.length >= 2;

  useEffect(() => {
    if (shouldShow && !hasTrackedShown.current) {
      hasTrackedShown.current = true;
      trackEvent("lifetime_offer_shown", { country: activeCountrySlug ?? "" });
    }
  }, [shouldShow, activeCountrySlug]);

  if (!shouldShow) return null;

  const handlePress = () => {
    trackEvent("lifetime_offer_clicked", { country: activeCountrySlug ?? "" });
    router.push({
      pathname: "/subscribe",
      params: { country: activeCountrySlug ?? "" },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="diamond-outline" size={18} color={tokens.color.primary} />
        </View>
        <Text style={styles.title}>Looks like {countryName} is your focus</Text>
      </View>

      <Text style={styles.body}>
        If you plan to concentrate here long term, you can convert to lifetime
        access and receive credit for your most recent subscription month.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.8}
        testID="lifetime-offer-button"
      >
        <Text style={styles.buttonText}>
          Convert to {countryName} Lifetime
        </Text>
        <Ionicons name="arrow-forward" size={16} color={tokens.color.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.primarySoft,
    borderWidth: 1,
    borderColor: tokens.color.primaryBorder,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  iconRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.color.white,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    flex: 1,
  },
  body: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.regular,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  button: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: tokens.space.xs,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    marginTop: tokens.space.xs,
  },
  buttonText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.white,
  },
});
