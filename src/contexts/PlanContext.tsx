import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { trackEvent } from "@/src/lib/analytics";
import { PLAN_STEPS } from "@/src/data/planSteps";

type PlanState = {
  activeCountrySlug: string | null;
  activePathwayId: string | null;
  completedSteps: string[];
  hasPets: boolean;
};

type PlanContextValue = PlanState & {
  isLoaded: boolean;
  startPlan: (countrySlug: string, pathwayId: string, countryName?: string) => void;
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
  const pendingClear = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as PlanState;
          if (parsed.activeCountrySlug && Array.isArray(parsed.completedSteps)) {
            setState(parsed);
          }
        }
      } catch (e) {
        console.warn("[PlanContext] Failed to load plan state:", e);
      }
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (pendingClear.current) {
      pendingClear.current = false;
      AsyncStorage.removeItem(STORAGE_KEY).catch((e) =>
        console.warn("[PlanContext] Failed to clear plan state:", e)
      );
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.warn("[PlanContext] Failed to persist plan state:", e)
    );
  }, [state, isLoaded]);

  const doStartPlan = useCallback((countrySlug: string, pathwayId: string) => {
    const next: PlanState = {
      activeCountrySlug: countrySlug,
      activePathwayId: pathwayId,
      completedSteps: [],
      hasPets: false,
    };
    setState(next);
    trackEvent("plan_focus_started", { country: countrySlug, pathway: pathwayId });
  }, []);

  const startPlan = useCallback((countrySlug: string, pathwayId: string, countryName?: string) => {
    const current = stateRef.current;
    const existingSlug = current.activeCountrySlug;
    if (existingSlug && existingSlug !== countrySlug) {
      const prevLabel = existingSlug.charAt(0).toUpperCase() + existingSlug.slice(1).replace(/-/g, " ");
      const newLabel = countryName || countrySlug.charAt(0).toUpperCase() + countrySlug.slice(1).replace(/-/g, " ");
      Alert.alert(
        "Switch your focus?",
        `You have an active plan for ${prevLabel}. Switching will reset your progress and start fresh for ${newLabel}.`,
        [
          { text: "Keep current plan", style: "cancel" },
          {
            text: `Focus on ${newLabel}`,
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
  }, []);

  const uncompleteStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (!prev.completedSteps.includes(stepId)) return prev;
      const completedSteps = prev.completedSteps.filter((s) => s !== stepId);
      return { ...prev, completedSteps };
    });
  }, []);

  const resetPlan = useCallback(() => {
    pendingClear.current = true;
    setState(EMPTY);
  }, []);

  const setHasPets = useCallback((val: boolean) => {
    setState((prev) => ({ ...prev, hasPets: val }));
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
