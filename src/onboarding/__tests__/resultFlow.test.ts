import {
  buildLeadSavePayload,
  buildResultCtaPayload,
  deriveResultFirstName,
  getResultFillPercent,
  groupBlockersByLevel,
  isValidResultEmail,
  shouldShowPaywallAfterUrgent,
} from "../resultFlow";
import type { Blocker } from "@/src/data/quiz";

function blocker(level: Blocker["level"], questionId = 1): Blocker {
  return {
    level,
    questionId,
    title: `t${questionId}`,
    whatThisMeans: "what",
    firstAction: "do",
    guideMeLabel: "guide",
  };
}

describe("isValidResultEmail — lead-save gate", () => {
  it("accepts a normal RFC-shaped email", () => {
    expect(isValidResultEmail("a@b.co")).toBe(true);
  });

  it("rejects empty / whitespace / null / undefined", () => {
    expect(isValidResultEmail("")).toBe(false);
    expect(isValidResultEmail("   ")).toBe(false);
    expect(isValidResultEmail(null)).toBe(false);
    expect(isValidResultEmail(undefined)).toBe(false);
  });

  it("rejects strings without an @ or without a TLD", () => {
    expect(isValidResultEmail("not-an-email")).toBe(false);
    expect(isValidResultEmail("a@b")).toBe(false);
    expect(isValidResultEmail("a@b.")).toBe(false);
    expect(isValidResultEmail("@b.co")).toBe(false);
  });

  it("rejects strings containing whitespace inside", () => {
    expect(isValidResultEmail("a b@c.co")).toBe(false);
    expect(isValidResultEmail("a@b .co")).toBe(false);
  });
});

describe("getResultFillPercent — bar math + zero guard", () => {
  it("returns 0 for score=0", () => {
    expect(getResultFillPercent(0, 16)).toBe(0);
  });

  it("returns 100 for score=maxScore", () => {
    expect(getResultFillPercent(16, 16)).toBe(100);
  });

  it("clamps overflow scores to 100 and underflow to 0", () => {
    expect(getResultFillPercent(20, 16)).toBe(100);
    expect(getResultFillPercent(-5, 16)).toBe(0);
  });

  it("guards divide-by-zero when maxScore is 0", () => {
    expect(getResultFillPercent(1, 0)).toBe(100);
    expect(getResultFillPercent(0, 0)).toBe(0);
  });
});

describe("groupBlockersByLevel + shouldShowPaywallAfterUrgent", () => {
  it("groups by level and preserves insertion order within each level", () => {
    const blockers = [
      blocker("explore", 1),
      blocker("critical", 2),
      blocker("explore", 3),
      blocker("moderate", 4),
      blocker("critical", 5),
    ];
    const g = groupBlockersByLevel(blockers);
    expect(g.critical.map((b) => b.questionId)).toEqual([2, 5]);
    expect(g.moderate.map((b) => b.questionId)).toEqual([4]);
    expect(g.explore.map((b) => b.questionId)).toEqual([1, 3]);
  });

  it("paywall CTA is suppressed when zero urgent blockers", () => {
    expect(shouldShowPaywallAfterUrgent([])).toBe(false);
    expect(shouldShowPaywallAfterUrgent([blocker("explore")])).toBe(false);
  });

  it("paywall CTA shows when there is ANY critical or moderate blocker", () => {
    expect(shouldShowPaywallAfterUrgent([blocker("critical")])).toBe(true);
    expect(shouldShowPaywallAfterUrgent([blocker("moderate")])).toBe(true);
    expect(
      shouldShowPaywallAfterUrgent([blocker("explore"), blocker("moderate")]),
    ).toBe(true);
  });
});

describe("buildResultCtaPayload — CTA-specific quiz_completed payloads", () => {
  it("builds the create_account payload", () => {
    expect(
      buildResultCtaPayload({
        action: "create_account",
        readinessLevel: "ready_to_plan",
        score: 15,
      }),
    ).toEqual({ readiness_level: "ready_to_plan", score: 15, action: "create_account" });
  });

  it("builds the continue payload (skipped account)", () => {
    expect(
      buildResultCtaPayload({
        action: "continue",
        readinessLevel: "curious_explorer",
        score: 7,
      }),
    ).toEqual({ readiness_level: "curious_explorer", score: 7, action: "continue" });
  });
});

describe("buildLeadSavePayload", () => {
  it("contains exactly the readiness_level + score fields (no PII like email)", () => {
    const payload = buildLeadSavePayload({
      readinessLevel: "serious_researcher",
      score: 12,
    });
    expect(payload).toEqual({ readiness_level: "serious_researcher", score: 12 });
    expect(Object.keys(payload).sort()).toEqual(["readiness_level", "score"]);
  });
});

describe("deriveResultFirstName — personalized paywall name fallback chain", () => {
  it("prefers explicit `firstName` answer", () => {
    expect(
      deriveResultFirstName({ answers: { firstName: "Sam" }, userEmail: "x@y.co" }),
    ).toBe("Sam");
  });

  it("falls back to legacy `first_name` snake_case key", () => {
    expect(
      deriveResultFirstName({
        answers: { first_name: "Alex" },
        userEmail: "x@y.co",
      }),
    ).toBe("Alex");
  });

  it("trims whitespace around an explicit first name", () => {
    expect(
      deriveResultFirstName({ answers: { firstName: "  Sam  " }, userEmail: null }),
    ).toBe("Sam");
  });

  it("treats whitespace-only firstName as missing and falls back to email local-part", () => {
    expect(
      deriveResultFirstName({ answers: { firstName: "   " }, userEmail: "alex@example.com" }),
    ).toBe("alex");
  });

  it("falls back to email local-part when no name answers are present", () => {
    expect(
      deriveResultFirstName({ answers: {}, userEmail: "ada@lovelace.io" }),
    ).toBe("ada");
  });

  it("returns null when nothing usable is available", () => {
    expect(deriveResultFirstName({ answers: {}, userEmail: null })).toBeNull();
    expect(deriveResultFirstName({ answers: {}, userEmail: undefined })).toBeNull();
  });

  it("ignores non-string firstName (defensive against malformed JSON answers)", () => {
    expect(
      deriveResultFirstName({
        answers: { firstName: 123 as unknown as string },
        userEmail: "fallback@x.co",
      }),
    ).toBe("fallback");
  });
});
