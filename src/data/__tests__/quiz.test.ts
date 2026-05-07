import {
  MAX_SCORE,
  QUIZ_QUESTIONS,
  calculateQuizResult,
  getBlockers,
  getGapMessage,
  getReadinessLabel,
  hasFullGuide,
} from "../quiz";

describe("getReadinessLabel — boundary mapping", () => {
  it("returns just_getting_started at score 0 (0%)", () => {
    expect(getReadinessLabel(0).level).toBe("just_getting_started");
  });

  it("returns just_getting_started at the upper edge of the lowest tier (25%)", () => {
    // 25% of 16 = 4
    expect(getReadinessLabel(4).level).toBe("just_getting_started");
  });

  it("returns curious_explorer just above 25%", () => {
    expect(getReadinessLabel(5).level).toBe("curious_explorer");
  });

  it("returns curious_explorer at the upper edge of its tier (50%)", () => {
    expect(getReadinessLabel(8).level).toBe("curious_explorer");
  });

  it("returns serious_researcher just above 50%", () => {
    expect(getReadinessLabel(9).level).toBe("serious_researcher");
  });

  it("returns serious_researcher at the upper edge of its tier (75%)", () => {
    expect(getReadinessLabel(12).level).toBe("serious_researcher");
  });

  it("returns ready_to_plan above 75% and at MAX_SCORE", () => {
    expect(getReadinessLabel(13).level).toBe("ready_to_plan");
    expect(getReadinessLabel(MAX_SCORE).level).toBe("ready_to_plan");
  });

  it("clamps gracefully when score exceeds maxScore (treats as ready_to_plan)", () => {
    expect(getReadinessLabel(999).level).toBe("ready_to_plan");
  });

  it("treats negative scores as the lowest tier", () => {
    expect(getReadinessLabel(-5).level).toBe("just_getting_started");
  });

  it("treats undefined / NaN score as the lowest tier (defensive — never crashes on bad persisted data)", () => {
    expect(
      getReadinessLabel(undefined as unknown as number).level,
    ).toBe("just_getting_started");
    expect(getReadinessLabel(NaN).level).toBe("just_getting_started");
    // undefined maxScore must fall back to MAX_SCORE (16), not divide-by-undefined.
    expect(
      getReadinessLabel(8, undefined as unknown as number).level,
    ).toBe("curious_explorer");
  });

  it("falls back to MAX_SCORE when caller passes 0 or negative maxScore", () => {
    // 8 / 16 = 50% → curious_explorer
    expect(getReadinessLabel(8, 0).level).toBe("curious_explorer");
    expect(getReadinessLabel(8, -1).level).toBe("curious_explorer");
  });

  it("respects a custom maxScore when provided", () => {
    // 5 / 10 = 50% → curious_explorer
    expect(getReadinessLabel(5, 10).level).toBe("curious_explorer");
    // 8 / 10 = 80% → ready_to_plan
    expect(getReadinessLabel(8, 10).level).toBe("ready_to_plan");
  });

  it("populates a non-empty human-readable label and description for every tier", () => {
    for (const s of [0, 5, 9, 13]) {
      const r = getReadinessLabel(s);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});

function allYes(): Record<number, string> {
  const a: Record<number, string> = {};
  for (let i = 1; i <= 8; i++) a[i] = "yes";
  a[9] = "southern_europe";
  return a;
}

function allNo(): Record<number, string> {
  const a: Record<number, string> = {};
  for (let i = 1; i <= 8; i++) a[i] = "no";
  a[9] = "other";
  return a;
}

describe("calculateQuizResult", () => {
  it("returns score 0, tier dreaming, and lists every category as a risk when all answers are no", () => {
    const r = calculateQuizResult(allNo());
    expect(r.score).toBe(0);
    expect(r.tier).toBe("dreaming");
    expect(r.maxScore).toBe(MAX_SCORE);
    expect(r.readiness?.level).toBe("just_getting_started");
    // 8 yes/no questions → 8 risk categories
    expect(r.risks).toHaveLength(8);
  });

  it("returns the maximum score, tier ready, and no risks when all answers are yes", () => {
    const r = calculateQuizResult(allYes());
    expect(r.score).toBe(MAX_SCORE);
    expect(r.tier).toBe("ready");
    expect(r.readiness?.level).toBe("ready_to_plan");
    expect(r.risks).toHaveLength(0);
    expect(r.regionPreference).toBe("southern_europe");
  });

  it("treats missing answers as no (defensive default)", () => {
    const r = calculateQuizResult({});
    expect(r.score).toBe(0);
    expect(r.risks.length).toBeGreaterThan(0);
    // Region defaults to southern_europe when q9 is missing
    expect(r.regionPreference).toBe("southern_europe");
  });

  it("never returns a score above MAX_SCORE even with weighting noise", () => {
    const r = calculateQuizResult(allYes());
    expect(r.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it("scores half-yes / half-no answers deterministically and lands in the 'exploring' tier", () => {
    const a: Record<number, string> = { 9: "southern_europe" };
    // Even q → yes (2pts), odd q → no (0pts).
    for (let i = 1; i <= 8; i++) a[i] = i % 2 === 0 ? "yes" : "no";
    const r = calculateQuizResult(a);
    // Weighted yes points: q2 (2*1.5=3) + q4 (2*1=2) + q6 (2*1=2) + q8 (2*1=2) = 9
    // displayScore = round(9 / 19 * 16) = round(7.578) = 8
    // Tier: 6..11 → exploring.
    expect(r.score).toBe(8);
    expect(r.tier).toBe("exploring");
    expect(r.risks).toEqual([
      "Financial Cushion",
      "Visa Pathway",
      "Family Alignment",
      "Backup Plan",
    ]);
  });

  it("scores all-yes-except-one as 'ready' (q1 dropped to 'no')", () => {
    const a: Record<number, string> = { 9: "southern_europe" };
    for (let i = 1; i <= 8; i++) a[i] = "yes";
    a[1] = "no"; // drop a 1.5-weight question
    const r = calculateQuizResult(a);
    // Weighted raw = (q2..q8 yes) = 2*1.5 + 2*1.5 + 5*(2*1) = 16; q1=0.
    // displayScore = round(16 / 19 * 16) = round(13.47) = 13 → ready (>11).
    expect(r.score).toBe(13);
    expect(r.tier).toBe("ready");
    expect(r.risks).toEqual(["Financial Cushion"]);
  });

  it("scores all-yes-except-q8-somewhat as 'ready' (boundary above 11)", () => {
    const a: Record<number, string> = { 9: "southern_europe" };
    for (let i = 1; i <= 8; i++) a[i] = "yes";
    a[8] = "somewhat"; // drops from 2 to 1 at weight 1
    const r = calculateQuizResult(a);
    // Weighted raw = (q1..q7 yes) = 3*(2*1.5) + 4*(2*1) = 9 + 8 = 17;
    // q8 somewhat = 1*1 = 1; total = 18.
    // displayScore = round(18 / 19 * 16) = round(15.16) = 15 → ready.
    expect(r.score).toBe(15);
    expect(r.tier).toBe("ready");
    expect(r.risks).toEqual([]); // 'somewhat' is not a risk
  });

  it("scores all-not_sure answers as 'exploring' (mid-band)", () => {
    const a: Record<number, string> = { 9: "southern_europe" };
    for (let i = 1; i <= 8; i++) a[i] = "not_sure";
    const r = calculateQuizResult(a);
    // not_sure = 1pt; weightedRaw = (1*1.5)*3 + (1*1)*5 = 4.5 + 5 = 9.5
    // displayScore = round(9.5/19 * 16) = round(8) = 8 → exploring.
    expect(r.score).toBe(8);
    expect(r.tier).toBe("exploring");
    expect(r.risks).toEqual([]); // not_sure is not 'no'
  });
});

describe("getBlockers", () => {
  it("returns an empty array when every yes/no answer is yes", () => {
    expect(getBlockers(allYes())).toHaveLength(0);
  });

  it("returns one blocker per non-yes answer (8 max)", () => {
    expect(getBlockers(allNo())).toHaveLength(8);
  });

  it("attaches the original questionId to every blocker", () => {
    const blockers = getBlockers(allNo());
    for (const b of blockers) {
      expect(b.questionId).toBeGreaterThanOrEqual(1);
      expect(b.questionId).toBeLessThanOrEqual(8);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.firstAction.length).toBeGreaterThan(0);
    }
  });

  it("classifies 'no' answers as the highest-severity blocker level when one exists", () => {
    const blockers = getBlockers(allNo());
    const criticals = blockers.filter((b) => b.level === "critical");
    expect(criticals.length).toBeGreaterThan(0);
  });
});

describe("getGapMessage", () => {
  it("returns a no-gap message for an empty list", () => {
    expect(getGapMessage([])).toMatch(/no critical gaps/i);
  });

  it("names the single risk when there is exactly one", () => {
    expect(getGapMessage(["Visa Pathway"])).toContain("Visa Pathway");
  });

  it("names both risks when there are exactly two", () => {
    const msg = getGapMessage(["Visa Pathway", "Income Stability"]);
    expect(msg).toContain("Visa Pathway");
    expect(msg).toContain("Income Stability");
  });

  it("names the first risk when there are three or more", () => {
    const msg = getGapMessage(["A", "B", "C", "D"]);
    expect(msg).toContain("A");
  });
});

describe("hasFullGuide", () => {
  it("returns false for null/empty", () => {
    expect(hasFullGuide(null)).toBe(false);
    expect(hasFullGuide("")).toBe(false);
  });

  it("returns true for a known guide country", () => {
    expect(hasFullGuide("portugal")).toBe(true);
  });

  it("returns false for an unknown slug", () => {
    expect(hasFullGuide("atlantis")).toBe(false);
  });
});

describe("QUIZ_QUESTIONS shape", () => {
  it("contains exactly 9 questions, ids 1-9", () => {
    expect(QUIZ_QUESTIONS).toHaveLength(9);
    const ids = QUIZ_QUESTIONS.map((q) => q.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("question 9 is the region picker", () => {
    const q9 = QUIZ_QUESTIONS.find((q) => q.id === 9);
    expect(q9?.type).toBe("region");
  });
});
