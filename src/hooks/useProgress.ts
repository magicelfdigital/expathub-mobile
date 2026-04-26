import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getBackendBase } from "@/src/billing/backendClient";
import {
  GENERIC_PLAN_STEPS,
  GENERIC_STEP_IDS,
  computePercentFromCompletedIds,
} from "@/src/data/planSteps";

export type ProgressStep = {
  stepId: string;
  completed: boolean;
  completedAt: string | null;
};

function getBase(): string {
  return Platform.OS === "web" ? getApiUrl().replace(/\/$/, "") : getBackendBase();
}

function progressKey(country: string | null | undefined) {
  return ["/api/progress", country ?? ""];
}

export function useProgress(countrySlug: string | null | undefined) {
  const { user, token } = useAuth();
  const qc = useQueryClient();

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const enabled = !!user && !!countrySlug;

  const query = useQuery<ProgressStep[]>({
    queryKey: progressKey(countrySlug),
    enabled,
    queryFn: async () => {
      if (!countrySlug) return [];
      const url = `${getBase()}/api/progress?country=${encodeURIComponent(countrySlug)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const data = (await res.json()) as ProgressStep[];
      return Array.isArray(data) ? data : [];
    },
  });

  const steps: ProgressStep[] = useMemo(() => {
    const fetched = query.data ?? [];
    const byId = new Map(fetched.map((s) => [s.stepId, s]));
    return GENERIC_STEP_IDS.map(
      (id) => byId.get(id) ?? { stepId: id, completed: false, completedAt: null },
    );
  }, [query.data]);

  const completedIds = useMemo(
    () => steps.filter((s) => s.completed).map((s) => s.stepId),
    [steps],
  );

  const percent = useMemo(
    () => computePercentFromCompletedIds(completedIds),
    [completedIds],
  );
  const completedCount = completedIds.length;
  const totalSteps = GENERIC_PLAN_STEPS.length;

  const mutation = useMutation({
    mutationFn: async (input: { stepId: string; completed: boolean }) => {
      if (!countrySlug) throw new Error("country required");
      const res = await fetch(`${getBase()}/api/progress`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          country: countrySlug,
          stepId: input.stepId,
          completed: input.completed,
        }),
      });
      if (!res.ok) throw new Error(`progress toggle failed: ${res.status}`);
      return res.json();
    },
    onMutate: async (input) => {
      const key = progressKey(countrySlug);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProgressStep[]>(key);
      const next: ProgressStep[] = (prev ?? []).filter(
        (s) => s.stepId !== input.stepId,
      );
      next.push({
        stepId: input.stepId,
        completed: input.completed,
        completedAt: input.completed ? new Date().toISOString() : null,
      });
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(progressKey(countrySlug), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: progressKey(countrySlug) });
    },
  });

  const setStep = useCallback(
    (
      stepId: string,
      completed: boolean,
      opts?: { onSuccess?: () => void; onError?: () => void },
    ) => {
      if (!enabled) return;
      mutation.mutate(
        { stepId, completed },
        {
          onSuccess: () => opts?.onSuccess?.(),
          onError: () => opts?.onError?.(),
        },
      );
    },
    [enabled, mutation],
  );

  const toggleStep = useCallback(
    (stepId: string) => {
      const current = steps.find((s) => s.stepId === stepId);
      setStep(stepId, !(current?.completed ?? false));
    },
    [steps, setStep],
  );

  const isStepComplete = useCallback(
    (stepId: string) => steps.find((s) => s.stepId === stepId)?.completed ?? false,
    [steps],
  );

  return {
    steps,
    completedIds,
    percent,
    completedCount,
    totalSteps,
    isStepComplete,
    setStep,
    toggleStep,
    isLoading: query.isLoading,
    isPending: mutation.isPending,
    isReady: !!user,
  };
}
