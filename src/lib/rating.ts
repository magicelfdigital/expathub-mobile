import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { getSessionElapsedMs, isFirstSession } from "@/src/lib/appSession";
import { shouldShowRatingPrompt } from "@/src/lib/reengagementGates";

// Requests the native App Store rating prompt after the user has completed the
// readiness quiz and seen their results. Guarded so it only ever fires once,
// never on first open, and only after a minimum dwell time in the session.

const RATING_PROMPT_SHOWN_KEY = "rating_prompt_shown";

export async function maybeRequestReview(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const alreadyShown =
      (await AsyncStorage.getItem(RATING_PROMPT_SHOWN_KEY)) === "true";
    const available = await StoreReview.isAvailableAsync();

    const eligible = shouldShowRatingPrompt({
      isAvailable: available,
      elapsedMs: getSessionElapsedMs(),
      alreadyShown,
      isFirstSession: isFirstSession(),
    });
    if (!eligible) return;

    // Mark as shown before requesting so a mid-flight failure cannot lead to
    // the prompt appearing on a later results view.
    await AsyncStorage.setItem(RATING_PROMPT_SHOWN_KEY, "true");
    await StoreReview.requestReview();
  } catch {
    // Best effort; never surface rating-prompt failures to the user.
  }
}
