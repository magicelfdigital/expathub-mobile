import { Platform } from "react-native";

export const ENTITLEMENT_DECISION_ACCESS = "decision_access";
export const ENTITLEMENT_FULL_ACCESS = "full_access_subscription";
export const ENTITLEMENT_COUNTRY_PREFIX = "country_";

export const ENTITLEMENT_ID = "full_access_subscription";

export const RC_DECISION_PASS_PRODUCT = "decision_pass_30d";
export const RC_MONTHLY_PRODUCT =
  process.env.EXPO_PUBLIC_RC_MONTHLY_PRODUCT ?? "expathub_pro_monthly:monthly";
export const RC_ANNUAL_PRODUCT =
  process.env.EXPO_PUBLIC_RC_ANNUAL_PRODUCT ?? "yearly";

export const STRIPE_MONTHLY_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? "";
export const STRIPE_DECISION_PASS_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_DECISION_PASS_PRICE_ID ?? "";

export const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? "";
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";

export const SANDBOX_ENABLED: boolean = __DEV__;

export const VALID_PROMO_CODES: string[] = __DEV__ ? ["EXPATHUB-REVIEW-2026", "EXPATHUB-PRESS-2026"] : [];

export const TERMS_URL = "https://www.expathub.website/terms";
export const PRIVACY_URL = "https://www.expathub.website/privacy";

export const DECISION_PASS_DURATION_DAYS = 30;

export const DECISION_PASS_PRICE = "$29";
export const MONTHLY_PRICE = "$14.99";
export const COUNTRY_LIFETIME_PRICE = "$69";

export const LAUNCH_COUNTRIES = [
  "portugal",
  "spain",
  "canada",
  "costa-rica",
  "panama",
  "ecuador",
  "malta",
  "united-kingdom",
] as const;

export type LaunchCountrySlug = (typeof LAUNCH_COUNTRIES)[number];

export const COUNTRY_LIFETIME_PRICES: Record<string, string> = {
  portugal: "$69",
  spain: "$69",
  canada: "$69",
  "costa-rica": "$69",
  panama: "$69",
  ecuador: "$69",
  malta: "$69",
  "united-kingdom": "$69",
};

const COUNTRY_LIFETIME_PRODUCT_IDS: Record<string, string> = {
  portugal: "country_lifetime_portugal",
  spain: "country_lifetime_spain",
  canada: "country_lifetime_canada",
  "costa-rica": "country_costa_rica_unlock",
  panama: "panama_lifetime_unlock",
  ecuador: "country_equadore_lifetime",
  malta: "country_malta_unlock",
  "united-kingdom": "country_lifetime_united_kingdom",
};

export function getCountryLifetimeProductId(slug: string): string {
  return COUNTRY_LIFETIME_PRODUCT_IDS[slug] ?? `${slug.replace(/-/g, "_")}_lifetime_unlock`;
}

export function getCountryEntitlementId(slug: string): string {
  return `${ENTITLEMENT_COUNTRY_PREFIX}${slug.replace(/-/g, "_")}`;
}

export function getProductId(period: "monthly" | "annual"): string {
  if (Platform.OS === "web") {
    return period === "monthly"
      ? STRIPE_MONTHLY_PRICE_ID
      : "";
  }
  return period === "monthly" ? RC_MONTHLY_PRODUCT : RC_ANNUAL_PRODUCT;
}
