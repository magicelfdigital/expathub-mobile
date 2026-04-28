import ReactPixel from "react-facebook-pixel";

type PixelEventParams = Record<string, string | number | boolean>;

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID ?? "").trim();

let pixelInitialized = false;

export function initPixel(): void {
  if (pixelInitialized) return;
  if (typeof window === "undefined") return;
  if (!PIXEL_ID) {
    if (import.meta.env.DEV) {
      console.log("[Pixel] VITE_META_PIXEL_ID not set; Meta Pixel disabled");
    }
    pixelInitialized = true;
    return;
  }
  try {
    ReactPixel.init(PIXEL_ID, undefined, {
      autoConfig: true,
      debug: import.meta.env.DEV,
    });
    pixelInitialized = true;
    if (import.meta.env.DEV) console.log(`[Pixel] Initialized with id ${PIXEL_ID}`);
  } catch (e) {
    pixelInitialized = true;
    if (import.meta.env.DEV) console.log("[Pixel] Init error", e);
  }
}

function safeTrack(eventName: string, params?: PixelEventParams) {
  if (!pixelInitialized) initPixel();
  if (!PIXEL_ID) return;
  try {
    if (params) {
      ReactPixel.track(eventName, params);
    } else {
      ReactPixel.track(eventName);
    }
  } catch (e) {
    if (import.meta.env.DEV) console.log(`[Pixel] track error for ${eventName}`, e);
  }
}

export function trackPageView(): void {
  if (!pixelInitialized) initPixel();
  if (!PIXEL_ID) return;
  try {
    ReactPixel.pageView();
  } catch (e) {
    if (import.meta.env.DEV) console.log("[Pixel] pageView error", e);
  }
}

export function trackInitiateCheckout(params?: PixelEventParams): void {
  safeTrack("InitiateCheckout", params);
}

export function trackLead(params?: PixelEventParams): void {
  safeTrack("Lead", params);
}

type PurchaseParams = {
  value?: number;
  currency?: string;
} & PixelEventParams;

export function trackStartTrial(params: PurchaseParams = {}): void {
  const { value = 0, currency = "USD", ...rest } = params;
  safeTrack("StartTrial", { value, currency, ...rest });
}

export function trackSubscribe(params: PurchaseParams = {}): void {
  const { value = 0, currency = "USD", ...rest } = params;
  safeTrack("Subscribe", { value, currency, ...rest });
}

// ── Identity persistence ──────────────────────────────────────────────────
// We tie pre-account quiz events to the post-account user by sending a stable
// `distinct_id` with every event. The id starts as an anonymous random string
// (so the visitor can be tracked across page loads before they share an
// email), is upgraded to a hash of the email at the email gate, and is then
// reconciled to the real user id once the account exists. PostHog's standard
// alias-on-identify behavior joins the three together as long as we send the
// previous id as `$anon_distinct_id` on the `$identify` event.

const ANON_ID_KEY = "eh_anon_distinct_id";
const DISTINCT_ID_KEY = "eh_distinct_id";
const IDENTIFIED_USER_KEY = "eh_identified_user_id";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function generateAnonId(): string {
  // Avoids `crypto.randomUUID` so we still work in browsers without it
  // (older Safari, http-served previews). 22 chars of url-safe randomness.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

function getOrCreateAnonId(): string {
  const ls = safeLocalStorage();
  if (!ls) return generateAnonId();
  const existing = ls.getItem(ANON_ID_KEY);
  if (existing) return existing;
  const fresh = generateAnonId();
  try {
    ls.setItem(ANON_ID_KEY, fresh);
  } catch {}
  return fresh;
}

export function getDistinctId(): string {
  const ls = safeLocalStorage();
  if (!ls) return getOrCreateAnonId();
  return ls.getItem(DISTINCT_ID_KEY) ?? getOrCreateAnonId();
}

function setDistinctId(id: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(DISTINCT_ID_KEY, id);
  } catch {}
}

async function sha256Hex(input: string): Promise<string> {
  const subtle =
    typeof window !== "undefined" && window.crypto
      ? window.crypto.subtle
      : undefined;
  if (!subtle) {
    // No web crypto (very old browser / non-secure context). Fall back to a
    // deterministic non-crypto hash so the funnel still joins, even though
    // it's weaker. Still keyed off email so the same visitor maps to the
    // same id across visits.
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    }
    return `e_${(h >>> 0).toString(16)}_${input.length}`;
  }
  const data = new TextEncoder().encode(input);
  const buf = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function postUnifiedAnalytics(event: string, properties: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  try {
    const distinctId = getDistinctId();
    const body = {
      event,
      // PostHog ingestion convention: `distinct_id` at the top level.
      // We also forward it inside `properties` so analytics backends that
      // only look at properties still see the same id.
      distinct_id: distinctId,
      properties: {
        ...properties,
        surface: "web",
        distinct_id: distinctId,
      },
    };
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Send PostHog's `$identify` so the new distinct_id is aliased to the
// previous one. Once identified, all subsequent unified-analytics events
// automatically carry the new id (because `getDistinctId()` reads from
// storage), so no caller needs to thread the id through.
function sendIdentify(
  newDistinctId: string,
  previousDistinctId: string,
  traits: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === "undefined") return;
  setDistinctId(newDistinctId);
  try {
    const body = {
      event: "$identify",
      distinct_id: newDistinctId,
      properties: {
        ...traits,
        $anon_distinct_id: previousDistinctId,
        surface: "web",
        distinct_id: newDistinctId,
      },
    };
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/**
 * Identify the current visitor by email at the email gate. We use a SHA-256
 * hash of the lower-cased trimmed email as the distinct_id so the raw email
 * never leaves the device through this code path (the `/api/readiness-lead`
 * call sends the email separately for the welcome email sequence).
 */
export async function identifyByEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const ls = safeLocalStorage();
  const previous = getDistinctId();
  const hashed = await sha256Hex(normalized);
  const newDistinctId = `email:${hashed}`;
  if (previous === newDistinctId) return;
  sendIdentify(newDistinctId, previous, { email_sha256: hashed });
  if (ls) {
    try {
      ls.setItem("eh_identified_email_hash", hashed);
    } catch {}
  }
}

/**
 * Reconcile the current (anonymous or email-keyed) distinct_id to the real
 * user id once the account exists. Idempotent — a second call with the same
 * `userId` is a no-op so it can safely be invoked on every page load by
 * `useUser`.
 *
 * Idempotency is gated on BOTH the "we already identified this user id" flag
 * AND the live distinct_id — if local storage was partially cleared (e.g.
 * the distinct_id key was wiped but the identified-user key wasn't, or vice
 * versa), we still re-emit the identify so the join doesn't silently drop.
 */
export function identifyWebUser(
  userId: string | number,
  traits: Record<string, string | number | boolean> = {},
): void {
  const id = String(userId);
  if (!id) return;
  const newDistinctId = `user:${id}`;
  const previous = getDistinctId();
  const ls = safeLocalStorage();
  const alreadyIdentified = ls?.getItem(IDENTIFIED_USER_KEY);
  if (alreadyIdentified === newDistinctId && previous === newDistinctId) {
    return;
  }
  sendIdentify(newDistinctId, previous, traits);
  if (ls) {
    try {
      ls.setItem(IDENTIFIED_USER_KEY, newDistinctId);
    } catch {}
  }
}

export function trackLockedSectionViewed(
  params: { section: string; country?: string } & Record<string, string | number>,
): void {
  // Required Pixel signal for Meta optimization.
  safeTrack("ViewContent", {
    content_type: "locked_section",
    ...params,
  });
  // Required unified analytics event so PostHog/funnel sees the same name as mobile.
  safeTrack("paywall_locked_section_viewed", { ...params });
  postUnifiedAnalytics("paywall_locked_section_viewed", { ...params });
}

type ExitOfferParams = { subscriptionId?: string } & PixelEventParams;

export function trackExitOfferShown(params: ExitOfferParams = {}): void {
  // Pixel: high-intent signal Meta can optimize against.
  safeTrack("Lead", { source: "exit_offer", ...params });
  // Canonical analytics event so the funnel matches the mobile app.
  postUnifiedAnalytics("exit_offer_shown", { ...params });
}

export function trackExitOfferAccepted(params: ExitOfferParams = {}): void {
  safeTrack("CompleteRegistration", {
    status: "exit_offer_accepted",
    value: 0,
    currency: "USD",
    ...params,
  });
  postUnifiedAnalytics("exit_offer_accepted", { ...params });
}

export function trackExitOfferDeclined(params: ExitOfferParams = {}): void {
  safeTrack("Lead", {
    status: "exit_offer_declined",
    ...params,
  });
  postUnifiedAnalytics("exit_offer_declined", { ...params });
}

// ── Quiz funnel events ────────────────────────────────────────────────────
// Mirror the mobile event names + payload shapes from src/lib/analytics.ts
// (see app/onboarding/quiz.tsx and app/onboarding/result.tsx) so the existing
// PostHog / backend dashboards work for the web /start funnel without
// per-surface special-casing.

type QuizEventParams = Record<string, string | number | boolean>;

export function trackQuizStarted(params: QuizEventParams = {}): void {
  safeTrack("quiz_started", params);
  postUnifiedAnalytics("quiz_started", params);
}

export function trackQuizQuestionAnswered(params: {
  questionId: number;
  questionIndex: number;
  category: string;
  answer: string;
}): void {
  safeTrack("quiz_question_answered", params);
  postUnifiedAnalytics("quiz_question_answered", params);
}

export function trackQuizCompleted(params: QuizEventParams): void {
  safeTrack("quiz_completed", params);
  postUnifiedAnalytics("quiz_completed", params);
}

export function trackQuizAbandoned(params: {
  lastQuestionIndex: number;
  answered: number;
  totalQuestions: number;
}): void {
  safeTrack("quiz_abandoned", params);
  postUnifiedAnalytics("quiz_abandoned", params);
}

export function trackResultScreenViewed(params: {
  matchScore: number;
  tier: string;
}): void {
  safeTrack("result_screen_viewed", params);
  postUnifiedAnalytics("result_screen_viewed", params);
}

// Mirrors mobile's `logFbEvent("CompletedQuiz", undefined, { top_country, tier })`.
// Fires the Meta Pixel "CompletedQuiz" custom event so the same Meta dashboards
// the mobile app uses pick up web completions too. Intentionally Meta-only —
// mobile's `logFbEvent` does NOT also call PostHog/unified analytics, and the
// per-funnel-step coverage in unified analytics is already provided by
// `result_screen_viewed`. Sending it to unified analytics would create a
// duplicate event series with a non-snake_case name.
export function trackCompletedQuiz(params: {
  top_country: string;
  tier: string;
}): void {
  safeTrack("CompletedQuiz", params);
}
