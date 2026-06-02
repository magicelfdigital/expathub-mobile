import {
  QUIZ_SAVE_PROMPT_HEALTH_CONFIG,
  computeQuizSavePromptHealth,
  evaluateQuizSavePromptHealth,
  unavailableQuizSavePromptHealthSnapshot,
  type QuizSavePromptDailyCount,
} from "../quizSavePromptHealth";
import { resetQuizSaveAnalyticsEnsureCache } from "../quizSaveAnalytics";

// Build an ascending daily series: `trailing` are the baseline days
// (oldest-first) and `today` is the most recent complete day appended last.
function series(
  trailing: number[],
  today: number,
): QuizSavePromptDailyCount[] {
  const out: QuizSavePromptDailyCount[] = trailing.map((shown, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    shown,
  }));
  out.push({ date: "2026-05-31", shown: today });
  return out;
}

describe("evaluateQuizSavePromptHealth", () => {
  it("is healthy when the evaluated day is in line with the trailing median", () => {
    const snap = evaluateQuizSavePromptHealth(
      series([10, 12, 9, 11, 10, 13, 8], 11),
    );
    expect(snap.healthy).toBe(true);
    expect(snap.reason).toBe("ok");
    expect(snap.trailing.median).toBe(10);
    expect(snap.evaluated_day.shown).toBe(11);
  });

  it("flags zero_today when the prompt went silent against a non-zero baseline", () => {
    const snap = evaluateQuizSavePromptHealth(
      series([10, 12, 9, 11, 10, 13, 8], 0),
    );
    expect(snap.healthy).toBe(false);
    expect(snap.reason).toBe("zero_today");
  });

  it("flags below_median_floor when the day falls well below the median", () => {
    // median = 10, floor = 10 * 0.4 = 4. A count of 3 is below the floor.
    const snap = evaluateQuizSavePromptHealth(
      series([10, 12, 9, 11, 10, 13, 8], 3),
    );
    expect(snap.healthy).toBe(false);
    expect(snap.reason).toBe("below_median_floor");
    expect(snap.trailing.floor).toBeCloseTo(4);
  });

  it("stays healthy when the day is at or above the median floor", () => {
    // median = 10, floor = 4. A count of 4 is not below the floor.
    const snap = evaluateQuizSavePromptHealth(
      series([10, 12, 9, 11, 10, 13, 8], 4),
    );
    expect(snap.healthy).toBe(true);
    expect(snap.reason).toBe("ok");
  });

  it("treats a zero baseline as insufficient_baseline (no false page on quiet envs)", () => {
    const snap = evaluateQuizSavePromptHealth(
      series([0, 0, 0, 0, 0, 0, 0], 0),
    );
    expect(snap.healthy).toBe(true);
    expect(snap.reason).toBe("insufficient_baseline");
  });

  it("treats an empty series as insufficient_baseline", () => {
    const snap = evaluateQuizSavePromptHealth([]);
    expect(snap.healthy).toBe(true);
    expect(snap.reason).toBe("insufficient_baseline");
    expect(snap.evaluated_day.date).toBeNull();
  });

  it("computes an even-length median as the average of the two middle values", () => {
    // trailing = [2, 4, 6, 8] → sorted middle = (4 + 6) / 2 = 5
    const snap = evaluateQuizSavePromptHealth(series([2, 4, 6, 8], 5));
    expect(snap.trailing.median).toBe(5);
  });

  it("honours a custom floor ratio passed in config", () => {
    // median = 10, floorRatio 0.8 → floor 8. A count of 7 is now below.
    const snap = evaluateQuizSavePromptHealth(
      series([10, 10, 10, 10, 10, 10, 10], 7),
      { ...QUIZ_SAVE_PROMPT_HEALTH_CONFIG, floorRatio: 0.8 },
    );
    expect(snap.healthy).toBe(false);
    expect(snap.reason).toBe("below_median_floor");
  });

  it("defaults to the result_screen placement and a 7-day window", () => {
    expect(QUIZ_SAVE_PROMPT_HEALTH_CONFIG.placement).toBe("result_screen");
    expect(QUIZ_SAVE_PROMPT_HEALTH_CONFIG.trailingDays).toBe(7);
  });
});

describe("unavailableQuizSavePromptHealthSnapshot", () => {
  it("reports unhealthy with reason probe_unavailable", () => {
    const snap = unavailableQuizSavePromptHealthSnapshot();
    expect(snap.healthy).toBe(false);
    expect(snap.reason).toBe("probe_unavailable");
  });
});

describe("computeQuizSavePromptHealth", () => {
  beforeEach(() => {
    resetQuizSaveAnalyticsEnsureCache();
  });

  it("queries for the configured placement over trailingDays + 1 days and evaluates the result", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const pool = {
      query: jest.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values: values ?? [] });
        // The ensure-table migrations return nothing; only the daily-count
        // SELECT returns rows. Detect it by the placement parameter.
        if (text.includes("FROM quiz_save_events") && text.includes("days")) {
          return {
            rows: [
              { date: "2026-05-24", shown: 10 },
              { date: "2026-05-25", shown: 12 },
              { date: "2026-05-26", shown: 9 },
              { date: "2026-05-27", shown: 11 },
              { date: "2026-05-28", shown: 10 },
              { date: "2026-05-29", shown: 13 },
              { date: "2026-05-30", shown: 8 },
              { date: "2026-05-31", shown: 0 },
            ],
          };
        }
        return { rows: [] };
      }),
    } as any;

    const snap = await computeQuizSavePromptHealth(pool);
    expect(snap.reason).toBe("zero_today");
    expect(snap.healthy).toBe(false);

    const dailyQuery = queries.find(
      (q) => Array.isArray(q.values) && q.values.length === 2,
    );
    expect(dailyQuery).toBeDefined();
    // [trailingDays + 1, placement]
    expect(dailyQuery!.values[0]).toBe(
      QUIZ_SAVE_PROMPT_HEALTH_CONFIG.trailingDays + 1,
    );
    expect(dailyQuery!.values[1]).toBe("result_screen");
  });
});
