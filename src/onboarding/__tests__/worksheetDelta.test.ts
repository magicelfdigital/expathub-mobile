import { summarizeDelta, type WorksheetDelta, type LevelCounts } from "../worksheetDelta";
import type { ReadinessLevel } from "@/src/data/quiz";

function counts(critical = 0, moderate = 0, explore = 0): LevelCounts {
  return { critical, moderate, explore };
}

function makeDelta(overrides: Partial<WorksheetDelta> = {}): WorksheetDelta {
  const base: WorksheetDelta = {
    worksheetId: "finances",
    dimension: "finances",
    previousScore: 10,
    previousMax: 20,
    previousReadinessLevel: "curious_explorer" as ReadinessLevel,
    previousCounts: counts(1, 1, 0),
    nextScore: 10,
    nextMax: 20,
    nextReadinessLevel: "curious_explorer" as ReadinessLevel,
    nextCounts: counts(1, 1, 0),
  };
  return { ...base, ...overrides };
}

describe("summarizeDelta", () => {
  it("returns 'up' tone with new percent in the title when the score increases", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 8,
        previousMax: 20,
        nextScore: 14,
        nextMax: 20,
        previousCounts: counts(2, 1, 0),
        nextCounts: counts(0, 1, 0),
      }),
    );

    expect(summary.tone).toBe("up");
    expect(summary.previousPct).toBe(40);
    expect(summary.nextPct).toBe(70);
    expect(summary.pctDelta).toBe(30);
    expect(summary.title).toBe("Your readiness moved from 40% to 70%");
    expect(summary.title).toContain("70%");
    expect(summary.blockersCleared).toEqual(counts(2, 0, 0));
    expect(summary.body).toBe("2 critical blockers cleared");
  });

  it("uses singular wording when exactly one blocker is cleared", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 10,
        previousMax: 20,
        nextScore: 15,
        nextMax: 20,
        previousCounts: counts(1, 1, 1),
        nextCounts: counts(0, 0, 0),
      }),
    );

    expect(summary.tone).toBe("up");
    expect(summary.body).toBe(
      "1 critical blocker cleared · 1 moderate blocker cleared · 1 explore item cleared",
    );
  });

  it("returns 'down' tone with calm, advisory copy when the score decreases", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 16,
        previousMax: 20,
        nextScore: 10,
        nextMax: 20,
        previousCounts: counts(0, 1, 0),
        nextCounts: counts(1, 1, 0),
      }),
    );

    expect(summary.tone).toBe("down");
    expect(summary.previousPct).toBe(80);
    expect(summary.nextPct).toBe(50);
    expect(summary.pctDelta).toBe(-30);
    expect(summary.title).toBe("Your readiness shifted from 80% to 50%");
    expect(summary.body).toBe(
      "An honest update sometimes lowers the score. That's a clearer picture, not a setback.",
    );
    expect(summary.body).not.toMatch(/!/);
    expect(summary.blockersCleared).toEqual(counts(0, 0, 0));
  });

  it("returns 'neutral' tone when the percent does not change", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 10,
        previousMax: 20,
        nextScore: 10,
        nextMax: 20,
        previousCounts: counts(1, 1, 0),
        nextCounts: counts(1, 1, 0),
      }),
    );

    expect(summary.tone).toBe("neutral");
    expect(summary.pctDelta).toBe(0);
    expect(summary.title).toBe("Worksheet saved");
    expect(summary.body).toBe(
      "Your readiness picture didn't shift this time. The added detail still sharpens your plan.",
    );
  });

  it("surfaces cleared blockers in the neutral body when score is unchanged but blockers shifted", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 10,
        previousMax: 20,
        nextScore: 10,
        nextMax: 20,
        previousCounts: counts(1, 0, 0),
        nextCounts: counts(0, 1, 0),
      }),
    );

    expect(summary.tone).toBe("neutral");
    expect(summary.body).toBe("1 critical blocker cleared");
  });

  it("reflects a bucket transition from curious_explorer to ready_to_plan in the body via cleared blockers", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 9,
        previousMax: 20,
        previousReadinessLevel: "curious_explorer",
        previousCounts: counts(2, 2, 1),
        nextScore: 19,
        nextMax: 20,
        nextReadinessLevel: "ready_to_plan",
        nextCounts: counts(0, 0, 0),
      }),
    );

    expect(summary.tone).toBe("up");
    expect(summary.previousPct).toBe(45);
    expect(summary.nextPct).toBe(95);
    expect(summary.title).toBe("Your readiness moved from 45% to 95%");
    expect(summary.blockersCleared).toEqual(counts(2, 2, 1));
    expect(summary.body).toBe(
      "2 critical blockers cleared · 2 moderate blockers cleared · 1 explore item cleared",
    );
  });

  it("reflects a bucket transition from serious_researcher down to curious_explorer with calm copy", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: 15,
        previousMax: 20,
        previousReadinessLevel: "serious_researcher",
        previousCounts: counts(0, 1, 1),
        nextScore: 9,
        nextMax: 20,
        nextReadinessLevel: "curious_explorer",
        nextCounts: counts(1, 2, 1),
      }),
    );

    expect(summary.tone).toBe("down");
    expect(summary.previousPct).toBe(75);
    expect(summary.nextPct).toBe(45);
    expect(summary.title).toBe("Your readiness shifted from 75% to 45%");
    expect(summary.body).toBe(
      "An honest update sometimes lowers the score. That's a clearer picture, not a setback.",
    );
  });

  it("clamps percentages and never produces negative cleared counts", () => {
    const summary = summarizeDelta(
      makeDelta({
        previousScore: -5,
        previousMax: 0,
        nextScore: 999,
        nextMax: 10,
        previousCounts: counts(0, 0, 0),
        nextCounts: counts(2, 1, 0),
      }),
    );

    expect(summary.previousPct).toBeGreaterThanOrEqual(0);
    expect(summary.nextPct).toBeLessThanOrEqual(100);
    expect(summary.blockersCleared).toEqual(counts(0, 0, 0));
  });
});
