import { useEffect, useState } from "react";
import { webApiClient } from "@/lib/api";
import { identifyWebUser } from "@/lib/pixel";

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
      const loaded = data?.user ?? null;
      // Reconcile the anonymous (or email-keyed) quiz funnel id to the real
      // user id once the session resolves. `identifyWebUser` is idempotent
      // — it only fires when the user id (or live distinct_id) changes —
      // so it's safe to call on every page load. This is what closes the
      // loop between pre-account quiz events and post-account purchase
      // events in PostHog.
      //
      // We deliberately do NOT pass `email` as a trait here. The pre-account
      // path (`identifyByEmail`) intentionally hashes email rather than
      // sending it raw, so we keep PII handling consistent across the chain.
      // The backend already knows the email via `/api/auth/me`, so analytics
      // can join on user id without us sending it again.
      if (loaded?.id !== undefined && loaded.id !== null) {
        identifyWebUser(loaded.id);
      }
      setState({
        user: loaded,
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
