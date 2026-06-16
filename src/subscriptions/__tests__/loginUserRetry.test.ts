/**
 * Unit tests for `loginUser` in src/subscriptions/revenuecat.ts — the
 * silent retry-with-backoff that hardens RevenueCat identify (rc.logIn).
 *
 * Behavior A from the test brief:
 *   A1. rc.logIn rejecting on all attempts → retries up to 3 times,
 *       rc_login_failed fires exactly once (after final exhaustion), and
 *       loginUser never throws (resolves void).
 *   A2. rc_login_retry fires once per non-final failed attempt.
 *   A3. When getAppUserId() reports the user already bound, the retry
 *       short-circuits and stops calling rc.logIn.
 *   A4. On a first-attempt success, no retry/failure events fire and the
 *       setEmail / subscriber-attribute block still runs.
 *
 * `loginUser` calls the in-module `getAppUserId()` directly (not
 * injectable), so the "already bound" path is controlled faithfully by
 * what the mocked Purchases.getCustomerInfo() reports as
 * `originalAppUserId` — exactly what getAppUserId() reads.
 */

const mockTrackEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
}));

// Non-empty API key (not "appl_"-prefixed) so init succeeds and the
// Expo-Go skip guard is bypassed without depending on env secrets.
jest.mock("@/src/config/subscription", () => ({
  RC_API_KEY_IOS: "test_ios_key",
  RC_API_KEY_ANDROID: "test_android_key",
  ENTITLEMENT_ID: "full_access_subscription",
  ENTITLEMENT_FULL_ACCESS: "full_access_subscription",
}));

// Force the non-Expo-Go path deterministically in a node environment.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { appOwnership: "standalone" },
}));

const mockConfigure = jest.fn();
const mockSetLogLevel = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockLogIn = jest.fn();
const mockSetEmail = jest.fn();
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: (...a: any[]) => mockConfigure(...a),
    setLogLevel: (...a: any[]) => mockSetLogLevel(...a),
    getCustomerInfo: (...a: any[]) => mockGetCustomerInfo(...a),
    logIn: (...a: any[]) => mockLogIn(...a),
    setEmail: (...a: any[]) => mockSetEmail(...a),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", VERBOSE: "VERBOSE" },
  PURCHASES_ERROR_CODE: {},
  PACKAGE_TYPE: {},
}));

import { loginUser } from "@/src/subscriptions/revenuecat";

function countEvent(name: string): number {
  return mockTrackEvent.mock.calls.filter((c) => c[0] === name).length;
}

let setTimeoutSpy: jest.SpyInstance;

beforeEach(() => {
  mockTrackEvent.mockReset();
  mockConfigure.mockReset();
  mockSetLogLevel.mockReset();
  mockGetCustomerInfo.mockReset();
  mockLogIn.mockReset();
  mockSetEmail.mockReset();

  // Default: getCustomerInfo reports an anonymous RC id, so the
  // idempotency short-circuit does NOT trigger unless a test opts in.
  mockGetCustomerInfo.mockResolvedValue({
    originalAppUserId: "$RCAnonymousID:anon",
    entitlements: { active: {} },
  });

  // Make the retry backoff instant — loginUser awaits
  // `new Promise(r => setTimeout(r, backoffMs))` between attempts.
  setTimeoutSpy = jest
    .spyOn(global, "setTimeout")
    .mockImplementation(((cb: any) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe("loginUser — RC identify retry/idempotency (Behavior A)", () => {
  it("A1: rc.logIn rejecting on every attempt retries 3x, fires rc_login_failed once, and resolves without throwing", async () => {
    mockLogIn.mockRejectedValue(new Error("network down"));

    await expect(loginUser("user-42")).resolves.toBeUndefined();

    expect(mockLogIn).toHaveBeenCalledTimes(3);
    expect(countEvent("rc_login_failed")).toBe(1);
  });

  it("A2: rc_login_retry fires once per non-final failed attempt (2 retries across 3 attempts)", async () => {
    mockLogIn.mockRejectedValue(new Error("network down"));

    await loginUser("user-42");

    expect(mockLogIn).toHaveBeenCalledTimes(3);
    // attempts 1 and 2 each emit rc_login_retry; the final (3rd) failure
    // does NOT — it emits rc_login_failed instead.
    expect(countEvent("rc_login_retry")).toBe(2);
  });

  it("A3: when getAppUserId reports the user already bound, the retry short-circuits and stops calling rc.logIn", async () => {
    mockLogIn.mockRejectedValue(new Error("transient"));
    // Before the 2nd attempt, the idempotency check sees the user is
    // already bound (id matches appUserId, no $RCAnonymousID prefix).
    mockGetCustomerInfo.mockResolvedValue({
      originalAppUserId: "user-42",
      entitlements: { active: {} },
    });

    await expect(loginUser("user-42")).resolves.toBeUndefined();

    // logIn was attempted once (attempt 1), then the loop short-circuited.
    expect(mockLogIn).toHaveBeenCalledTimes(1);
    // Short-circuit clears lastError, so no failure event is emitted.
    expect(countEvent("rc_login_failed")).toBe(0);
  });

  it("A4: on a first-attempt success, no retry/failure events fire and the setEmail block still runs", async () => {
    mockLogIn.mockResolvedValue({
      customerInfo: {
        originalAppUserId: "user-42",
        entitlements: { active: {} },
      },
    });

    await expect(
      loginUser("user-42", "ada@example.com"),
    ).resolves.toBeUndefined();

    expect(mockLogIn).toHaveBeenCalledTimes(1);
    expect(countEvent("rc_login_retry")).toBe(0);
    expect(countEvent("rc_login_failed")).toBe(0);
    // Subscriber-attribute sync still runs for a non-empty email.
    expect(mockSetEmail).toHaveBeenCalledWith("ada@example.com");
  });
});
