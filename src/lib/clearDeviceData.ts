import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "auth_jwt_token";

// Keys wiped from AsyncStorage when the app opens with no logged-in account.
// Intentionally EXCLUDES billing / entitlement keys (promo code) so a user
// cannot re-grant themselves access by signing out, clearing the app, or
// reinstalling. Those keys live behind the protected EntitlementContext
// and are not touched here.
const KEYS_TO_WIPE_WHEN_SIGNED_OUT = [
  // Auth
  "auth_jwt_token",
  // Country selection
  "selectedCountrySlug",
  // Onboarding + quiz
  "hasSeenOnboarding",
  "quizResult",
  "quizAnswers",
  "skipBannerCount",
  "skippedAccount",
  // Planner state
  "expathub_plan",
  // Continue + Saved
  "expathub_continue",
  "expathub_saved",
  // Personalisation cached for paywall
  "user_top_country",
  "user_first_name",
  "user_quiz_completed",
  // Pending purchase recovery
  "pending_purchase",
];

async function readToken(): Promise<string | null> {
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      const val = await SecureStore.getItemAsync(TOKEN_KEY);
      if (val) return val;
    } catch {}
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function wipeAll(): Promise<void> {
  await AsyncStorage.multiRemove(KEYS_TO_WIPE_WHEN_SIGNED_OUT);
  // Defensive SecureStore cleanup on native; should already be absent.
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  }
}

export async function clearLocalDataIfSignedOut(): Promise<{ wiped: boolean }> {
  try {
    const token = await readToken();
    if (token) return { wiped: false };
    await wipeAll();
    return { wiped: true };
  } catch {
    return { wiped: false };
  }
}

// Used by the account-deletion flow. Wipes the same keys as
// clearLocalDataIfSignedOut but without the token-presence gate, so a stale
// or partially-removed token cannot leave quiz results, planner state, or
// the "skipped account" banner marker behind after the user has explicitly
// destroyed their account.
export async function forceClearLocalData(): Promise<{ wiped: boolean }> {
  try {
    await wipeAll();
    return { wiped: true };
  } catch {
    return { wiped: false };
  }
}
