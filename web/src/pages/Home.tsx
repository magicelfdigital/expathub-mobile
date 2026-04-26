import { useEffect, useRef, useState } from "react";

const APP_NAME = "ExpatHub";
const APP_STORE_URL = "https://apps.apple.com/app/id982107779";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=host.exp.exponent";
const QR_LIB_URL =
  "https://unpkg.com/qr-code-styling@1.6.0/lib/qr-code-styling.js";

type QRCodeStylingOptions = {
  width: number;
  height: number;
  data: string;
  dotsOptions?: { color?: string; type?: string };
  backgroundOptions?: { color?: string };
  cornersSquareOptions?: { type?: string; color?: string };
  cornersDotOptions?: { type?: string; color?: string };
  qrOptions?: { errorCorrectionLevel?: string };
};

interface QRCodeStylingInstance {
  append(parent: HTMLElement): void;
}

type QRCodeStylingConstructor = new (
  options: QRCodeStylingOptions,
) => QRCodeStylingInstance;

declare global {
  interface Window {
    QRCodeStyling?: QRCodeStylingConstructor;
  }
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "other";
}

function loadQrLibrary(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.QRCodeStyling) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${QR_LIB_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("qr load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = QR_LIB_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("qr load failed"));
    document.head.appendChild(script);
  });
}

function AppStoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayStoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
    </svg>
  );
}

export default function Home() {
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [redirecting, setRedirecting] = useState(false);
  const [deepLink, setDeepLink] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.host;
    const link = `exps://${host}`;
    setDeepLink(link);

    const detected = detectPlatform();
    setPlatform(detected);

    let cancelled = false;
    let redirectTimer: number | undefined;

    loadQrLibrary()
      .then(() => {
        if (cancelled) return;
        const container = qrContainerRef.current;
        if (!container || !window.QRCodeStyling) return;
        container.innerHTML = "";
        const size = Math.max(120, container.clientWidth || 180);
        const qr = new window.QRCodeStyling({
          width: size,
          height: size,
          data: link,
          dotsOptions: { color: "#0F2B4D", type: "rounded" },
          backgroundOptions: { color: "#ffffff" },
          cornersSquareOptions: { type: "extra-rounded", color: "#3E81DD" },
          cornersDotOptions: { type: "dot", color: "#3E81DD" },
          qrOptions: { errorCorrectionLevel: "H" },
        });
        qr.append(container);
      })
      .catch(() => {
        // QR library failed to load — silently fall back; deep-link button still works.
      });

    if (detected === "ios" || detected === "android") {
      setRedirecting(true);
      window.location.href = link;
      redirectTimer = window.setTimeout(() => {
        setRedirecting(false);
      }, 500);
    }

    return () => {
      cancelled = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, []);

  const showAppStorePrimary = platform !== "android";
  const showPlayStorePrimary = platform !== "ios";

  return (
    <div
      data-testid="page-home"
      className="mx-auto w-full max-w-3xl px-5 py-12 text-center md:py-16"
    >
      {redirecting ? (
        <div data-testid="home-loading" className="my-16">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-cream border-t-primary" />
          <div className="mt-5 font-sans text-base text-navy/70">
            Opening in Expo Go…
          </div>
        </div>
      ) : (
        <div data-testid="home-content">
          <h1
            data-testid="home-title"
            className="font-serif text-3xl font-semibold text-navy md:text-4xl"
          >
            {APP_NAME}
          </h1>
          <p className="mt-2 mb-10 font-sans text-base text-navy/70 md:mb-14">
            Take this quiz
          </p>

          <div className="flex flex-col gap-5 md:flex-row md:items-stretch md:gap-6">
            {/* Step 1 — Download Expo Go */}
            <div
              data-testid="home-step-download"
              className="flex flex-1 flex-col rounded-2xl border border-navy/10 bg-cream p-6 text-center shadow-sm md:p-8"
            >
              <div className="mb-3 flex items-center justify-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-navy/30 font-sans text-sm font-semibold text-navy/70">
                  1
                </div>
                <h2 className="font-serif text-lg font-semibold text-navy">
                  Download Expo Go
                </h2>
              </div>
              <p className="mb-4 flex-1 font-sans text-sm text-navy/60">
                Expo Go is a free app to test mobile apps
              </p>
              <div className="flex flex-col items-center justify-center gap-2 md:gap-3">
                {showAppStorePrimary ? (
                  <a
                    data-testid="home-app-store-primary"
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-navy/20 bg-white px-5 py-3 font-sans text-sm font-medium text-navy transition hover:border-navy/40 hover:bg-bg"
                  >
                    <AppStoreIcon className="h-4 w-4" />
                    App Store
                  </a>
                ) : null}
                {showPlayStorePrimary ? (
                  <a
                    data-testid="home-play-store-primary"
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-navy/20 bg-white px-5 py-3 font-sans text-sm font-medium text-navy transition hover:border-navy/40 hover:bg-bg"
                  >
                    <PlayStoreIcon className="h-4 w-4" />
                    Google Play
                  </a>
                ) : null}
                {!showAppStorePrimary ? (
                  <a
                    data-testid="home-app-store-secondary"
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center justify-center gap-1.5 py-2 font-sans text-sm text-navy/60 underline underline-offset-2 transition hover:text-navy"
                  >
                    <AppStoreIcon className="h-3.5 w-3.5" />
                    App Store
                  </a>
                ) : null}
                {!showPlayStorePrimary ? (
                  <a
                    data-testid="home-play-store-secondary"
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center justify-center gap-1.5 py-2 font-sans text-sm text-navy/60 underline underline-offset-2 transition hover:text-navy"
                  >
                    <PlayStoreIcon className="h-3.5 w-3.5" />
                    Google Play
                  </a>
                ) : null}
              </div>
            </div>

            {/* Step 2 — Scan QR + open in Expo Go */}
            <div
              data-testid="home-step-qr"
              className="flex flex-1 flex-col rounded-2xl border border-navy bg-navy p-6 text-center text-white shadow-sm md:p-8"
            >
              <div className="mb-3 flex items-center justify-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 font-sans text-sm font-semibold text-white">
                  2
                </div>
                <h2 className="font-serif text-lg font-semibold text-white">
                  Scan QR Code
                </h2>
              </div>
              <p className="mb-4 flex-1 font-sans text-sm text-white/70">
                Use your phone&apos;s camera or Expo Go
              </p>
              <div
                data-testid="home-qr"
                ref={qrContainerRef}
                className="mx-auto mb-4 h-44 w-44 rounded-lg bg-white p-3 md:h-48 md:w-48"
              />
              {deepLink ? (
                <a
                  data-testid="home-open-button"
                  href={deepLink}
                  className="inline-flex items-center justify-center self-center rounded-lg bg-white px-6 py-3 font-sans text-sm font-medium text-navy transition hover:opacity-90"
                >
                  Open in Expo Go
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
