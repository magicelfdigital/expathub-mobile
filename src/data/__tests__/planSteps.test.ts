import {
  GENERIC_PLAN_STEPS,
  computePercentFromCompletedIds,
  getCompletedStepCount,
  getProgressPercent,
} from "../planSteps";

describe("computePercentFromCompletedIds", () => {
  it("is also exported under the alias getProgressPercent", () => {
    expect(getProgressPercent).toBe(computePercentFromCompletedIds);
  });

  it("returns 0 when no steps are completed", () => {
    expect(computePercentFromCompletedIds([])).toBe(0);
  });

  it("returns 100 when all generic steps are completed", () => {
    const allIds = GENERIC_PLAN_STEPS.map((s) => s.id);
    expect(computePercentFromCompletedIds(allIds)).toBe(100);
  });

  it("returns a partial percentage rounded to the nearest integer", () => {
    const total = GENERIC_PLAN_STEPS.length;
    const half = GENERIC_PLAN_STEPS.slice(0, Math.floor(total / 2)).map(
      (s) => s.id,
    );
    const expected = Math.round((half.length / total) * 100);
    expect(computePercentFromCompletedIds(half)).toBe(expected);
  });

  it("ignores unknown step IDs", () => {
    expect(
      computePercentFromCompletedIds(["not_a_real_step", "neither_is_this"]),
    ).toBe(0);
  });

  it("does not double-count duplicate IDs and ignores unknown ones mixed in", () => {
    const firstId = GENERIC_PLAN_STEPS[0].id;
    const total = GENERIC_PLAN_STEPS.length;
    const expected = Math.round((1 / total) * 100);
    expect(
      computePercentFromCompletedIds([firstId, firstId, "bogus"]),
    ).toBe(expected);
  });
});

describe("getCompletedStepCount", () => {
  it("returns 0 with no IDs", () => {
    expect(getCompletedStepCount([])).toBe(0);
  });

  it("counts only known generic step IDs", () => {
    const known = GENERIC_PLAN_STEPS[0].id;
    expect(getCompletedStepCount([known, "unknown"])).toBe(1);
  });

  it("counts every generic step when all are present", () => {
    const allIds = GENERIC_PLAN_STEPS.map((s) => s.id);
    expect(getCompletedStepCount(allIds)).toBe(GENERIC_PLAN_STEPS.length);
  });
});
