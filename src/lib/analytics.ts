import { Platform } from "react-native";
import PostHog from "posthog-react-native";
import { getBackendBase } from "@/src/billing/backendClient";

type FbSdkModule = {
  Settings: {
    setAppID: (id: string) => void;
    setClientToken: (token: string) => void;
    setAdvertiserIDCollectionEnabled: (enabled: boolean) => void;
    setAdvertiserTrackingEnabled?: (enabled: boolean) => Promise<void> | void;
    setAutoLogAppEventsEnabled: (enabled: boolean) => void;
    initializeSDK: () => void;
  };
  AppEventsLogger: {
    logEvent: (name: string, valueOrParams?: number | Record<string, string | number>, params?: Record<string, string | number>) => void;
    logPurchase: (amount: number, currency: string, params?: Record<string, string | number>) => void;
  };
};

let fbSdk: FbSdkModule | null = null;
let fbInitialized = false;

export function initFbSdk() {
  if (fbInitialized) return;
  if (Platform.OS === "web") {
    fbInitialized = true;
    return;
  }
  const appId = process.env.EXPO_PUBLIC_META_APP_ID;
  const clientToken = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN;
  if (!appId || !clientToken) {
    if (__DEV__) {
      console.log("[Analytics] Meta SDK keys missing (EXPO_PUBLIC_META_APP_ID / EXPO_PUBLIC_META_CLIENT_TOKEN); skipping init");
    }
    fbInitialized = true;
    return;
  }
  try {
    const mod = require("react-native-fbsdk-next") as FbSdkModule;
    mod.Settings.setAppID(appId);
    mod.Settings.setClientToken(clientToken);
    mod.Settings.setAdvertiserIDCollectionEnabled(false);
    mod.Settings.setAutoLogAppEventsEnabled(true);
    mod.Settings.initializeSDK();
    fbSdk = mod;
    fbInitialized = true;
    if (__DEV__) console.log("[Analytics] Meta SDK initialized");
  } catch (e) {
    fbInitialized = true;
    if (__DEV__) console.log("[Analytics] Meta SDK init error", e);
  }
}

export type FbStandardEvent =
  | "CompletedQuiz"
  | "ViewedPaywall"
  | "StartTrial"
  | "Subscribe";

export function logFbEvent(
  eventName: FbStandardEvent,
  value?: number,
  params?: Record<string, string | number>,
) {
  if (!fbInitialized) initFbSdk();
  if (!fbSdk) {
    if (__DEV__) console.log(`[Analytics] FB no-op: ${eventName}`, value, params);
    return;
  }
  try {
    if (typeof value === "number") {
      fbSdk.AppEventsLogger.logEvent(eventName, value, { fb_currency: "USD", ...(params ?? {}) });
    } else {
      fbSdk.AppEventsLogger.logEvent(eventName, params);
    }
  } catch (e) {
    if (__DEV__) console.log(`[Analytics] FB log error for ${eventName}`, e);
  }
}

type AnalyticsEvent =
  | "app_opened"
  | "onboarding_started"
  | "quiz_started"
  | "quiz_completed"
  | "result_screen_viewed"
  | "trial_tapped"
  | "trial_started"
  | "subscribe_screen_viewed"
  | "subscribe_tapped"
  | "subscribe_success"
  | "subscribe_cancelled"
  | "subscribe_error"
  | "restore_tapped"
  | "restore_success"
  | "restore_not_found"
  | "restore_error"
  | "manage_subscription_tapped"
  | "paywall_shown"
  | "paywall_unlock_tapped"
  | "entitlement_refresh"
  | "entitlement_refresh_error"
  | "explore_opened"
  | "compare_started"
  | "compare_row_viewed"
  | "decision_brief_opened"
  | "brief_section_viewed"
  | "paywall_viewed"
  | "paywall_dismissed"
  | "paywall_value_context"
  | "subscription_started"
  | "purchase_tapped"
  | "purchase_success"
  | "purchase_cancelled"
  | "purchase_error"
  | "purchase_timeout"
  | "restore_timeout"
  | "promo_code_redeemed"
  | "promo_code_cleared"
  | "product_selected"
  | "account_created"
  | "account_deleted"
  | "eligibility_snapshot_run"
  | "plan_focus_started"
  | "plan_step_completed"
  | "plan_completed"
  | "lifetime_offer_shown"
  | "lifetime_offer_clicked"
  | "waitlist_joined"
  | "readiness_lead_saved"
  | "country_interest_submitted"
  | "quiz_question_answered"
  | "quiz_abandoned"
  | "blocker_guide_tapped"
  | "blocker_guide_viewed"
  | "blocker_guide_notify_signup"
  | "bookmark_limit_hit"
  | "compare_row_tapped"
  | "paywall_tab_viewed"
  | "quiz_save_shown"
  | "quiz_save_submitted"
  | "quiz_save_dismissed"
  | "paywall_sticky_cta_tapped"
  | "paywall_locked_section_viewed"
  | "personalized_paywall_viewed"
  | "reverse_trial_granted"
  | "reverse_trial_expired"
  | "reverse_trial_active_unlock"
  | "exit_offer_shown"
  | "exit_offer_accepted"
  | "exit_offer_declined"
  | "planner_step_completed"
  | "planner_completed";

type EventProperties = Record<string, string | number | boolean | undefined>;

const listeners: Array<(event: AnalyticsEvent, props: EventProperties) => void> = [];

let posthogClient: PostHog | null = null;
let posthogInitialized = false;

export function initAnalytics() {
  if (posthogInitialized) return;
  posthogInitialized = true;

  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    if (__DEV__) {
      console.log("[Analytics] PostHog API key not set (EXPO_PUBLIC_POSTHOG_KEY); skipping init");
    }
    return;
  }

  try {
    posthogClient = new PostHog(apiKey, {
      host: "https://us.i.posthog.com",
    });
  } catch (e) {
    if (__DEV__) console.log("[Analytics] PostHog init error", e);
  }
}

export function identifyUser(userId: string, traits?: Record<string, any>) {
  try {
    posthogClient?.identify(userId, traits);
  } catch {}
}

export function shutdownAnalytics() {
  try {
    posthogClient?.shutdown();
  } catch {}
}

export function trackEvent(
  event: AnalyticsEvent,
  properties: EventProperties = {},
) {
  if (__DEV__) {
    console.log(`[Analytics] ${event}`, properties);
  }

  for (const listener of listeners) {
    try {
      listener(event, properties);
    } catch {}
  }

  try {
    posthogClient?.capture(event, { ...properties, platform: Platform.OS });
  } catch {}

  if (!__DEV__) {
    try {
      const base = getBackendBase();
      if (base) {
        fetch(`${base}/api/analytics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            properties,
            platform: Platform.OS,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } catch {}
  }
}

export function addAnalyticsListener(
  fn: (event: AnalyticsEvent, props: EventProperties) => void,
) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
