import {
  buildQuizAnsweredPayload,
  decideQuizAdvance,
  SAVE_PROMPT_NO_THRESHOLD,
  SAVE_PROMPT_TRIGGER_INDEX,
  shouldDeferAdvanceForTimeline,
  shouldFireAbandonment,
  TIMELINE_QUESTION_ID,
} from "../quizFlow";

const TOTAL = 10;

describe("decideQuizAdvance — branch matrix", () => {
  it("returns 'next' from the first question regardless of answers", () => {
    const r = decideQuizAdvance({
      currentIndex: 0,
      total: TOTAL,
      answers: { 1: "no" },
      savePromptAlreadyShown: false,
    });
    expect(r).toEqual({ kind: "next" });
  });

  it("returns 'finish' on the last question", () => {
    const r = decideQuizAdvance({
      currentIndex: TOTAL - 1,
      total: TOTAL,
      answers: { 1: "yes", 2: "no", 3: "yes" },
      savePromptAlreadyShown: false,
    });
    expect(r).toEqual({ kind: "finish" });
  });

  it("returns 'save_prompt' at trigger index when noCount >= threshold and prompt not yet shown", () => {
    const answers: Record<number, string> = { 1: "no", 2: "no", 3: "no" };
    const r = decideQuizAdvance({
      currentIndex: SAVE_PROMPT_TRIGGER_INDEX,
      total: TOTAL,
      answers,
      savePromptAlreadyShown: false,
    });
    expect(r).toEqual({ kind: "save_prompt", noCount: 3 });
  });

  it("returns 'next' at trigger index when noCount is exactly threshold-1 (boundary)", () => {
    const answers: Record<number, string> = { 1: "no", 2: "no" };
    expect(answers && Object.values(answers).filter((v) => v === "no").length).toBe(
      SAVE_PROMPT_NO_THRESHOLD - 1,
    );
    const r = decideQuizAdvance({
      currentIndex: SAVE_PROMPT_TRIGGER_INDEX,
      total: TOTAL,
      answers,
      savePromptAlreadyShown: false,
    });
    expect(r).toEqual({ kind: "next" });
  });

  it("returns 'next' at trigger index when prompt was already shown (no double-fire)", () => {
    const answers: Record<number, string> = { 1: "no", 2: "no", 3: "no", 4: "no" };
    const r = decideQuizAdvance({
      currentIndex: SAVE_PROMPT_TRIGGER_INDEX,
      total: TOTAL,
      answers,
      savePromptAlreadyShown: true,
    });
    expect(r).toEqual({ kind: "next" });
  });

  it("does NOT return 'save_prompt' at non-trigger indices, even with many no's", () => {
    const answers: Record<number, string> = { 1: "no", 2: "no", 3: "no", 4: "no", 5: "no" };
    expect(
      decideQuizAdvance({
        currentIndex: SAVE_PROMPT_TRIGGER_INDEX - 1,
        total: TOTAL,
        answers,
        savePromptAlreadyShown: false,
      }),
    ).toEqual({ kind: "next" });
    expect(
      decideQuizAdvance({
        currentIndex: SAVE_PROMPT_TRIGGER_INDEX + 1,
        total: TOTAL,
        answers,
        savePromptAlreadyShown: false,
      }),
    ).toEqual({ kind: "next" });
  });

  it("counts only literal 'no' answers — 'somewhat'/'not_sure'/'yes' are ignored", () => {
    const answers: Record<number, string> = {
      1: "yes",
      2: "somewhat",
      3: "not_sure",
      4: "no",
      5: "no",
      6: "yes",
    };
    expect(
      decideQuizAdvance({
        currentIndex: SAVE_PROMPT_TRIGGER_INDEX,
        total: TOTAL,
        answers,
        savePromptAlreadyShown: false,
      }),
    ).toEqual({ kind: "next" });
  });
});

describe("shouldFireAbandonment — duplicate suppression + boundaries", () => {
  it("does not fire when the user has answered 0 questions (they bounced before starting)", () => {
    expect(
      shouldFireAbandonment({ answeredCount: 0, total: TOTAL, completed: false }),
    ).toBe(false);
  });

  it("does not fire when the user already completed the quiz (avoids duplicate event)", () => {
    expect(
      shouldFireAbandonment({ answeredCount: TOTAL, total: TOTAL, completed: true }),
    ).toBe(false);
  });

  it("does not fire when answeredCount equals total even if `completed` flag is false (race-safe)", () => {
    expect(
      shouldFireAbandonment({ answeredCount: TOTAL, total: TOTAL, completed: false }),
    ).toBe(false);
  });

  it("fires when at least one question was answered and the user did not complete", () => {
    expect(
      shouldFireAbandonment({ answeredCount: 1, total: TOTAL, completed: false }),
    ).toBe(true);
    expect(
      shouldFireAbandonment({ answeredCount: TOTAL - 1, total: TOTAL, completed: false }),
    ).toBe(true);
  });
});

describe("buildQuizAnsweredPayload", () => {
  it("preserves all four expected fields exactly as the screen forwards them", () => {
    expect(
      buildQuizAnsweredPayload({
        questionId: 3,
        questionIndex: 2,
        category: "Finances",
        answer: "somewhat",
      }),
    ).toEqual({
      questionId: 3,
      questionIndex: 2,
      category: "Finances",
      answer: "somewhat",
    });
  });
});

describe("shouldDeferAdvanceForTimeline", () => {
  it("returns true ONLY for the timeline question (Q8)", () => {
    expect(shouldDeferAdvanceForTimeline(TIMELINE_QUESTION_ID)).toBe(true);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      expect(shouldDeferAdvanceForTimeline(id)).toBe(false);
    }
  });
});
