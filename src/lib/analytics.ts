import { Platform } from "react-native";
import { getBackendBase } from "@/src/billing/backendClient";

type AnalyticsEvent =
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
  | "account_deleted";

type EventProperties = Record<string, string | number | boolean | undefined>;

const listeners: Array<(event: AnalyticsEvent, props: EventProperties) => void> = [];

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
