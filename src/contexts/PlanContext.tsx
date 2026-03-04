import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { trackEvent } from "@/src/lib/analytics";
import { PLAN_STEPS } from "@/src/data/planSteps";
import { getCountry } from "@/src/data";

type PlanState = {
  activeCountrySlug: string | null;
  activePathwayId: string | null;
  completedSteps: string[];
  hasPets: boolean;
};

type PlanContextValue = PlanState & {
  isLoaded: boolean;
  startPlan: (countrySlug: string, pathwayId: string) => void;
  completeStep: (stepId: string) => void;
  uncompleteStep: (stepId: string) => void;
  resetPlan: () => void;
  setHasPets: (val: boolean) => void;
  isComplete: boolean;
};

const STORAGE_KEY = "expathub_plan";

const EMPTY: PlanState = {
  activeCountrySlug: null,
  activePathwayId: null,
  completedSteps: [],
  hasPets: false,
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlanState>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);
  const stateRef = useRef<PlanState>(state);
  stateRef.current = state;

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

  const doStartPlan = useCallback((countrySlug: string, pathwayId: string) => {
    const next: PlanState = {
      activeCountrySlug: countrySlug,
      activePathwayId: pathwayId,
      completedSteps: [],
      hasPets: false,
    };
    setState(next);
    persist(next);
    trackEvent("plan_focus_started", { country: countrySlug, pathway: pathwayId });
  }, [persist]);

  const startPlan = useCallback((countrySlug: string, pathwayId: string) => {
    const current = stateRef.current;
    if (current.activeCountrySlug && current.activeCountrySlug !== countrySlug) {
      const prevName = getCountry(current.activeCountrySlug)?.name ?? current.activeCountrySlug;
      const newName = getCountry(countrySlug)?.name ?? countrySlug;
      Alert.alert(
        "Switch your focus?",
        `You have an active plan for ${prevName}. Switching will reset your progress and start fresh for ${newName}.`,
        [
          { text: "Keep current plan", style: "cancel" },
          {
            text: `Focus on ${newName}`,
            style: "destructive",
            onPress: () => doStartPlan(countrySlug, pathwayId),
          },
        ],
      );
    } else {
      doStartPlan(countrySlug, pathwayId);
    }
  }, [doStartPlan]);

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

  const setHasPets = useCallback((val: boolean) => {
    setState((prev) => {
      const next = { ...prev, hasPets: val };
      persist(next);
      return next;
    });
  }, [persist]);

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
      setHasPets,
      isComplete,
    }),
    [state, isLoaded, startPlan, completeStep, uncompleteStep, resetPlan, setHasPets, isComplete]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
