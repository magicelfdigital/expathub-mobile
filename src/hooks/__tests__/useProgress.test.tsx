/**
 * Direct hook test for src/hooks/useProgress.ts.
 *
 * Validates BOTH halves of the hook's contract end-to-end:
 *  - percent / completedCount / completedIds derive from the React-Query
 *    cache (live data, not just the math helper)
 *  - setStep posts to /api/progress, mutates the cache optimistically,
 *    AND fires the planner_step_completed analytics event (only when
 *    completed=true) with the post-mutation percent
 *  - the query is gated on (user && countrySlug)
 *
 * Renders the hook with @testing-library/react inside a real
 * QueryClientProvider, with all native deps mocked at module level.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
}));
jest.mock("expo/fetch", () => {
  const fn = (...args: any[]) => (global as any).fetch(...args);
  return { fetch: fn };
});

const mockUseAuth = jest.fn();
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://test/",
}));

jest.mock("@/src/billing/backendClient", () => ({
  getBackendBase: () => "http://test",
}));

const trackEvent = jest.fn();
jest.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
}));

import * as React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useProgress } from "../useProgress";
import { GENERIC_PLAN_STEPS } from "@/src/data/planSteps";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { wrapper, qc };
}

beforeEach(() => {
  trackEvent.mockReset();
  mockUseAuth.mockReturnValue({
    user: { id: 42, email: "ada@example.com" },
    token: "test-token",
  });
});

describe("useProgress — derived state", () => {
  it("starts at 0% when the API returns no completed steps", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.percent).toBe(0);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.totalSteps).toBe(GENERIC_PLAN_STEPS.length);
  });

  it("reaches 100% when every step is marked complete server-side", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        GENERIC_PLAN_STEPS.map((s) => ({
          stepId: s.id,
          completed: true,
          completedAt: "2026-01-01T00:00:00Z",
        })),
    }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.percent).toBe(100));
    expect(result.current.completedCount).toBe(GENERIC_PLAN_STEPS.length);
  });

  it("ignores unknown stepIds returned by the server (hardening against stale data)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { stepId: "made-up-step", completed: true, completedAt: null },
        {
          stepId: GENERIC_PLAN_STEPS[0].id,
          completed: true,
          completedAt: null,
        },
      ],
    }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(result.current.percent).toBeGreaterThan(0);
    expect(result.current.percent).toBeLessThan(100);
  });

  it("is gated off when there is no signed-in user (no fetch issued)", async () => {
    mockUseAuth.mockReturnValue({ user: null, token: null });
    const fetchSpy = jest.fn(async () => ({ ok: true, json: async () => [] }));
    (global as any).fetch = fetchSpy;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    // give react-query a tick to (not) fire
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isReady).toBe(false);
    expect(result.current.percent).toBe(0);
  });

  it("is gated off when there is no countrySlug (no fetch issued)", async () => {
    const fetchSpy = jest.fn(async () => ({ ok: true, json: async () => [] }));
    (global as any).fetch = fetchSpy;
    const { wrapper } = makeWrapper();
    renderHook(() => useProgress(null), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useProgress — setStep mutation", () => {
  it("POSTs to /api/progress with the step toggle payload AND fires planner_step_completed", async () => {
    const calls: any[] = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (opts?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const firstStepId = GENERIC_PLAN_STEPS[0].id;
    await act(async () => {
      result.current.setStep(firstStepId, true);
    });
    await waitFor(() => {
      const fired = trackEvent.mock.calls.filter(
        (c) => c[0] === "planner_step_completed",
      );
      expect(fired).toHaveLength(1);
    });

    const post = calls.find((c) => c.opts?.method === "POST");
    expect(post).toBeDefined();
    expect(post.url).toContain("/api/progress");
    expect(JSON.parse(post.opts.body)).toEqual({
      country: "portugal",
      stepId: firstStepId,
      completed: true,
    });

    const fired = trackEvent.mock.calls.filter(
      (c) => c[0] === "planner_step_completed",
    );
    expect(fired[0][1]).toMatchObject({
      stepId: firstStepId,
      country: "portugal",
      completedCount: 1,
    });
    expect(typeof fired[0][1].percent).toBe("number");
    expect(fired[0][1].percent).toBeGreaterThan(0);
  });

  it("does NOT fire planner_step_completed when the user UN-checks a step (completed=false)", async () => {
    (global as any).fetch = jest.fn(async (_url: string, opts: any) => {
      if (opts?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            stepId: GENERIC_PLAN_STEPS[0].id,
            completed: true,
            completedAt: null,
          },
        ],
      };
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.completedCount).toBe(1));

    await act(async () => {
      result.current.setStep(GENERIC_PLAN_STEPS[0].id, false);
    });

    // give the mutation a moment to settle
    await new Promise((r) => setTimeout(r, 30));
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "planner_step_completed"),
    ).toHaveLength(0);
  });

  it("preserves optimistic state for a concurrent in-flight mutation (no mid-race refetch clobber)", async () => {
    // Regression for planner UX bug: when two setStep mutations are in
    // flight at once (auto-complete + a manual tap, or two rapid taps),
    // the first to settle must NOT invalidate /api/progress while the
    // second's POST is still pending — otherwise the refetch returns DB
    // state that lacks the in-flight write and the optimistic check is
    // visibly clobbered back to unchecked.
    let resolveSecondPost: ((r: any) => void) | null = null;
    const getCalls: number[] = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        if (body.stepId === GENERIC_PLAN_STEPS[0].id) {
          // first POST resolves immediately
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        // second POST is held open until we release it
        return new Promise((resolve) => {
          resolveSecondPost = () =>
            resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
        });
      }
      // GET — record each call so we can assert no mid-race refetch happens
      getCalls.push(Date.now());
      return { ok: true, status: 200, json: async () => [] };
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const initialGetCount = getCalls.length;

    const stepA = GENERIC_PLAN_STEPS[0].id;
    const stepB = GENERIC_PLAN_STEPS[1].id;

    // Fire two mutations back-to-back; first settles fast, second is pending
    await act(async () => {
      result.current.setStep(stepA, true);
      result.current.setStep(stepB, true);
    });

    // First settles → onSettled runs but should SKIP invalidation because
    // the second mutation is still in flight. Give the loop a tick.
    await new Promise((r) => setTimeout(r, 30));
    expect(getCalls.length).toBe(initialGetCount);
    // Both optimistic checks must still be visible
    expect(result.current.isStepComplete(stepA)).toBe(true);
    expect(result.current.isStepComplete(stepB)).toBe(true);

    // Release the second POST → now onSettled IS the last in-flight, and
    // exactly one refetch should follow.
    await act(async () => {
      resolveSecondPost?.({});
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(getCalls.length).toBe(initialGetCount + 1));
  });

  it("authorizes the request with the bearer token from useAuth", async () => {
    let captured: any = null;
    (global as any).fetch = jest.fn(async (_url: string, opts: any) => {
      if (opts?.method === "POST") {
        captured = opts.headers;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProgress("portugal"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      result.current.setStep(GENERIC_PLAN_STEPS[0].id, true);
    });
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured.Authorization).toBe("Bearer test-token");
    expect(captured["Content-Type"]).toBe("application/json");
  });
});
