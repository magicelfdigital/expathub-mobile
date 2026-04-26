import { useEffect, useState } from "react";
import { webApiClient } from "@/lib/api";

export type WebUser = {
  id?: string | number;
  email?: string;
  stripeSubscriptionId?: string | null;
  hasProAccess?: boolean;
} | null;

export function userHasProAccess(u: WebUser): boolean {
  if (!u) return false;
  if (u.hasProAccess) return true;
  if (u.stripeSubscriptionId) return true;
  return false;
}

type State = {
  user: WebUser;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Lightweight session check. Calls `/api/auth/me`; treats any non-2xx (or
 * missing user) as anonymous. Full sign-in/sign-up UI lands in a later task.
 */
export function useUser(): State & { refresh: () => Promise<void> } {
  const [state, setState] = useState<State>({
    user: null,
    isLoading: true,
    error: null,
  });

  async function load() {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await webApiClient.auth
        .me()
        .catch(() => ({ user: null }) as { user: null });
      setState({
        user: data?.user ?? null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState({
        user: null,
        isLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { ...state, refresh: load };
}
