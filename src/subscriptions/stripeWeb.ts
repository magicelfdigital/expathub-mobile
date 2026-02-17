import { getApiUrl } from "@/lib/query-client";

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = getApiUrl();
  const url = new URL(path, base);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export async function createCheckoutSession(priceId: string): Promise<string> {
  const data = await post<{ url: string }>("/api/stripe/checkout", { priceId });
  return data.url;
}

export async function createCustomerPortalSession(): Promise<string> {
  const data = await post<{ url: string }>("/api/stripe/portal", {});
  return data.url;
}

export async function getSubscriptionStatus(): Promise<{ hasProAccess: boolean }> {
  const base = getApiUrl();
  const url = new URL("/api/stripe/status", base);

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) return { hasProAccess: false };

  const data = await res.json();
  return { hasProAccess: !!data.hasProAccess };
}
