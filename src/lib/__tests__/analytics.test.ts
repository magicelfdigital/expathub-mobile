import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "mobile_anon_distinct_id";

declare const global: typeof globalThis & { __DEV__?: boolean };

(global as any).__DEV__ = false;
// `getBackendBase()` (called from `trackEvent`) requires this to be set on
// non-web platforms — otherwise it throws and the outer try/catch in
// `trackEvent` would silently swallow the POST.
process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.example.com";

type FetchCall = { url: string; body: any };

let fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls = [];
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    fetchCalls.push({ url, body: JSON.parse(init.body) });
    return { status: 200, ok: true } as any;
  });
  (AsyncStorage as any).__reset();
  jest.resetModules();
});

async function loadAnalytics() {
  const mod = await import("../analytics");
  mod._resetAnalyticsForTests();
  return mod;
}

describe("mobile analytics distinct_id", () => {
  it("attaches a non-null distinct_id to the very first event after a cold start", async () => {
    const { trackEvent } = await loadAnalytics();

    trackEvent("app_opened");

    expect(fetchCalls).toHaveLength(1);
    const { url, body } = fetchCalls[0];
    expect(url).toMatch(/\/api\/analytics$/);
    expect(typeof body.distinct_id).toBe("string");
    expect(body.distinct_id.length).toBeGreaterThan(0);
    expect(body.distinct_id.startsWith("anon:")).toBe(true);
    expect(body.properties.distinct_id).toBe(body.distinct_id);
    expect(body.event).toBe("app_opened");
  });

  it("reuses the same anon distinct_id across events within a session", async () => {
    const { trackEvent } = await loadAnalytics();

    trackEvent("app_opened");
    trackEvent("quiz_started");

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].body.distinct_id).toBe(fetchCalls[1].body.distinct_id);
  });

  it("adopts the previously persisted anon id once AsyncStorage hydration completes", async () => {
    (AsyncStorage as any).__seed(STORAGE_KEY, "anon:persisted-from-last-session");
    const { trackEvent, initAnalytics } = await loadAnalytics();

    // `initAnalytics` is what the app entry calls on cold start — it kicks
    // off hydration before any `trackEvent` fires. Awaiting one macrotask
    // here lets the AsyncStorage read + write microtasks drain so the
    // persisted id is the live id by the time we assert.
    initAnalytics();
    await new Promise((r) => setTimeout(r, 0));

    trackEvent("app_opened");
    expect(fetchCalls[0].body.distinct_id).toBe("anon:persisted-from-last-session");
  });

  it("persists a freshly generated anon id so future sessions inherit it", async () => {
    const { trackEvent, getMobileDistinctId } = await loadAnalytics();
    const liveId = getMobileDistinctId();

    trackEvent("app_opened");

    // Wait for hydration's persistence write to complete.
    await new Promise((r) => setTimeout(r, 0));

    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted).toBe(liveId);
    expect(persisted!.startsWith("anon:")).toBe(true);
  });

  it("switches to the canonical user:<id> distinct_id once identifyUser is called", async () => {
    const { trackEvent, identifyUser } = await loadAnalytics();

    trackEvent("app_opened");
    const anonId = fetchCalls[0].body.distinct_id;
    expect(anonId.startsWith("anon:")).toBe(true);

    identifyUser("42");

    trackEvent("subscribe_success");
    expect(fetchCalls[1].body.distinct_id).toBe("user:42");
    expect(fetchCalls[1].body.properties.distinct_id).toBe("user:42");

    // And the persisted id is upgraded too, so the next session starts as
    // the identified user without needing a fresh identify call.
    await new Promise((r) => setTimeout(r, 0));
    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted).toBe("user:42");
  });

  it("never demotes user:<id> back to an older anon id when hydration finishes after identify", async () => {
    (AsyncStorage as any).__seed(STORAGE_KEY, "anon:older-anon-id");
    const { trackEvent, identifyUser } = await loadAnalytics();

    // Identify before hydration has had a chance to run.
    identifyUser("99");
    // Now let hydration resolve.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    trackEvent("subscribe_success");
    expect(fetchCalls[0].body.distinct_id).toBe("user:99");
  });
});
