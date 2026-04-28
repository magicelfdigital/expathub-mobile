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

function postUnifiedAnalytics(event: string, properties: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  try {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties: { ...properties, surface: "web" } }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
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
