import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearLocalDataIfSignedOut,
  forceClearLocalData,
} from "../clearDeviceData";

const ALL_WIPED_KEYS = [
  "auth_jwt_token",
  "selectedCountrySlug",
  "hasSeenOnboarding",
  "quizResult",
  "quizAnswers",
  "skipBannerCount",
  "skippedAccount",
  "expathub_plan",
  "expathub_continue",
  "expathub_saved",
  "user_top_country",
  "user_first_name",
  "user_quiz_completed",
  "pending_purchase",
];

const PROTECTED_KEYS = [
  "promo_code_redeemed",
];

async function seedEverything(): Promise<void> {
  for (const k of ALL_WIPED_KEYS) {
    await AsyncStorage.setItem(k, "seed");
  }
  for (const k of PROTECTED_KEYS) {
    await AsyncStorage.setItem(k, "seed");
  }
}

async function snapshot(keys: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    out[k] = await AsyncStorage.getItem(k);
  }
  return out;
}

beforeEach(() => {
  (AsyncStorage as any).__reset();
});

describe("clearLocalDataIfSignedOut", () => {
  it("no-ops when a token is still present (a stale token must not silently wipe a logged-in session)", async () => {
    await seedEverything();

    const res = await clearLocalDataIfSignedOut();

    expect(res.wiped).toBe(false);
    const after = await snapshot(ALL_WIPED_KEYS);
    for (const k of ALL_WIPED_KEYS) {
      expect(after[k]).toBe("seed");
    }
  });

  it("wipes onboarding, quiz, planner and personalisation keys once the token is gone", async () => {
    await seedEverything();
    await AsyncStorage.removeItem("auth_jwt_token");

    const res = await clearLocalDataIfSignedOut();

    expect(res.wiped).toBe(true);
    const after = await snapshot(ALL_WIPED_KEYS);
    for (const k of ALL_WIPED_KEYS) {
      expect(after[k]).toBeNull();
    }
  });
});

describe("forceClearLocalData (account deletion)", () => {
  it("wipes the full local-state surface even when a stale token is still readable", async () => {
    // Account deletion must not depend on token-removal ordering: if the
    // server DELETE succeeded but token cleanup races or fails, the user
    // should still end up with no quiz result, no skipped-account marker,
    // and no planner/saved state on the device.
    await seedEverything();

    const res = await forceClearLocalData();

    expect(res.wiped).toBe(true);
    const after = await snapshot(ALL_WIPED_KEYS);
    for (const k of ALL_WIPED_KEYS) {
      expect(after[k]).toBeNull();
    }
  });

  it("preserves entitlement/abuse-guard keys (reverse trial markers, redeemed promo) so account deletion cannot re-grant a free trial", async () => {
    await seedEverything();

    await forceClearLocalData();

    const after = await snapshot(PROTECTED_KEYS);
    for (const k of PROTECTED_KEYS) {
      expect(after[k]).toBe("seed");
    }
  });

  it("explicitly removes the skippedAccount marker so the home-screen 'Your results are saved on this device' banner cannot resurface after deletion", async () => {
    await AsyncStorage.setItem("skippedAccount", "true");
    await AsyncStorage.setItem("quizResult", JSON.stringify({ score: 8 }));

    await forceClearLocalData();

    expect(await AsyncStorage.getItem("skippedAccount")).toBeNull();
    expect(await AsyncStorage.getItem("quizResult")).toBeNull();
  });
});
