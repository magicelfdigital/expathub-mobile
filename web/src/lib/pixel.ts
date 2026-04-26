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
