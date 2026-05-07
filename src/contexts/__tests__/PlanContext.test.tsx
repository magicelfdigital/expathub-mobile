import React from "react";
import { act, render, waitFor } from "@testing-library/react";

import { PlanProvider, usePlan } from "../PlanContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import * as analytics from "@/src/lib/analytics";
import { PLAN_STEPS } from "@/src/data/planSteps";

function capturePlan() {
  const ref: { current: ReturnType<typeof usePlan> | null } = { current: null };
  function Probe() {
    ref.current = usePlan();
    return null;
  }
  return { ref, Probe };
}

const trackSpy = jest.spyOn(analytics, "trackEvent").mockImplementation(() => {});

beforeEach(() => {
  trackSpy.mockClear();
  (AsyncStorage as any).__reset();
  (Alert as any).__reset();
});

afterAll(() => {
  trackSpy.mockRestore();
});

describe("PlanContext — hydration", () => {
  it("hydrates from EMPTY when AsyncStorage has no plan", async () => {
    const { ref, Probe } = capturePlan();
    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );

    await waitFor(() => expect(ref.current?.isLoaded).toBe(true));
    expect(ref.current?.activeCountrySlug).toBeNull();
    expect(ref.current?.activePathwayId).toBeNull();
    expect(ref.current?.completedSteps).toEqual([]);
    expect(ref.current?.hasPets).toBe(false);
    expect(ref.current?.isComplete).toBe(false);
  });

  it("hydrates from a previously persisted plan", async () => {
    (AsyncStorage as any).__seed(
      "expathub_plan",
      JSON.stringify({
        activeCountrySlug: "portugal",
        activePathwayId: "d7",
        completedSteps: ["step-a"],
        hasPets: true,
      }),
    );

    const { ref, Probe } = capturePlan();
    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );
    await waitFor(() => expect(ref.current?.isLoaded).toBe(true));
    expect(ref.current?.activeCountrySlug).toBe("portugal");
    expect(ref.current?.activePathwayId).toBe("d7");
    expect(ref.current?.completedSteps).toEqual(["step-a"]);
    expect(ref.current?.hasPets).toBe(true);
  });

  it("ignores corrupted persisted plan and falls back to EMPTY", async () => {
    (AsyncStorage as any).__seed("expathub_plan", "{{{not-json");
    // Suppress the expected console.warn from the JSON.parse failure.
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const { ref, Probe } = capturePlan();
      render(
        <PlanProvider>
          <Probe />
        </PlanProvider>,
      );
      await waitFor(() => expect(ref.current?.isLoaded).toBe(true));
      expect(ref.current?.activeCountrySlug).toBeNull();
      expect(ref.current?.completedSteps).toEqual([]);
    } finally {
      console.warn = origWarn;
    }
  });
});

describe("PlanContext — startPlan analytics + state wiring", () => {
  async function mounted() {
    const { ref, Probe } = capturePlan();
    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );
    await waitFor(() => expect(ref.current?.isLoaded).toBe(true));
    return ref;
  }

  it("startPlan from no-active-plan fires plan_focus_started and switches state immediately", async () => {
    const ref = await mounted();
    act(() => {
      ref.current!.startPlan("portugal", "d7");
    });
    expect(ref.current?.activeCountrySlug).toBe("portugal");
    expect(ref.current?.activePathwayId).toBe("d7");
    expect(trackSpy).toHaveBeenCalledWith("plan_focus_started", {
      country: "portugal",
      pathway: "d7",
    });
  });

  it("startPlan against the SAME country fires plan_focus_started and resets completed steps (no Alert)", async () => {
    const ref = await mounted();
    act(() => {
      ref.current!.startPlan("portugal", "d7");
    });
    const stepId = PLAN_STEPS[0].checklist[0].id;
    act(() => {
      ref.current!.completeStep(stepId);
    });
    expect(ref.current?.completedSteps).toEqual([stepId]);
    trackSpy.mockClear();

    act(() => {
      ref.current!.startPlan("portugal", "d7");
    });
    expect((Alert as any).__calls()).toHaveLength(0);
    expect(ref.current?.completedSteps).toEqual([]);
    expect(trackSpy).toHaveBeenCalledWith("plan_focus_started", {
      country: "portugal",
      pathway: "d7",
    });
  });

  it("startPlan against a DIFFERENT country opens the confirm Alert and only switches when 'Focus on …' is pressed", async () => {
    const ref = await mounted();
    act(() => {
      ref.current!.startPlan("portugal", "d7");
    });
    trackSpy.mockClear();

    act(() => {
      ref.current!.startPlan("spain", "nonlucrative", "Spain");
    });
    expect(ref.current?.activeCountrySlug).toBe("portugal");
    const calls = (Alert as any).__calls();
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe("Switch your focus?");
    expect(trackSpy).not.toHaveBeenCalled();

    act(() => {
      (Alert as any).__pressButton("Focus on Spain");
    });
    expect(ref.current?.activeCountrySlug).toBe("spain");
    expect(ref.current?.activePathwayId).toBe("nonlucrative");
    expect(ref.current?.completedSteps).toEqual([]);
    expect(trackSpy).toHaveBeenCalledWith("plan_focus_started", {
      country: "spain",
      pathway: "nonlucrative",
    });
  });

  it("startPlan to a different country with 'Keep current plan' is a no-op", async () => {
    const ref = await mounted();
    act(() => {
      ref.current!.startPlan("portugal", "d7");
    });
    trackSpy.mockClear();

    act(() => {
      ref.current!.startPlan("spain", "nonlucrative", "Spain");
    });
    act(() => {
      (Alert as any).__pressButton("Keep current plan");
    });
    expect(ref.current?.activeCountrySlug).toBe("portugal");
    expect(trackSpy).not.toHaveBeenCalled();
  });
});

describe("PlanContext — completeStep analytics + isComplete", () => {
  async function mountedWithPlan() {
    const { ref, Probe } = capturePlan();
    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );
    await waitFor(() => expect(ref.current?.isLoaded).toBe(true));
    act(() => ref.current!.startPlan("portugal", "d7"));
    trackSpy.mockClear();
    return ref;
  }

  it("fires plan_step_completed once per step with the right country + cumulative count", async () => {
    const ref = await mountedWithPlan();
    const a = PLAN_STEPS[0].checklist[0].id;
    const b = PLAN_STEPS[0].checklist[1].id;
    act(() => ref.current!.completeStep(a));
    act(() => ref.current!.completeStep(b));
    expect(trackSpy).toHaveBeenNthCalledWith(1, "plan_step_completed", {
      step: a,
      country: "portugal",
      totalCompleted: 1,
    });
    expect(trackSpy).toHaveBeenNthCalledWith(2, "plan_step_completed", {
      step: b,
      country: "portugal",
      totalCompleted: 2,
    });
  });

  it("does not re-fire plan_step_completed for an already-completed step (idempotent)", async () => {
    const ref = await mountedWithPlan();
    const a = PLAN_STEPS[0].checklist[0].id;
    act(() => ref.current!.completeStep(a));
    trackSpy.mockClear();
    act(() => ref.current!.completeStep(a));
    expect(trackSpy).not.toHaveBeenCalled();
    expect(ref.current?.completedSteps).toEqual([a]);
  });

  it("uncompleteStep removes the id and is idempotent for unknown ids", async () => {
    const ref = await mountedWithPlan();
    const a = PLAN_STEPS[0].checklist[0].id;
    act(() => ref.current!.completeStep(a));
    act(() => ref.current!.uncompleteStep(a));
    expect(ref.current?.completedSteps).toEqual([]);
    act(() => ref.current!.uncompleteStep("does-not-exist"));
    expect(ref.current?.completedSteps).toEqual([]);
  });

  it("fires plan_completed exactly once when every checklist item across PLAN_STEPS is checked", async () => {
    const ref = await mountedWithPlan();
    const allIds = PLAN_STEPS.flatMap((s) => s.checklist.map((c) => c.id));
    for (const id of allIds) {
      act(() => ref.current!.completeStep(id));
    }
    const completedCalls = trackSpy.mock.calls.filter(
      (c) => c[0] === "plan_completed",
    );
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0][1]).toEqual({ country: "portugal" });
    expect(ref.current?.isComplete).toBe(true);
  });

  it("resetPlan returns to EMPTY state (no analytics fired on reset)", async () => {
    const ref = await mountedWithPlan();
    const a = PLAN_STEPS[0].checklist[0].id;
    act(() => ref.current!.completeStep(a));
    trackSpy.mockClear();
    act(() => ref.current!.resetPlan());
    expect(ref.current?.activeCountrySlug).toBeNull();
    expect(ref.current?.completedSteps).toEqual([]);
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it("setHasPets toggles the hasPets flag without firing analytics", async () => {
    const ref = await mountedWithPlan();
    act(() => ref.current!.setHasPets(true));
    expect(ref.current?.hasPets).toBe(true);
    act(() => ref.current!.setHasPets(false));
    expect(ref.current?.hasPets).toBe(false);
    expect(trackSpy).not.toHaveBeenCalled();
  });
});
