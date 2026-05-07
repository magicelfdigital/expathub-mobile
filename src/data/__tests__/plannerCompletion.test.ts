import {
  shouldFirePlannerCompleted,
  shouldResetPlannerCompletionGuard,
} from "../plannerCompletion";

describe("shouldFirePlannerCompleted — fire the celebration exactly once at 100", () => {
  const baseline = {
    percent: 100,
    hasPlanForThisCountry: true,
    isPaidUser: true,
    alreadyFired: false,
  };

  it("fires at the exact 100 boundary", () => {
    expect(shouldFirePlannerCompleted(baseline)).toBe(true);
  });

  it("does NOT fire at 99 (almost-done is not done)", () => {
    expect(shouldFirePlannerCompleted({ ...baseline, percent: 99 })).toBe(false);
  });

  it("does NOT fire at 0 (fresh planner)", () => {
    expect(shouldFirePlannerCompleted({ ...baseline, percent: 0 })).toBe(false);
  });

  it("does NOT fire at 101 (defensive — data should never overshoot)", () => {
    expect(shouldFirePlannerCompleted({ ...baseline, percent: 101 })).toBe(
      false,
    );
  });

  it("does NOT fire when the user has no plan for this country", () => {
    expect(
      shouldFirePlannerCompleted({ ...baseline, hasPlanForThisCountry: false }),
    ).toBe(false);
  });

  it("does NOT fire for free users (planner is Pro-only)", () => {
    expect(shouldFirePlannerCompleted({ ...baseline, isPaidUser: false })).toBe(
      false,
    );
  });

  it("does NOT fire if the celebration already ran since the last reset", () => {
    expect(shouldFirePlannerCompleted({ ...baseline, alreadyFired: true })).toBe(
      false,
    );
  });

  it("requires ALL conditions — having only the percent boundary is not enough", () => {
    expect(
      shouldFirePlannerCompleted({
        percent: 100,
        hasPlanForThisCountry: false,
        isPaidUser: false,
        alreadyFired: true,
      }),
    ).toBe(false);
  });
});

describe("shouldResetPlannerCompletionGuard — re-arm after the user drops below 100", () => {
  it("resets at 99", () => {
    expect(shouldResetPlannerCompletionGuard(99)).toBe(true);
  });

  it("resets at 0", () => {
    expect(shouldResetPlannerCompletionGuard(0)).toBe(true);
  });

  it("does NOT reset at exactly 100", () => {
    expect(shouldResetPlannerCompletionGuard(100)).toBe(false);
  });

  it("does NOT reset above 100 (defensive)", () => {
    expect(shouldResetPlannerCompletionGuard(101)).toBe(false);
  });
});
