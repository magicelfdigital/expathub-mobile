import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import {
  buildReadinessSubtitle,
  shouldRenderReadinessSection,
} from "../accountReadinessCard";
import type { QuizResult } from "../quiz";

const baseResult: QuizResult = {
  score: 8,
  maxScore: 16,
  regionPreference: "southern_europe",
  risks: [],
  blockers: [],
  readiness: {
    level: "curious_explorer",
    label: "Curious explorer",
    description: "desc",
  },
};

describe("shouldRenderReadinessSection", () => {
  it("returns false for null quizResult so account renders nothing", () => {
    expect(shouldRenderReadinessSection(null)).toBe(false);
  });

  it("returns false for undefined quizResult", () => {
    expect(shouldRenderReadinessSection(undefined)).toBe(false);
  });

  it("returns false when score is not a number (corrupted persistence)", () => {
    expect(
      shouldRenderReadinessSection({ ...baseResult, score: "8" as unknown as number }),
    ).toBe(false);
  });

  it("returns true for a complete quiz result", () => {
    expect(shouldRenderReadinessSection(baseResult)).toBe(true);
  });

  it("returns true for a score of 0 (the user truly answered everything 'no')", () => {
    expect(shouldRenderReadinessSection({ ...baseResult, score: 0 })).toBe(true);
  });
});

describe("buildReadinessSubtitle", () => {
  it("returns an empty string — the X/16 score string was removed in the 2026 redesign", () => {
    expect(buildReadinessSubtitle(baseResult)).toBe("");
    expect(buildReadinessSubtitle({ ...baseResult, score: 16 })).toBe("");
  });
});

describe("account.tsx — readiness section visual contract", () => {
  // Belt-and-braces: scan the raw screen source so future regressions that
  // re-introduce a "/16" or "/MAX_SCORE" template are caught at CI.
  const accountPath = resolve(__dirname, "../../../app/account.tsx");

  it("the account screen file exists at the expected path", () => {
    expect(existsSync(accountPath)).toBe(true);
  });

  it("does not contain a `/16` literal in the readiness card area", () => {
    const src = readFileSync(accountPath, "utf8");
    // We allow the literal `MAX_SCORE` import but forbid printing `/16` or
    // `${score}/${qrMax}` anywhere — those are the patterns the redesign
    // dropped.
    expect(src).not.toMatch(/\$\{[^}]*score[^}]*\}\s*\/\s*\$\{[^}]*qr?Max/);
    expect(src).not.toMatch(/score[^}\n]{0,40}\/\s*16\b/);
  });

  it("uses the centralized helpers (refactor anchor)", () => {
    const src = readFileSync(accountPath, "utf8");
    expect(src).toContain("getReadinessBadgeColor");
    expect(src).toContain("getReadinessFillPercent");
  });
});
