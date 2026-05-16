import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { trackEvent } from "@/src/lib/analytics";
import { PLAN_STEPS } from "@/src/data/planSteps";
import { tokens } from "@/theme/tokens";

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
  requestResetPlan: (onConfirmed?: () => void) => void;
  setHasPets: (val: boolean) => void;
  isComplete: boolean;
};

type SwitchPrompt = {
  countrySlug: string;
  pathwayId: string;
  prevLabel: string;
  newLabel: string;
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
  const [switchPrompt, setSwitchPrompt] = useState<SwitchPrompt | null>(null);
  const [resetPromptVisible, setResetPromptVisible] = useState(false);
  const resetCallbackRef = useRef<(() => void) | null>(null);
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
      const message = `You have an active plan for ${prevLabel}. Switching will reset your progress and start fresh for ${newLabel}.`;
      if (Platform.OS === "web") {
        setSwitchPrompt({ countrySlug, pathwayId, prevLabel, newLabel });
      } else {
        Alert.alert(
          "Switch your focus?",
          message,
          [
            { text: "Keep current plan", style: "cancel" },
            {
              text: `Focus on ${newLabel}`,
              style: "destructive",
              onPress: () => doStartPlan(countrySlug, pathwayId),
            },
          ],
        );
      }
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

  const requestResetPlan = useCallback((onConfirmed?: () => void) => {
    if (Platform.OS === "web") {
      resetCallbackRef.current = onConfirmed ?? null;
      setResetPromptVisible(true);
    } else {
      Alert.alert(
        "Reset plan?",
        "This clears your active plan and step progress. You can start a new plan from any country anytime.",
        [
          { text: "Keep plan", style: "cancel" },
          {
            text: "Reset",
            style: "destructive",
            onPress: () => {
              resetPlan();
              onConfirmed?.();
            },
          },
        ],
        { cancelable: true },
      );
    }
  }, [resetPlan]);

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
      requestResetPlan,
      setHasPets,
      isComplete,
    }),
    [state, isLoaded, startPlan, completeStep, uncompleteStep, resetPlan, requestResetPlan, setHasPets, isComplete]
  );

  const handleCancelSwitch = useCallback(() => setSwitchPrompt(null), []);
  const handleConfirmSwitch = useCallback(() => {
    if (!switchPrompt) return;
    const { countrySlug, pathwayId } = switchPrompt;
    setSwitchPrompt(null);
    doStartPlan(countrySlug, pathwayId);
  }, [switchPrompt, doStartPlan]);

  const handleCancelReset = useCallback(() => {
    resetCallbackRef.current = null;
    setResetPromptVisible(false);
  }, []);
  const handleConfirmReset = useCallback(() => {
    const cb = resetCallbackRef.current;
    resetCallbackRef.current = null;
    setResetPromptVisible(false);
    resetPlan();
    cb?.();
  }, [resetPlan]);

  return (
    <PlanContext.Provider value={value}>
      {children}
      {Platform.OS === "web" && (
        <>
          <SwitchPlanDialog
            prompt={switchPrompt}
            onCancel={handleCancelSwitch}
            onConfirm={handleConfirmSwitch}
          />
          <ResetPlanDialog
            visible={resetPromptVisible}
            onCancel={handleCancelReset}
            onConfirm={handleConfirmReset}
          />
        </>
      )}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}

function SwitchPlanDialog({
  prompt,
  onCancel,
  onConfirm,
}: {
  prompt: SwitchPrompt | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const visible = prompt !== null;
  const prevLabel = prompt?.prevLabel ?? "";
  const newLabel = prompt?.newLabel ?? "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={dialogStyles.overlay}
        onPress={onCancel}
        testID="switch-plan-overlay"
      >
        <Pressable style={dialogStyles.sheet} onPress={() => {}}>
          <Text style={dialogStyles.title}>Switch your focus?</Text>
          <Text style={dialogStyles.body}>
            You have an active plan for{" "}
            <Text style={dialogStyles.bodyStrong}>{prevLabel}</Text>. Switching
            will reset your progress and start fresh for{" "}
            <Text style={dialogStyles.bodyStrong}>{newLabel}</Text>.
          </Text>

          <View style={dialogStyles.actions}>
            <Pressable
              testID="switch-plan-cancel"
              onPress={onCancel}
              style={({ pressed }) => [
                dialogStyles.cancelBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={dialogStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="switch-plan-confirm"
              onPress={onConfirm}
              style={({ pressed }) => [
                dialogStyles.confirmBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={dialogStyles.confirmBtnText}>
                Focus on {newLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ResetPlanDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={dialogStyles.overlay}
        onPress={onCancel}
        testID="reset-plan-overlay"
      >
        <Pressable style={dialogStyles.sheet} onPress={() => {}}>
          <Text style={dialogStyles.title}>Reset plan?</Text>
          <Text style={dialogStyles.body}>
            This clears your active plan and step progress. You can start a new
            plan from any country anytime.
          </Text>

          <View style={dialogStyles.actions}>
            <Pressable
              testID="reset-plan-cancel"
              onPress={onCancel}
              style={({ pressed }) => [
                dialogStyles.cancelBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={dialogStyles.cancelBtnText}>Keep plan</Text>
            </Pressable>
            <Pressable
              testID="reset-plan-confirm"
              onPress={onConfirm}
              style={({ pressed }) => [
                dialogStyles.confirmBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={dialogStyles.confirmBtnText}>Reset</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const DESTRUCTIVE = "#B3261E";

const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  body: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  bodyStrong: {
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  cancelBtnText: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: DESTRUCTIVE,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
});
