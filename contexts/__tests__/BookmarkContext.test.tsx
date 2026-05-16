import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, email: "ada@example.com" },
    token: "tok",
  }),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "https://api.example.com/",
}));

jest.mock("@/src/billing/backendClient", () => ({
  getBackendBase: () => "https://api.example.com",
}));

import { BookmarkProvider, useBookmarks } from "../BookmarkContext";

function captureBookmarks() {
  const ref: { current: ReturnType<typeof useBookmarks> | null } = { current: null };
  function Probe() {
    ref.current = useBookmarks();
    return null;
  }
  return { ref, Probe };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function mountWithFetch(fetchImpl: jest.Mock) {
  (global as any).fetch = fetchImpl;
  const { ref, Probe } = captureBookmarks();
  render(
    <QueryClientProvider client={makeClient()}>
      <BookmarkProvider>
        <Probe />
      </BookmarkProvider>
    </QueryClientProvider>,
  );
  return ref;
}

describe("BookmarkContext — malformed API responses", () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;

  beforeEach(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    console.warn = originalWarn;
  });

  it("falls back to empty arrays and warns when /api/notes and /api/bookmarks return non-array JSON", async () => {
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/api/bookmarks")
          ? { error: "oops" }
          : "totally not an array",
    })) as unknown as jest.Mock;

    const ref = mountWithFetch(fetchMock);

    await waitFor(() => expect(ref.current?.loading).toBe(false));

    expect(ref.current?.bookmarks).toEqual([]);
    expect(ref.current?.notes).toEqual([]);
    expect(ref.current?.bookmarkCount).toBe(0);
    expect(ref.current?.notesCount).toBe(0);
    expect(() => ref.current?.isBookmarked("portugal")).not.toThrow();
    expect(ref.current?.noteForCountry("portugal")).toBe("");

    const warnCalls = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((m) => m.includes("/api/bookmarks returned non-array"))).toBe(true);
    expect(warnCalls.some((m) => m.includes("/api/notes returned non-array"))).toBe(true);
  });

  it("falls back to empty arrays when the API throws (server unreachable)", async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as jest.Mock;

    const ref = mountWithFetch(fetchMock);

    await waitFor(() => expect(ref.current?.loading).toBe(false));

    expect(ref.current?.bookmarks).toEqual([]);
    expect(ref.current?.notes).toEqual([]);
    expect(ref.current?.notesCount).toBe(0);
  });

  it("uses returned arrays when the API responds with the expected shape", async () => {
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/api/bookmarks")
          ? [{ id: 1, countrySlug: "portugal", createdAt: "2026-01-01" }]
          : [
              { id: 9, countrySlug: "portugal", content: "ready", updatedAt: "2026-01-02" },
              { id: 10, countrySlug: "spain", content: "  ", updatedAt: "2026-01-02" },
            ],
    })) as unknown as jest.Mock;

    const ref = mountWithFetch(fetchMock);

    await waitFor(() => expect(ref.current?.bookmarks.length).toBe(1));

    expect(ref.current?.isBookmarked("portugal")).toBe(true);
    expect(ref.current?.notesCount).toBe(1);
    expect(ref.current?.noteForCountry("portugal")).toBe("ready");
  });
});
