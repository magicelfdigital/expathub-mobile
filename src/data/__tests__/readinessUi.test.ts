import {
  deriveReadinessCard,
  getReadinessBadgeColor,
  getReadinessFillPercent,
} from "../readinessUi";
import { getReadinessLabel } from "../quiz";
import { tokens } from "@/theme/tokens";

describe("getReadinessBadgeColor", () => {
  it("returns teal for ready_to_plan", () => {
    expect(getReadinessBadgeColor("ready_to_plan")).toBe(tokens.color.teal);
  });

  it("returns teal for serious_researcher (the second-best tier)", () => {
    expect(getReadinessBadgeColor("serious_researcher")).toBe(tokens.color.teal);
  });

  it("returns brand primary for curious_explorer", () => {
    expect(getReadinessBadgeColor("curious_explorer")).toBe(tokens.color.primary);
  });

  it("returns the muted slate-grey for just_getting_started", () => {
    // The slate fallback signals "low readiness" — exact value matters for
    // visual regression so it's pinned.
    expect(getReadinessBadgeColor("just_getting_started")).toBe("#9BA8C0");
  });
});

describe("getReadinessFillPercent", () => {
  it("returns 0 for score=0", () => {
    expect(getReadinessFillPercent(0, 16)).toBe(0);
  });

  it("returns 100 for score=maxScore", () => {
    expect(getReadinessFillPercent(16, 16)).toBe(100);
  });

  it("returns 50 for score at halfway", () => {
    expect(getReadinessFillPercent(8, 16)).toBe(50);
  });

  it("clamps a score above max to 100 (never overflows the bar)", () => {
    expect(getReadinessFillPercent(20, 16)).toBe(100);
  });

  it("clamps a negative score to 0 (never underflows the bar)", () => {
    expect(getReadinessFillPercent(-5, 16)).toBe(0);
  });

  it("falls back to a maxScore of 1 when given 0 (never divides by zero)", () => {
    // score=0 / safeMax=1 → 0; score=1 / safeMax=1 → 100. We assert both
    // branches don't throw and return finite numbers in the valid range.
    expect(getReadinessFillPercent(0, 0)).toBe(0);
    expect(getReadinessFillPercent(1, 0)).toBe(100);
    expect(getReadinessFillPercent(50, -3)).toBe(100);
  });
});

describe("deriveReadinessCard", () => {
  it("composes badge color + fill % + label for a 'ready_to_plan' result", () => {
    const r = deriveReadinessCard(15, 16, getReadinessLabel(15, 16));
    expect(r.level).toBe("ready_to_plan");
    expect(r.badgeColor).toBe(tokens.color.teal);
    expect(r.fillPercent).toBeCloseTo(93.75, 5);
    expect(r.label).toBe("Ready to plan");
  });

  it("composes badge color + fill % for a 'just_getting_started' result", () => {
    const r = deriveReadinessCard(2, 16, getReadinessLabel(2, 16));
    expect(r.level).toBe("just_getting_started");
    expect(r.badgeColor).toBe("#9BA8C0");
    expect(r.fillPercent).toBe(12.5);
  });

  it("uses the brand primary for 'curious_explorer' (between 25% and 50%)", () => {
    const r = deriveReadinessCard(7, 16, getReadinessLabel(7, 16));
    expect(r.level).toBe("curious_explorer");
    expect(r.badgeColor).toBe(tokens.color.primary);
  });

  it("derives card from legacy persisted result missing readiness label", () => {
    // Mirrors `quizResult.readiness ?? getReadinessLabel(...)` fallback in
    // the account screen for users with old persisted quiz state.
    const fallbackLabel = getReadinessLabel(12, 16);
    const r = deriveReadinessCard(12, 16, fallbackLabel);
    expect(r.level).toBe("serious_researcher");
    expect(r.badgeColor).toBe(tokens.color.teal);
    expect(r.fillPercent).toBe(75);
  });
});
