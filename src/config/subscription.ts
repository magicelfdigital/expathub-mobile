import { Platform } from "react-native";

export const ENTITLEMENT_FULL_ACCESS = "full_access_subscription";
export const ENTITLEMENT_ID = "full_access_subscription";

export const RC_MONTHLY_PRODUCT =
  process.env.EXPO_PUBLIC_RC_MONTHLY_PRODUCT ??
  (Platform.OS === "ios" ? "monthly_subscription_all_access" : "expathub_pro_monthly:monthly");

export const RC_ANNUAL_PRODUCT =
  process.env.EXPO_PUBLIC_RC_ANNUAL_PRODUCT ??
  (Platform.OS === "ios" ? "ExpatHub_pathfinder" : "expathub_pathfinder:pathfinder");

export const STRIPE_MONTHLY_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? "";
export const STRIPE_ANNUAL_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID ?? "";

export const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? "";
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";

export const SANDBOX_ENABLED: boolean = __DEV__;

export const VALID_PROMO_CODES: string[] = __DEV__ ? ["EXPATHUB-REVIEW-2026", "EXPATHUB-PRESS-2026"] : [];

export const TERMS_URL = "https://www.expathub.website/terms";
export const PRIVACY_URL = "https://www.expathub.website/privacy";

export const TRIAL_DURATION_DAYS = 14;

export const MONTHLY_PRICE = "$14.99";
export const ANNUAL_PRICE = "$89";

export const LAUNCH_COUNTRIES = [
  "portugal",
  "spain",
  "canada",
  "costa-rica",
  "panama",
  "ecuador",
  "malta",
  "united-kingdom",
  "germany",
  "ireland",
  "australia",
] as const;

export type LaunchCountrySlug = (typeof LAUNCH_COUNTRIES)[number];

export type SubscriptionPlan = "monthly" | "annual";

export function getProductId(period: SubscriptionPlan): string {
  if (Platform.OS === "web") {
    return period === "monthly" ? STRIPE_MONTHLY_PRICE_ID : STRIPE_ANNUAL_PRICE_ID;
  }
  return period === "monthly" ? RC_MONTHLY_PRODUCT : RC_ANNUAL_PRODUCT;
}
