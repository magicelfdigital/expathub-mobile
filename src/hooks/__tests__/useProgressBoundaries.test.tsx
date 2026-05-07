import {
  computePercentFromCompletedIds,
  GENERIC_PLAN_STEPS,
} from "@/src/data/planSteps";

/**
 * `useProgress` is a thin wrapper around React Query + a POST mutation +
 * `computePercentFromCompletedIds`. The pure boundary math is exercised
 * here so the percent rendered by `useProgressPercent` is correct at the
 * 0/middle/all/duplicate/unknown boundaries that the hook surfaces.
 *
 * The auto-completion trigger that fires planner_step_completed is
 * separately tested in `src/hooks/__tests__/useAutoCompletePlannerSteps.test.tsx`.
 */

const TOTAL = GENERIC_PLAN_STEPS.length;
const ALL_IDS = GENERIC_PLAN_STEPS.map((s) => s.id);

describe("useProgress percent boundaries (via computePercentFromCompletedIds)", () => {
  it("0 completed steps → 0%", () => {
    expect(computePercentFromCompletedIds([])).toBe(0);
  });

  it("ALL completed steps → exactly 100%", () => {
    expect(computePercentFromCompletedIds(ALL_IDS)).toBe(100);
  });

  it("single-step completion rounds to nearest int and never exceeds 100", () => {
    const p = computePercentFromCompletedIds([ALL_IDS[0]]);
    expect(p).toBe(Math.round((1 / TOTAL) * 100));
    expect(p).toBeLessThan(100);
    expect(p).toBeGreaterThan(0);
  });

  it("duplicates of a single id do not double-count toward percent", () => {
    const dupId = ALL_IDS[0];
    const single = computePercentFromCompletedIds([dupId]);
    const tripled = computePercentFromCompletedIds([dupId, dupId, dupId]);
    expect(tripled).toBe(single);
  });

  it("unknown step IDs are ignored entirely (defensive vs stale persisted progress)", () => {
    expect(
      computePercentFromCompletedIds(["does-not-exist", "neither-do-i"]),
    ).toBe(0);
  });

  it("mixing N real ids + M unknown ids reports percent for only the N real ones", () => {
    const real = ALL_IDS.slice(0, 2);
    const mixed = [...real, "fake-1", "fake-2"];
    expect(computePercentFromCompletedIds(mixed)).toBe(
      computePercentFromCompletedIds(real),
    );
  });
});
