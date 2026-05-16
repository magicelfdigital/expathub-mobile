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
  | "Subscribe"
  // Mid-funnel signals for Meta App Promotion optimisation. `Lead` fires when
  // a visitor submits an email (quiz save modal, country waitlist). `AddToCart`
  // fires when they tap a plan on the paywall before confirming purchase.
  // See docs/meta-app-promotion-setup.md.
  | "Lead"
  | "AddToCart";

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
  // planner_step_collapsed properties:
  //   stepId: string         — the generic planner step that was closed
  //   country: string        — country slug the planner was attached to
  //   msOpen: number         — wall-clock ms the step was expanded for
  //   bounced: boolean       — true when msOpen < PLANNER_BOUNCE_THRESHOLD_MS;
  //                            tag (not drop) lets the warehouse exclude
  //                            accidental taps from dwell-time stats while
  //                            still surfacing them in raw event counts.
  | "planner_step_collapsed"
  | "password_reset_opened"
  | "password_reset_submitted"
  | "password_reset_success"
  | "password_reset_error"
  | "result_pill_opened"
  | "result_blocker_card_tapped"
  | "result_blocker_worksheet_tapped"
  | "result_top_match_tapped"
  | "auth_prompt_shown"
  | "auth_prompt_converted"
  | "result_edit_answers_tapped"
  | "quiz_edit_resubmitted";

type EventProperties = Record<string, string | number | boolean | undefined>;

// Open/close cycles for an expanded planner step shorter than this are
// flagged with `bounced: true` on the `planner_step_collapsed` event so
// the analytics warehouse can exclude accidental taps from dwell-time
// stats. 500ms was chosen to be safely below realistic reading time
// while still catching most fat-fingered chevron presses; the event is
// still emitted so the unmount-on-close case (user opened a step and
// immediately navigated away) remains visible as raw signal.
export const PLANNER_BOUNCE_THRESHOLD_MS = 500;

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
    // If `identifyUser` or `identifyByEmail` already promoted us to a
    // canonical id (`user:<id>` or `email:<hash>`), keep that — never demote
    // the live id back to an older anon id stored from a previous session.
    if (
      currentDistinctId &&
      (currentDistinctId.startsWith("user:") ||
        currentDistinctId.startsWith("email:"))
    ) {
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

// Pure-JS SHA-256 so we can derive `email:<sha256>` distinct_ids in React
// Native, where there's no `window.crypto.subtle`. The web equivalent in
// `web/src/lib/pixel.ts` uses `subtle.digest("SHA-256")` — both surfaces
// must produce the same hex for the same trimmed/lower-cased email so a
// single human resolves to one PostHog person across web ↔ mobile when they
// enter their email at the gate before creating an account.
function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  // UTF-8 encode
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      i++;
      const c2 = input.charCodeAt(i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  const w = new Array<number>(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] =
        (bytes[i + t * 4] << 24) |
        (bytes[i + t * 4 + 1] << 16) |
        (bytes[i + t * 4 + 2] << 8) |
        bytes[i + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^
        ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^
        (w[t - 15] >>> 3);
      const s1 =
        ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^
        ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^
        (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      hh = h7;
    for (let t = 0; t < 64; t++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + hh) | 0;
  }
  const toHex = (n: number) =>
    (n >>> 0).toString(16).padStart(8, "0");
  return (
    toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) +
    toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7)
  );
}

/**
 * Identify the current visitor by email at the email gate, before they have
 * an account. Promotes the live mobile distinct_id from `anon:<random>` to
 * `email:<sha256>` so a person who enters their email but bounces without
 * registering still joins to the same PostHog person on their next visit (or
 * later, once `identifyUser` promotes again to `user:<id>`).
 *
 * Mirrors `identifyByEmail` in `web/src/lib/pixel.ts` — same normalization
 * (trim + lower-case) and same `email:<sha256>` shape so a single human who
 * enters the same email on web and mobile lands on the same distinct_id.
 *
 * Idempotent: re-calling with the same email is a no-op. Calling after the
 * user has already been promoted to `user:<id>` is also a no-op — we never
 * demote the live id back to an email-keyed one.
 */
export function identifyByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  // Don't demote a fully-identified user back to an email key.
  if (currentDistinctId && currentDistinctId.startsWith("user:")) return;
  const hashed = sha256Hex(normalized);
  const distinctId = `email:${hashed}`;
  if (currentDistinctId === distinctId) return;
  const previous = currentDistinctId;
  currentDistinctId = distinctId;
  AsyncStorage.setItem(ANON_DISTINCT_ID_STORAGE_KEY, distinctId).catch(() => {});
  // Emit `$identify` so PostHog aliases the previous anon distinct_id to the
  // new email-keyed one. Without this the funnel join is lost on the
  // PostHog side even though our backend `/api/analytics` log will see the
  // new id on subsequent events.
  if (posthogClient) {
    try {
      posthogClient.identify(distinctId, { email_sha256: hashed });
    } catch {}
  }
  // Best-effort backend log of the alias so the server-side join knows the
  // two ids belong to the same person, mirroring web's `sendIdentify`.
  if (!__DEV__ && previous) {
    try {
      const base = getBackendBase();
      if (base) {
        fetch(`${base}/api/analytics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "$identify",
            distinct_id: distinctId,
            properties: {
              $anon_distinct_id: previous,
              email_sha256: hashed,
              distinct_id: distinctId,
            },
            platform: Platform.OS,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } catch {}
  }
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
