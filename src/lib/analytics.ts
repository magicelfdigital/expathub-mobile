import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
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
  // react-native-fbsdk-next requires a native module that isn't included in
  // Expo Go. Even when wrapped in try/catch, requiring it triggers an
  // Invariant Violation redbox in dev. Skip init in Expo Go — the SDK only
  // needs to run in production native builds anyway.
  if (Constants.appOwnership === "expo") {
    if (__DEV__) console.log("[Analytics] Meta SDK skipped in Expo Go");
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
  | "planner_completed"
  | "planner_step_expanded"
  | "planner_step_collapsed"
  | "password_reset_opened"
  | "password_reset_submitted"
  | "password_reset_success"
  | "password_reset_error"
  | "result_pill_opened"
  | "result_blocker_card_tapped"
  | "result_blocker_worksheet_tapped";

type EventProperties = Record<string, string | number | boolean | undefined>;

const listeners: Array<(event: AnalyticsEvent, props: EventProperties) => void> = [];

let posthogClient: PostHog | null = null;
let posthogInitialized = false;

export function initAnalytics() {
  if (posthogInitialized) return;
  posthogInitialized = true;

  // Kick off anon distinct_id hydration as early as possible so the very
  // first `trackEvent` POST after launch already carries a stable id.
  hydrateAnonDistinctId();

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

// Canonical PostHog distinct_id shape for a logged-in user. Must match the
// web implementation in `web/src/lib/pixel.ts` (`identifyWebUser`) so a single
// human who uses both surfaces resolves to one PostHog person, which is what
// makes cross-surface funnels (quiz-on-web → purchase-on-mobile) work.
function userDistinctId(userId: string | number): string {
  return `user:${String(userId)}`;
}

let lastIdentifiedDistinctId: string | null = null;

// Stable distinct_id attached to every backend `/api/analytics` POST so the
// server-side log can join mobile events to the same person PostHog sees.
// Mirrors the web `getDistinctId` shape from `web/src/lib/pixel.ts`:
//   - `user:<id>` once the user is identified
//   - an `anon:<random>` device id beforehand, persisted in AsyncStorage so
//     it survives app restarts (so a pre-login funnel can later be aliased
//     to the user id without losing the steps that came before).
const ANON_DISTINCT_ID_STORAGE_KEY = "mobile_anon_distinct_id";

let currentDistinctId: string | null = null;
let anonDistinctIdHydration: Promise<string> | null = null;

function generateAnonDistinctId(): string {
  // Avoid `crypto.randomUUID` / the `uuid` package — both have RN pitfalls
  // (see the React Native Pitfalls section in the expo skill). 16+ chars of
  // url-safe randomness is more than enough collision resistance for a
  // per-device id.
  return (
    "anon:" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

function hydrateAnonDistinctId(): Promise<string> {
  if (anonDistinctIdHydration) return anonDistinctIdHydration;
  anonDistinctIdHydration = (async () => {
    let stored: string | null = null;
    try {
      stored = await AsyncStorage.getItem(ANON_DISTINCT_ID_STORAGE_KEY);
    } catch {}
    // If `identifyUser` already promoted us to `user:<id>` (or persisted one
    // from a previous session is `user:<id>`), keep that — never demote the
    // live id back to an older anon id.
    if (currentDistinctId && currentDistinctId.startsWith("user:")) {
      try {
        await AsyncStorage.setItem(
          ANON_DISTINCT_ID_STORAGE_KEY,
          currentDistinctId,
        );
      } catch {}
      return currentDistinctId;
    }
    if (stored) {
      currentDistinctId = stored;
      return stored;
    }
    const fresh = currentDistinctId ?? generateAnonDistinctId();
    currentDistinctId = fresh;
    try {
      await AsyncStorage.setItem(ANON_DISTINCT_ID_STORAGE_KEY, fresh);
    } catch {}
    return fresh;
  })();
  return anonDistinctIdHydration;
}

export function getMobileDistinctId(): string {
  // Always return a non-null id so every backend `/api/analytics` POST is
  // joinable — even early-launch events fired before AsyncStorage hydration
  // resolves. If hydration later finds a previously persisted id, it will
  // adopt it (see `hydrateAnonDistinctId`); the brief sync-fallback window
  // means the very first events of a returning user's session may use a
  // throwaway id rather than `null`, which is strictly better for joining
  // events fired in that window to each other.
  if (!currentDistinctId) {
    currentDistinctId = generateAnonDistinctId();
  }
  if (!anonDistinctIdHydration) {
    hydrateAnonDistinctId();
  }
  return currentDistinctId;
}

// Test-only: reset module state between cases. Not exported via index — only
// the analytics test imports it directly.
export function _resetAnalyticsForTests() {
  currentDistinctId = null;
  anonDistinctIdHydration = null;
  lastIdentifiedDistinctId = null;
  posthogClient = null;
  posthogInitialized = false;
}

export function identifyUser(userId: string | number, traits?: Record<string, any>) {
  const id = String(userId);
  if (!id) return;
  const distinctId = userDistinctId(id);
  // Always promote the canonical `user:<id>` to the live mobile distinct_id
  // and persist it so every subsequent backend `/api/analytics` POST is
  // joined to this user — including events fired before PostHog initializes
  // (e.g. when the API key is missing in dev/test).
  currentDistinctId = distinctId;
  AsyncStorage.setItem(ANON_DISTINCT_ID_STORAGE_KEY, distinctId).catch(() => {});
  // Idempotent: PostHog will dedupe internally too, but skipping here also
  // avoids re-emitting `$identify` events on every app open.
  if (lastIdentifiedDistinctId === distinctId) return;
  // If PostHog hasn't initialized yet (e.g. identify called before
  // `initAnalytics`, or the API key was missing so init was a no-op), don't
  // mark the user as identified — otherwise a later call once the client
  // exists would be silently skipped by the idempotency guard above.
  if (!posthogClient) return;
  try {
    posthogClient.identify(distinctId, traits);
    lastIdentifiedDistinctId = distinctId;
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
        // Attach the same canonical distinct_id PostHog uses so the
        // backend `/api/analytics` log can join mobile events to the same
        // person — `user:<id>` once identified, the persisted anon device
        // id beforehand. Mirrors `postUnifiedAnalytics` in
        // `web/src/lib/pixel.ts`: top-level for ingestion convention,
        // duplicated inside `properties` for backends that only inspect
        // the properties bag. `getMobileDistinctId()` is guaranteed to
        // return a non-null id (synthesizing a sync fallback if hydration
        // hasn't finished), so we never POST an anonymous event.
        const distinctId = getMobileDistinctId();
        fetch(`${base}/api/analytics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            distinct_id: distinctId,
            properties: { ...properties, distinct_id: distinctId },
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
