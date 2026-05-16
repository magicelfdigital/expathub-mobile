/**
 * webApiClient — small fetch wrapper for the ExpatHub web frontend.
 *
 * In dev, requests go through Vite's proxy (`/api/*` → Express on :5000).
 * In prod, requests go to the same origin that serves the SPA.
 */

export type ApiInit = Omit<RequestInit, "body"> & {
  json?: unknown;
};

export type ApiError = Error & {
  status: number;
  body?: unknown;
};

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
};

function buildHeaders(init?: ApiInit): HeadersInit {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (init?.headers) {
    Object.assign(headers, Object.fromEntries(new Headers(init.headers)));
  }
  return headers;
}

async function parse<T>(res: Response): Promise<T | undefined> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function request<T = unknown>(
  path: string,
  init: ApiInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: buildHeaders(init),
    body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
    credentials: init.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await parse<unknown>(res).catch(() => undefined);
    const err = new Error(
      `Request failed: ${res.status} ${res.statusText}`,
    ) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return ((await parse<T>(res)) as T) ?? (undefined as unknown as T);
}

export const webApiClient = {
  request,
  get: <T = unknown>(path: string, init?: ApiInit) =>
    request<T>(path, { ...init, method: "GET" }),
  post: <T = unknown>(path: string, json?: unknown, init?: ApiInit) =>
    request<T>(path, { ...init, method: "POST", json }),
  delete: <T = unknown>(path: string, init?: ApiInit) =>
    request<T>(path, { ...init, method: "DELETE" }),

  // Convenience wrappers for the API surface other v1.4 tasks will hook into.
  auth: {
    me: () => request<{ user?: { id?: string | number; email?: string } | null }>("/api/auth/me"),
    logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  },
  stripe: {
    checkout: (plan: "monthly" | "annual") =>
      request<{ url: string }>("/api/stripe/checkout", {
        method: "POST",
        json: { plan },
      }),
    // No-arg: the server derives the Stripe customer id from the
    // authenticated session/JWT (see /api/stripe/portal). Accepting a
    // customerId from the client would be an IDOR vector.
    portal: () =>
      request<{ url: string }>("/api/stripe/portal", {
        method: "POST",
        json: {},
      }),
  },
  subscription: {
    exitOfferEligibility: (subscriptionId: string) =>
      request<{
        eligible: boolean;
        alreadyShown: boolean;
        accepted?: boolean;
        declined?: boolean;
      }>(
        `/api/subscription/exit-offer/eligibility?subscriptionId=${encodeURIComponent(subscriptionId)}`,
      ),
    exitOffer: (
      subscriptionId: string,
      action: "accept" | "decline" | "shown",
    ) =>
      request<{ ok: boolean; couponId?: string }>("/api/subscription/exit-offer", {
        method: "POST",
        json: { subscriptionId, action },
      }),
  },
  readinessLead: (
    payload: {
      email: string;
      score?: number;
      readinessLevel?: string;
      risks?: string[];
      answers?: Record<string, string>;
    },
  ) =>
    request<{ ok: boolean }>("/api/readiness-lead", {
      method: "POST",
      json: payload,
    }),
};

export type WebApiClient = typeof webApiClient;
