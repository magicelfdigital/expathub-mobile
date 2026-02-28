import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/src/lib/analytics";
import { PLAN_STEPS } from "@/src/data/planSteps";

type PlanState = {
  activeCountrySlug: string | null;
  activePathwayId: string | null;
  completedSteps: string[];
};

type PlanContextValue = PlanState & {
  isLoaded: boolean;
  startPlan: (countrySlug: string, pathwayId: string) => void;
  completeStep: (stepId: string) => void;
  uncompleteStep: (stepId: string) => void;
  resetPlan: () => void;
  isComplete: boolean;
};

const STORAGE_KEY = "expathub_plan";

const EMPTY: PlanState = {
  activeCountrySlug: null,
  activePathwayId: null,
  completedSteps: [],
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlanState>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as PlanState;
          setState(parsed);
        }
      } catch {}
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  const persist = useCallback(async (next: PlanState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const startPlan = useCallback((countrySlug: string, pathwayId: string) => {
    const next: PlanState = {
      activeCountrySlug: countrySlug,
      activePathwayId: pathwayId,
      completedSteps: [],
    };
    setState(next);
    persist(next);
    trackEvent("plan_focus_started", { country: countrySlug, pathway: pathwayId });
  }, [persist]);

  const completeStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(stepId)) return prev;
      const completedSteps = [...prev.completedSteps, stepId];
      const next = { ...prev, completedSteps };
      persist(next);
      trackEvent("plan_step_completed", {
        step: stepId,
        country: prev.activeCountrySlug ?? "",
        totalCompleted: completedSteps.length,
      });
      const allItemIds = PLAN_STEPS.flatMap((s) => s.checklist.map((c) => c.id));
      if (allItemIds.every((id) => completedSteps.includes(id))) {
        trackEvent("plan_completed", { country: prev.activeCountrySlug ?? "" });
      }
      return next;
    });
  }, [persist]);

  const uncompleteStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (!prev.completedSteps.includes(stepId)) return prev;
      const completedSteps = prev.completedSteps.filter((s) => s !== stepId);
      const next = { ...prev, completedSteps };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetPlan = useCallback(() => {
    setState(EMPTY);
    (async () => {
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
    })();
  }, []);

  const allChecklistIds = PLAN_STEPS.flatMap((s) => s.checklist.map((c) => c.id));
  const isComplete = allChecklistIds.length > 0 && allChecklistIds.every((id) => state.completedSteps.includes(id));

  const value = useMemo<PlanContextValue>(
    () => ({
      ...state,
      isLoaded,
      startPlan,
      completeStep,
      uncompleteStep,
      resetPlan,
      isComplete,
    }),
    [state, isLoaded, startPlan, completeStep, uncompleteStep, resetPlan, isComplete]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
