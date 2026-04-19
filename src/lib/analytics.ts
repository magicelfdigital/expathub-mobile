import { Platform } from "react-native";
import PostHog from "posthog-react-native";
import { getBackendBase } from "@/src/billing/backendClient";

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
  | "paywall_sticky_cta_tapped";

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
