import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loginUser, logoutUser } from "@/src/subscriptions/revenuecat";

const AUTH_API_URL = process.env.EXPO_PUBLIC_AUTH_API_URL ?? "https://expathub.world";
const TOKEN_KEY = "auth_jwt_token";

type User = {
  id: number;
  email: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function saveToken(token: string): Promise<void> {
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      return;
    } catch {}
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

async function loadToken(): Promise<string | null> {
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      const val = await SecureStore.getItemAsync(TOKEN_KEY);
      if (val) return val;
    } catch {}
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function removeToken(): Promise<void> {
  if (Platform.OS !== "web") {
    try {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function authFetch<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown>; token?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${AUTH_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json.message || json.error || message;
    } catch {
      if (text) message = text;
    }
    const err = new Error(message);
    (err as any).status = res.status;
    throw err;
  }

  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stored = await loadToken();
        if (!stored || !mounted) {
          setLoading(false);
          return;
        }

        const data = await authFetch<{ user: User }>("/api/auth/me", { token: stored });
        if (mounted) {
          setToken(stored);
          setUser(data.user);
          console.log(`[AUTH] Session restored for user ${data.user.id}, syncing with RevenueCat`);
          loginUser(data.user.id.toString());
        }
      } catch (e: any) {
        if (e.status === 401) {
          await removeToken();
        }
        if (mounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
    loginUser(data.user.id.toString());
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const data = await authFetch<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: { email, password },
    });
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
    loginUser(data.user.id.toString());
  }, []);

  const logout = useCallback(async () => {
    await removeToken();
    setToken(null);
    setUser(null);
    logoutUser();
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, getAuthHeaders }),
    [user, token, loading, login, register, logout, getAuthHeaders]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { AUTH_API_URL };
