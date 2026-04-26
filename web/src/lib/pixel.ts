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
