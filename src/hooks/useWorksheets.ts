import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";
import {
  calculateQuizResultWithWorksheets,
  QUIZ_QUESTIONS,
} from "@/src/data/quiz";
import type {
  WorksheetAnswers,
  WorksheetDefinition,
} from "@/src/data/worksheets";

export type WorksheetListItem = Omit<WorksheetDefinition, "questions">;

function getBase(): string {
  return Platform.OS === "web" ? getApiUrl().replace(/\/$/, "") : getBackendBase();
}

const LIST_KEY = ["/api/worksheets"] as const;
const RESPONSES_KEY = ["/api/worksheets/responses"] as const;

export type WorksheetResponse = {
  worksheetId: string;
  questionId: number;
  answers: WorksheetAnswers;
  dimensionScore: number;
  submittedAt: string | null;
};

/**
 * List of all 8 worksheets — public, no auth required. Returns metadata
 * only (id, dimension, title, description); full question payloads are
 * fetched per-worksheet from an entitled detail endpoint.
 */
export function useWorksheetList() {
  return useQuery<WorksheetListItem[]>({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const url = `${getBase()}/api/worksheets`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[worksheets] list fetch ${res.status} from ${url}`);
          return [];
        }
        const data = (await res.json()) as WorksheetListItem[];
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn(`[worksheets] list fetch threw for ${url}`, err);
        return [];
      }
    },
  });
}

/**
 * Fetches a single worksheet's full definition (including questions).
 * Requires an active subscription server-side. Errors propagate so the
 * detail screen can route the user to the paywall.
 */
export function useWorksheetDetail(id: string | null | undefined) {
  const { user, token } = useAuth();
  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);
  return useQuery<WorksheetDefinition | null>({
    queryKey: ["/api/worksheets", id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const res = await fetch(
        `${getBase()}/api/worksheets/${encodeURIComponent(id as string)}`,
        { headers },
      );
      if (res.status === 402 || res.status === 401) return null;
      if (!res.ok) return null;
      return (await res.json()) as WorksheetDefinition;
    },
  });
}

/**
 * The current user's worksheet submissions, keyed by worksheet id. Returns
 * an empty list when the user is not authenticated.
 */
export function useWorksheetResponses() {
  const { user, token } = useAuth();
  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);
  return useQuery<WorksheetResponse[]>({
    queryKey: RESPONSES_KEY,
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch(`${getBase()}/api/worksheets/responses`, { headers });
      if (!res.ok) return [];
      const data = (await res.json()) as WorksheetResponse[];
      return Array.isArray(data) ? data : [];
    },
  });
}

/**
 * Submit a worksheet. On success, refreshes the cached responses AND
 * re-derives the persisted QuizResult so home/account/result screens pick
 * up the new readiness score immediately.
 */
export function useSubmitWorksheet() {
  const { user, token } = useAuth();
  const { quizResult, quizAnswers, saveQuizResult } = useOnboarding();
  const qc = useQueryClient();
  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  return useMutation({
    mutationFn: async (input: { worksheetId: string; answers: WorksheetAnswers }) => {
      if (!user) throw new Error("Sign in to save worksheets.");
      const res = await fetch(
        `${getBase()}/api/worksheets/${encodeURIComponent(input.worksheetId)}/submit`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ answers: input.answers }),
        },
      );
      if (res.status === 402) {
        throw new Error("A subscription is required to save this worksheet.");
      }
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      return res.json() as Promise<{
        ok: true;
        worksheetId: string;
        questionId: number;
        dimensionScore: number;
      }>;
    },
    onSuccess: async (data) => {
      // Refresh responses cache so the list screen reflects completion.
      await qc.invalidateQueries({ queryKey: RESPONSES_KEY });

      // Re-derive the persisted QuizResult so the home readiness card and
      // account screen pick up the new score without a refetch.
      if (!quizResult) return;

      const responses = qc.getQueryData<WorksheetResponse[]>(RESPONSES_KEY) ?? [];
      const scoreMap: Record<number, number> = {};
      for (const r of responses) scoreMap[r.questionId] = r.dimensionScore;
      // Ensure the just-submitted score is reflected even if the cache
      // refetch hasn't completed yet.
      scoreMap[data.questionId] = data.dimensionScore;

      // Use the persisted Q1–Q9 answers when available. For legacy users
      // who completed the quiz before quizAnswers was persisted, fall back
      // to deriving answers from the QuizResult itself: any dimension in
      // `risks` was a "no", everything else is treated as "yes". Categories
      // are sourced from QUIZ_QUESTIONS so the mapping can never drift.
      let answersForRecompute: Record<number, string>;
      if (quizAnswers) {
        answersForRecompute = quizAnswers;
      } else {
        const categoryToQid = new Map<string, number>();
        for (const q of QUIZ_QUESTIONS) categoryToQid.set(q.category, q.id);
        const derived: Record<number, string> = {};
        // Only derive Q1–Q8 (the yes/no/somewhat dimensions). Q9 is the
        // region preference enum and must be preserved verbatim from the
        // existing QuizResult, otherwise calculateQuizResultWithWorksheets
        // would overwrite the user's region with a default.
        for (const q of QUIZ_QUESTIONS) {
          if (q.id >= 1 && q.id <= 8) derived[q.id] = "yes";
        }
        for (const cat of quizResult.risks) {
          const qid = categoryToQid.get(cat);
          if (qid && qid >= 1 && qid <= 8) derived[qid] = "no";
        }
        if (quizResult.regionPreference) {
          derived[9] = quizResult.regionPreference;
        }
        answersForRecompute = derived;
      }

      const updated = calculateQuizResultWithWorksheets(answersForRecompute, scoreMap);
      // Preserve fields the new function doesn't compute (topMatch, etc.).
      await saveQuizResult({ ...quizResult, ...updated }, quizAnswers ?? undefined);
    },
  });
}

/** Convenience: lookup a single worksheet definition by id. */
export function useWorksheetDefinition(id: string | null | undefined) {
  const { data } = useWorksheetList();
  return useMemo(
    () => (data ?? []).find((w) => w.id === id) ?? null,
    [data, id],
  );
}

/** Convenience: lookup the current user's response for a worksheet. */
export function useWorksheetResponse(id: string | null | undefined) {
  const { data } = useWorksheetResponses();
  return useMemo(
    () => (data ?? []).find((r) => r.worksheetId === id) ?? null,
    [data, id],
  );
}
