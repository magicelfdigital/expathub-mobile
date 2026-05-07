import AsyncStorage from "@react-native-async-storage/async-storage";

declare const global: typeof globalThis & { __DEV__?: boolean };

// Run as DEV so the backend POST is skipped — we only care about the
// listener fan-out and PostHog capture path here.
(global as any).__DEV__ = true;
process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

beforeEach(() => {
  (AsyncStorage as any).__reset();
  jest.resetModules();
  (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200 } as any));
});

async function loadAnalytics() {
  const mod = await import("../analytics");
  mod._resetAnalyticsForTests();
  return mod;
}

describe("analytics — listener API", () => {
  it("invokes registered listeners with the event name and properties", async () => {
    const { trackEvent, addAnalyticsListener } = await loadAnalytics();
    const seen: Array<[string, any]> = [];
    addAnalyticsListener((evt, props) => {
      seen.push([evt, props]);
    });

    trackEvent("plan_focus_started", { country: "portugal" });
    trackEvent("plan_step_completed", { step: "visa_pathway", country: "portugal" });

    expect(seen).toHaveLength(2);
    expect(seen[0][0]).toBe("plan_focus_started");
    expect(seen[0][1]).toMatchObject({ country: "portugal" });
    expect(seen[1][0]).toBe("plan_step_completed");
    expect(seen[1][1]).toMatchObject({ step: "visa_pathway" });
  });

  it("defaults properties to an empty object when none are provided", async () => {
    const { trackEvent, addAnalyticsListener } = await loadAnalytics();
    let captured: any = "untouched";
    addAnalyticsListener((_evt, props) => {
      captured = props;
    });

    trackEvent("app_opened");
    expect(captured).toEqual({});
  });

  it("isolates a listener that throws — other listeners still fire and trackEvent does not throw", async () => {
    const { trackEvent, addAnalyticsListener } = await loadAnalytics();
    const second = jest.fn();
    addAnalyticsListener(() => {
      throw new Error("listener boom");
    });
    addAnalyticsListener(second);

    expect(() => trackEvent("app_opened")).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe function that detaches the listener", async () => {
    const { trackEvent, addAnalyticsListener } = await loadAnalytics();
    const fn = jest.fn();
    const off = addAnalyticsListener(fn);

    trackEvent("app_opened");
    expect(fn).toHaveBeenCalledTimes(1);

    off();

    trackEvent("quiz_started");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not throw on unknown / freshly added event names (string-typed at runtime)", async () => {
    const { trackEvent } = await loadAnalytics();
    expect(() =>
      // Cast to bypass the union — runtime should still tolerate it.
      (trackEvent as any)("unknown_event_xyz", { foo: "bar" }),
    ).not.toThrow();
  });
});

describe("analytics — logFbEvent", () => {
  it("is a no-op when the FB SDK never initialised (e.g. missing env keys)", async () => {
    const { logFbEvent } = await loadAnalytics();
    // No EXPO_PUBLIC_META_APP_ID set, so the SDK module is never loaded.
    delete process.env.EXPO_PUBLIC_META_APP_ID;
    delete process.env.EXPO_PUBLIC_META_CLIENT_TOKEN;
    expect(() => logFbEvent("CompletedQuiz")).not.toThrow();
    expect(() => logFbEvent("StartTrial", 9.99, { plan: "monthly" })).not.toThrow();
  });

  it("initFbSdk short-circuits on web (Platform.OS === 'web') WITHOUT loading the native fbsdk module", async () => {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    const fbsdkLoad = jest.fn(() => {
      throw new Error("react-native-fbsdk-next must NOT load on web");
    });
    jest.doMock("react-native-fbsdk-next", () => fbsdkLoad(), {
      virtual: true,
    });
    process.env.EXPO_PUBLIC_META_APP_ID = "app-id";
    process.env.EXPO_PUBLIC_META_CLIENT_TOKEN = "client-tok";
    const mod = await import("../analytics");
    expect(() => mod.initFbSdk()).not.toThrow();
    expect(() => mod.logFbEvent("CompletedQuiz")).not.toThrow();
    // The native fbsdk module loader must NEVER be invoked on web —
    // the function above is only reachable through the require path
    // which is gated on Platform.OS !== "web".
    expect(fbsdkLoad).not.toHaveBeenCalled();
    jest.dontMock("react-native");
    jest.dontMock("react-native-fbsdk-next");
  });
});

describe("analytics — backend POST is suppressed in DEV", () => {
  it("does not POST to /api/analytics when __DEV__ is true", async () => {
    const { trackEvent } = await loadAnalytics();
    trackEvent("app_opened");
    // The fetch mock from beforeEach is the global one. In DEV we should
    // never hit it from trackEvent.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
