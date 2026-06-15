// Tracks when the current app session started, so re-engagement prompts
// (such as the App Store rating request) can require a minimum dwell time
// before they fire. The module-level timestamp is set when this module is
// first imported; `markAppLaunch` lets the root layout reset it precisely at
// cold start. `initSessionState` records whether this is the user's very first
// session so prompts can be suppressed on first open.

import AsyncStorage from "@react-native-async-storage/async-storage";

const HAS_OPENED_BEFORE_KEY = "has_opened_app_before";

let launchTime = Date.now();
let firstSession = false;

export function markAppLaunch(): void {
  launchTime = Date.now();
}

// Resolves whether this is the first time the app has been opened on this
// device, then records that it has been opened so later sessions are not first.
// Captures the result in memory before persisting, so the value read mid-session
// reflects the state at launch rather than the value just written.
export async function initSessionState(): Promise<void> {
  try {
    const seen = await AsyncStorage.getItem(HAS_OPENED_BEFORE_KEY);
    firstSession = seen !== "true";
    if (firstSession) {
      await AsyncStorage.setItem(HAS_OPENED_BEFORE_KEY, "true");
    }
  } catch {
    firstSession = false;
  }
}

export function isFirstSession(): boolean {
  return firstSession;
}

export function getSessionElapsedMs(): number {
  return Date.now() - launchTime;
}
