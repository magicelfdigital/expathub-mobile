declare const global: typeof globalThis & { __DEV__?: boolean };

(global as any).__DEV__ = false;
process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

describe("trackEvent — listener fan-out and platform tagging", () => {
  let trackEvent: typeof import("../analytics").trackEvent;
  let addAnalyticsListener: typeof import("../analytics").addAnalyticsListener;

  beforeEach(() => {
    jest.resetModules();
    (global as any).__DEV__ = false;
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200 } as Response));
    const RN = require("react-native") as { Platform: { OS: string } };
    RN.Platform.OS = "ios";
    const AS = require("@react-native-async-storage/async-storage").default;
    AS.__reset();
    const mod = require("../analytics");
    trackEvent = mod.trackEvent;
    addAnalyticsListener = mod.addAnalyticsListener;
    mod._resetAnalyticsForTests();
  });

  it("forwards event + props verbatim to every registered listener", () => {
    const a = jest.fn();
    const b = jest.fn();
    addAnalyticsListener(a);
    addAnalyticsListener(b);
    trackEvent("plan_step_completed", { step: "x", country: "portugal", totalCompleted: 3 });
    expect(a).toHaveBeenCalledWith("plan_step_completed", {
      step: "x",
      country: "portugal",
      totalCompleted: 3,
    });
    expect(b).toHaveBeenCalledWith("plan_step_completed", {
      step: "x",
      country: "portugal",
      totalCompleted: 3,
    });
  });

  it("forwards an empty props object when none is supplied", () => {
    const fn = jest.fn();
    addAnalyticsListener(fn);
    trackEvent("plan_completed");
    expect(fn).toHaveBeenCalledWith("plan_completed", {});
  });

  it("isolates listener exceptions so a noisy listener can't break the rest of the chain", () => {
    const ok1 = jest.fn();
    const bad = jest.fn(() => {
      throw new Error("listener crash");
    });
    const ok2 = jest.fn();
    addAnalyticsListener(ok1);
    addAnalyticsListener(bad);
    addAnalyticsListener(ok2);
    expect(() => trackEvent("paywall_viewed", { surface: "modal" })).not.toThrow();
    expect(ok1).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(ok2).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe fn that removes only the matching listener", () => {
    const stay = jest.fn();
    const goes = jest.fn();
    addAnalyticsListener(stay);
    const unsub = addAnalyticsListener(goes);
    unsub();
    trackEvent("quiz_started", {});
    expect(stay).toHaveBeenCalledTimes(1);
    expect(goes).not.toHaveBeenCalled();
  });

  it("DEV mode never POSTs to /api/analytics (avoids polluting dev backend)", () => {
    jest.resetModules();
    (global as any).__DEV__ = true;
    const fetchSpy = jest.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
    (global as any).fetch = fetchSpy;
    const RN = require("react-native") as { Platform: { OS: string } };
    RN.Platform.OS = "ios";
    const AS = require("@react-native-async-storage/async-storage").default;
    AS.__reset();
    const mod = require("../analytics");
    mod._resetAnalyticsForTests();
    mod.trackEvent("paywall_viewed", { surface: "modal" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("trackEvent — production POST shape", () => {
  let trackEvent: typeof import("../analytics").trackEvent;
  let identifyUser: typeof import("../analytics").identifyUser;

  beforeEach(() => {
    jest.resetModules();
    (global as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_BACKEND_URL = "https://prod.example.com";
    const RN = require("react-native") as { Platform: { OS: string } };
    RN.Platform.OS = "android";
    const AS = require("@react-native-async-storage/async-storage").default;
    AS.__reset();
    const mod = require("../analytics");
    trackEvent = mod.trackEvent;
    identifyUser = mod.identifyUser;
    mod._resetAnalyticsForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POSTs the event to /api/analytics with platform, distinct_id, and properties", () => {
    const fetchSpy = jest.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
    (global as any).fetch = fetchSpy;

    trackEvent("paywall_viewed", { surface: "modal" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchSpy.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe("https://prod.example.com/api/analytics");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe("paywall_viewed");
    expect(body.platform).toBe("android");
    expect(typeof body.distinct_id).toBe("string");
    expect(body.distinct_id).not.toBe("");
    expect(body.properties.surface).toBe("modal");
    expect(body.properties.distinct_id).toBe(body.distinct_id);
    expect(typeof body.timestamp).toBe("string");
  });

  it("uses the canonical `user:<id>` distinct_id after identifyUser is called", async () => {
    const fetchSpy = jest.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
    (global as any).fetch = fetchSpy;

    await identifyUser(99);
    trackEvent("subscribe_success", { plan: "annual" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.distinct_id).toBe("user:99");
    expect(body.properties.distinct_id).toBe("user:99");
  });

  it("swallows fetch failures so analytics never crashes the calling render", () => {
    const fetchSpy = jest.fn(() => {
      throw new Error("network down");
    });
    (global as any).fetch = fetchSpy;
    expect(() => trackEvent("paywall_viewed", {})).not.toThrow();
  });
});
