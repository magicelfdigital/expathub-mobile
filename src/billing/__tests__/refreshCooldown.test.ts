import {
  shouldRefresh,
  recordRefresh,
  clearCooldown,
  _getLastRefreshTime,
} from "../refreshCooldown";

const TEN_MINUTES = 10 * 60 * 1000;

afterEach(() => {
  clearCooldown();
});

describe("refreshCooldown", () => {
  it("allows first refresh for a new user", () => {
    expect(shouldRefresh("user_1")).toBe(true);
  });

  it("blocks refresh within cooldown window after recording", () => {
    const now = 1000000;
    recordRefresh("user_1", now);

    expect(shouldRefresh("user_1", TEN_MINUTES, now + 1000)).toBe(false);
    expect(shouldRefresh("user_1", TEN_MINUTES, now + 5 * 60 * 1000)).toBe(false);
    expect(shouldRefresh("user_1", TEN_MINUTES, now + TEN_MINUTES - 1)).toBe(false);
  });

  it("allows refresh after cooldown expires", () => {
    const now = 1000000;
    recordRefresh("user_1", now);

    expect(shouldRefresh("user_1", TEN_MINUTES, now + TEN_MINUTES)).toBe(true);
    expect(shouldRefresh("user_1", TEN_MINUTES, now + TEN_MINUTES + 1)).toBe(true);
  });

  it("tracks different users independently", () => {
    const now = 1000000;
    recordRefresh("user_1", now);

    expect(shouldRefresh("user_1", TEN_MINUTES, now + 1000)).toBe(false);
    expect(shouldRefresh("user_2", TEN_MINUTES, now + 1000)).toBe(true);
  });

  it("clearCooldown(userId) resets specific user", () => {
    const now = 1000000;
    recordRefresh("user_1", now);
    recordRefresh("user_2", now);

    clearCooldown("user_1");

    expect(shouldRefresh("user_1")).toBe(true);
    expect(shouldRefresh("user_2", TEN_MINUTES, now + 1000)).toBe(false);
  });

  it("clearCooldown() resets all users", () => {
    const now = 1000000;
    recordRefresh("user_1", now);
    recordRefresh("user_2", now);

    clearCooldown();

    expect(shouldRefresh("user_1")).toBe(true);
    expect(shouldRefresh("user_2")).toBe(true);
  });

  it("recordRefresh updates the timestamp", () => {
    const t1 = 1000000;
    const t2 = 2000000;
    recordRefresh("user_1", t1);
    expect(_getLastRefreshTime("user_1")).toBe(t1);

    recordRefresh("user_1", t2);
    expect(_getLastRefreshTime("user_1")).toBe(t2);
  });

  describe("login/session restore scenarios", () => {
    it("login triggers refresh once", () => {
      expect(shouldRefresh("user_1")).toBe(true);
      recordRefresh("user_1");

      expect(shouldRefresh("user_1")).toBe(false);
    });

    it("repeated login/session restore within cooldown does not re-trigger", () => {
      const now = 1000000;
      recordRefresh("user_1", now);

      expect(shouldRefresh("user_1", TEN_MINUTES, now + 30_000)).toBe(false);
      expect(shouldRefresh("user_1", TEN_MINUTES, now + 60_000)).toBe(false);
      expect(shouldRefresh("user_1", TEN_MINUTES, now + 5 * 60_000)).toBe(false);
    });

    it("manual refresh bypasses cooldown via clearCooldown", () => {
      const now = 1000000;
      recordRefresh("user_1", now);

      expect(shouldRefresh("user_1", TEN_MINUTES, now + 1000)).toBe(false);

      clearCooldown("user_1");
      expect(shouldRefresh("user_1", TEN_MINUTES, now + 1000)).toBe(true);
    });
  });
});
