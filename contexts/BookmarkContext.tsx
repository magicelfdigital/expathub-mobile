import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";

type Bookmark = {
  id: number;
  countrySlug: string;
  createdAt: string;
};

type Note = {
  id: number;
  countrySlug: string;
  content: string;
  updatedAt: string;
};

type BookmarkContextValue = {
  bookmarks: Bookmark[];
  notes: Note[];
  isBookmarked: (slug: string) => boolean;
  toggleBookmark: (slug: string) => Promise<"added" | "removed" | "limit">;
  bookmarkCount: number;
  noteForCountry: (slug: string) => string;
  saveNote: (slug: string, content: string) => Promise<void>;
  notesCount: number;
  loading: boolean;
};

const BookmarkContext = createContext<BookmarkContextValue | undefined>(undefined);

function getBase() {
  return Platform.OS === "web" ? getApiUrl().replace(/\/$/, "") : getBackendBase();
}

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const qc = useQueryClient();

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const { data: bookmarks = [], isLoading: bmLoading } = useQuery<Bookmark[]>({
    queryKey: ["bookmarks"],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`${getBase()}/api/bookmarks`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["notes"],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`${getBase()}/api/notes`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (slug: string) => {
      const url = `${getBase()}/api/bookmarks`;
      console.log(`[Bookmark] POST ${url} body=${JSON.stringify({ countrySlug: slug })}`);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ countrySlug: slug }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`[Bookmark] POST failed: ${res.status} ${body}`);
        throw new Error(`Failed to add bookmark: ${res.status} ${body}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`${getBase()}/api/bookmarks/${slug}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to remove bookmark");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: async ({ slug, content }: { slug: string; content: string }) => {
      const res = await fetch(`${getBase()}/api/notes/${slug}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const isBookmarked = useCallback(
    (slug: string) => bookmarks.some((b) => b.countrySlug === slug),
    [bookmarks]
  );

  const toggleBookmark = useCallback(
    async (slug: string): Promise<"added" | "removed" | "limit"> => {
      if (isBookmarked(slug)) {
        await removeMutation.mutateAsync(slug);
        return "removed";
      }
      await addMutation.mutateAsync(slug);
      return "added";
    },
    [isBookmarked, addMutation, removeMutation]
  );

  const noteForCountry = useCallback(
    (slug: string) => notes.find((n) => n.countrySlug === slug)?.content ?? "",
    [notes]
  );

  const saveNote = useCallback(
    async (slug: string, content: string) => {
      await noteMutation.mutateAsync({ slug, content });
    },
    [noteMutation]
  );

  const value = useMemo<BookmarkContextValue>(
    () => ({
      bookmarks,
      notes,
      isBookmarked,
      toggleBookmark,
      bookmarkCount: bookmarks.length,
      noteForCountry,
      saveNote,
      notesCount: notes.filter((n) => n.content.trim().length > 0).length,
      loading: bmLoading || notesLoading,
    }),
    [bookmarks, notes, isBookmarked, toggleBookmark, noteForCountry, saveNote, bmLoading, notesLoading]
  );

  return <BookmarkContext.Provider value={value}>{children}</BookmarkContext.Provider>;
}

export function useBookmarks() {
  const ctx = useContext(BookmarkContext);
  if (!ctx) throw new Error("useBookmarks must be used within BookmarkProvider");
  return ctx;
}
