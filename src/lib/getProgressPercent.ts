import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";

const TOKEN_KEY = "auth_jwt_token";

function getBase(): string {
  return Platform.OS === "web" ? getApiUrl().replace(/\/$/, "") : getBackendBase();
}

async function loadAuthToken(): Promise<string | null> {
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      const val = await SecureStore.getItemAsync(TOKEN_KEY);
      if (val) return val;
    } catch {}
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getProgressPercent(
  userId: string,
  countrySlug: string,
): Promise<number> {
  if (!userId || !countrySlug) return 0;
  try {
    const token = await loadAuthToken();
    if (!token) return 0;
    const params = new URLSearchParams({
      country: countrySlug,
      userId,
    });
    const url = `${getBase()}/api/progress/percent?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(
        `[getProgressPercent] non-OK response (${res.status}) for ${countrySlug}`,
      );
      return 0;
    }
    const data = (await res.json()) as { percent?: number };
    return typeof data.percent === "number" ? data.percent : 0;
  } catch (err) {
    console.warn("[getProgressPercent] fetch failed:", err);
    return 0;
  }
}
