import { Platform } from "react-native";
import Constants from "expo-constants";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function isNativeBuild(): boolean {
  return (Platform.OS === "android" || Platform.OS === "ios") && !isExpoGo();
}

let crashlyticsInstance: any = null;

async function getCrashlytics() {
  if (!isNativeBuild()) return null;
  if (crashlyticsInstance) return crashlyticsInstance;

  try {
    const mod = await import("@react-native-firebase/crashlytics");
    crashlyticsInstance = mod.default();
    return crashlyticsInstance;
  } catch {
    return null;
  }
}

export async function initCrashlytics(): Promise<void> {
  const c = await getCrashlytics();
  if (!c) return;

  try {
    await c.setCrashlyticsCollectionEnabled(true);
    if (__DEV__) {
      console.log("[Crashlytics] Initialized successfully");
    }
  } catch (e) {
    if (__DEV__) {
      console.warn("[Crashlytics] Init failed:", e);
    }
  }
}

export async function logCrash(error: Error): Promise<void> {
  const c = await getCrashlytics();
  if (!c) return;
  try {
    c.recordError(error);
  } catch {}
}

export async function logMessage(message: string): Promise<void> {
  const c = await getCrashlytics();
  if (!c) return;
  try {
    c.log(message);
  } catch {}
}

export async function setUserId(userId: string): Promise<void> {
  const c = await getCrashlytics();
  if (!c) return;
  try {
    c.setUserId(userId);
  } catch {}
}

export async function testCrash(): Promise<void> {
  const c = await getCrashlytics();
  if (!c) {
    if (__DEV__) {
      console.log("[Crashlytics] Test crash skipped — not a native build");
    }
    return;
  }
  c.crash();
}

export { isNativeBuild, isExpoGo };
