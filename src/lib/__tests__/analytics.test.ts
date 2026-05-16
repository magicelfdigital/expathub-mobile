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

  it("promotes the anon distinct_id to email:<sha256> at the email gate", async () => {
    const { trackEvent, identifyByEmail } = await loadAnalytics();

    trackEvent("app_opened");
    const anonId = fetchCalls[0].body.distinct_id;
    expect(anonId.startsWith("anon:")).toBe(true);

    // Known SHA-256 of "ada@example.com" (lower-case, trimmed).
    const expectedHash =
      "b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72";
    identifyByEmail("  Ada@Example.com  ");

    trackEvent("readiness_lead_saved");
    // The first new fetch call after identify should be the backend `$identify`
    // alias POST so the server-side join knows the two ids are the same person.
    const aliasCall = fetchCalls.find(
      (c) => c.body.event === "$identify",
    );
    expect(aliasCall).toBeDefined();
    expect(aliasCall!.body.distinct_id).toBe(`email:${expectedHash}`);
    expect(aliasCall!.body.properties.$anon_distinct_id).toBe(anonId);

    // And the subsequent event is keyed to the new email distinct_id.
    const leadCall = fetchCalls.find(
      (c) => c.body.event === "readiness_lead_saved",
    );
    expect(leadCall).toBeDefined();
    expect(leadCall!.body.distinct_id).toBe(`email:${expectedHash}`);

    // Storage is updated so a returning session starts already promoted.
    await new Promise((r) => setTimeout(r, 0));
    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted).toBe(`email:${expectedHash}`);
  });

  it("identifyByEmail is idempotent and never demotes user:<id>", async () => {
    const { trackEvent, identifyByEmail, identifyUser } = await loadAnalytics();

    identifyByEmail("user@example.com");
    const afterEmail = fetchCalls.length;
    identifyByEmail("user@example.com");
    // No additional $identify when the email distinct_id is unchanged.
    expect(fetchCalls.length).toBe(afterEmail);

    identifyUser("7");
    trackEvent("app_opened");
    const userEvent = fetchCalls[fetchCalls.length - 1];
    expect(userEvent.body.distinct_id).toBe("user:7");

    // A subsequent identifyByEmail must NOT demote back to email:<hash>.
    identifyByEmail("user@example.com");
    trackEvent("app_opened");
    const after = fetchCalls[fetchCalls.length - 1];
    expect(after.body.distinct_id).toBe("user:7");
  });

  it("never demotes email:<hash> back to an older anon id when hydration finishes after identifyByEmail", async () => {
    (AsyncStorage as any).__seed(STORAGE_KEY, "anon:older-anon-id");
    const { trackEvent, identifyByEmail } = await loadAnalytics();

    // Promote to email before hydration has had a chance to run.
    identifyByEmail("race@example.com");
    // Let hydration resolve.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    trackEvent("readiness_lead_saved");
    const last = fetchCalls[fetchCalls.length - 1];
    expect(last.body.distinct_id.startsWith("email:")).toBe(true);
    // And persisted storage was upgraded, not left on the old anon id.
    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted!.startsWith("email:")).toBe(true);
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
