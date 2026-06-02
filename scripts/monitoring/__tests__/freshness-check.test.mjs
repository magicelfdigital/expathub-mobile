import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  getGateThresholdDays,
  findReleaseBlockingBriefs,
  classify,
  buildReport,
  renderIssueBody,
  githubOutputLines,
  extractBriefs,
} from "../freshness-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_BRIEFS_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "src",
  "data",
  "decisionBriefs.ts",
);

// A fixed reference "now" so age computations are deterministic.
const NOW = Date.parse("2026-06-01T00:00:00Z");
const DAY_MS = 1000 * 60 * 60 * 24;

// Helper: build a brief whose lastReviewedAt lands exactly `ageDays` before NOW.
function briefAged(id, ageDays, extra = {}) {
  const reviewed = new Date(NOW - ageDays * DAY_MS).toISOString().slice(0, 10);
  return { id, lastReviewedAt: reviewed, ...extra };
}

describe("getGateThresholdDays", () => {
  it("defaults to 180 days when the env var is unset", () => {
    assert.equal(getGateThresholdDays({}), 180);
  });

  it("defaults to 180 days when the env var is empty or whitespace", () => {
    assert.equal(getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: "" }), 180);
    assert.equal(
      getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: "   " }),
      180,
    );
  });

  it("uses BRIEF_FRESHNESS_GATE_DAYS to override the default", () => {
    assert.equal(getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: "90" }), 90);
    assert.equal(
      getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: "365" }),
      365,
    );
  });

  it("floors fractional overrides to whole days", () => {
    assert.equal(
      getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: "200.9" }),
      200,
    );
  });

  it("throws on non-numeric, zero, or negative overrides", () => {
    for (const raw of ["abc", "0", "-5", "NaN", "Infinity"]) {
      assert.throws(
        () => getGateThresholdDays({ BRIEF_FRESHNESS_GATE_DAYS: raw }),
        /Invalid BRIEF_FRESHNESS_GATE_DAYS/,
        `expected "${raw}" to throw`,
      );
    }
  });
});

describe("findReleaseBlockingBriefs", () => {
  function makeReport(allBriefs) {
    return { allBriefs };
  }

  it("flags only briefs older than the threshold", () => {
    const report = makeReport([
      { id: "fresh", ageDays: 30 },
      { id: "at-threshold", ageDays: 180 },
      { id: "stale", ageDays: 200 },
    ]);
    const blocking = findReleaseBlockingBriefs(report, 180);
    assert.deepEqual(
      blocking.map((b) => b.id),
      ["stale"],
    );
  });

  it("treats briefs at exactly the threshold as not blocking", () => {
    const report = makeReport([{ id: "at-threshold", ageDays: 180 }]);
    assert.deepEqual(findReleaseBlockingBriefs(report, 180), []);
  });

  it("flags briefs with invalid (null age) dates as blocking", () => {
    const report = makeReport([
      { id: "fresh", ageDays: 10 },
      { id: "invalid-date", ageDays: null },
    ]);
    const blocking = findReleaseBlockingBriefs(report, 180);
    assert.deepEqual(
      blocking.map((b) => b.id),
      ["invalid-date"],
    );
  });

  it("sorts blocking briefs oldest first, with invalid dates ahead of all", () => {
    const report = makeReport([
      { id: "stale-200", ageDays: 200 },
      { id: "invalid-date", ageDays: null },
      { id: "stale-500", ageDays: 500 },
      { id: "fresh", ageDays: 5 },
    ]);
    const blocking = findReleaseBlockingBriefs(report, 180);
    assert.deepEqual(
      blocking.map((b) => b.id),
      ["invalid-date", "stale-500", "stale-200"],
    );
  });

  it("returns an empty array when nothing exceeds the threshold", () => {
    const report = makeReport([
      { id: "fresh-a", ageDays: 10 },
      { id: "fresh-b", ageDays: 50 },
    ]);
    assert.deepEqual(findReleaseBlockingBriefs(report, 180), []);
  });

  it("respects a custom (lower) threshold", () => {
    const report = makeReport([
      { id: "a", ageDays: 70 },
      { id: "b", ageDays: 100 },
    ]);
    const blocking = findReleaseBlockingBriefs(report, 60);
    assert.deepEqual(
      blocking.map((b) => b.id),
      ["b", "a"],
    );
  });
});

describe("classify", () => {
  it("returns 'invalid' for a null age (unparseable date)", () => {
    assert.equal(classify(null), "invalid");
  });

  it("returns 'fresh' at or below the 60-day warn threshold", () => {
    assert.equal(classify(0), "fresh");
    assert.equal(classify(59), "fresh");
    assert.equal(classify(60), "fresh");
  });

  it("returns 'warn' between 60 (exclusive) and 90 (inclusive) days", () => {
    assert.equal(classify(61), "warn");
    assert.equal(classify(75), "warn");
    assert.equal(classify(90), "warn");
  });

  it("returns 'stale' above the 90-day stale threshold", () => {
    assert.equal(classify(91), "stale");
    assert.equal(classify(365), "stale");
  });
});

describe("buildReport", () => {
  it("buckets briefs into stale / warn / fresh / invalid by age", () => {
    const briefs = [
      briefAged("fresh", 10),
      briefAged("warn", 75),
      briefAged("stale", 120),
      { id: "invalid", lastReviewedAt: "not-a-date" },
    ];
    const report = buildReport(briefs, NOW);

    assert.equal(report.totalBriefs, 4);
    assert.deepEqual(
      report.staleBriefs.map((b) => b.id),
      ["stale"],
    );
    assert.deepEqual(
      report.warnBriefs.map((b) => b.id),
      ["warn"],
    );
    assert.deepEqual(
      report.invalidBriefs.map((b) => b.id),
      ["invalid"],
    );
  });

  it("sorts stale and warn buckets oldest-first", () => {
    const briefs = [
      briefAged("stale-100", 100),
      briefAged("stale-300", 300),
      briefAged("stale-150", 150),
      briefAged("warn-65", 65),
      briefAged("warn-88", 88),
    ];
    const report = buildReport(briefs, NOW);

    assert.deepEqual(
      report.staleBriefs.map((b) => b.id),
      ["stale-300", "stale-150", "stale-100"],
    );
    assert.deepEqual(
      report.warnBriefs.map((b) => b.id),
      ["warn-88", "warn-65"],
    );
  });

  it("computes ageDays relative to the supplied now and exposes thresholds", () => {
    const report = buildReport([briefAged("b", 95)], NOW);
    assert.equal(report.allBriefs[0].ageDays, 95);
    assert.equal(report.allBriefs[0].status, "stale");
    assert.equal(report.staleThresholdDays, 90);
    assert.equal(report.warnThresholdDays, 60);
    assert.equal(report.generatedAt, new Date(NOW).toISOString());
  });

  it("returns empty buckets when every brief is fresh", () => {
    const report = buildReport(
      [briefAged("a", 1), briefAged("b", 30), briefAged("c", 60)],
      NOW,
    );
    assert.equal(report.staleBriefs.length, 0);
    assert.equal(report.warnBriefs.length, 0);
    assert.equal(report.invalidBriefs.length, 0);
    assert.equal(report.totalBriefs, 3);
  });

  it("carries country/pathway metadata through onto each enriched brief", () => {
    const report = buildReport(
      [briefAged("pt-d7", 120, { countrySlug: "portugal", pathwayKey: "d7" })],
      NOW,
    );
    const [b] = report.staleBriefs;
    assert.equal(b.countrySlug, "portugal");
    assert.equal(b.pathwayKey, "d7");
  });
});

describe("githubOutputLines", () => {
  it("emits has_stale=true with counts matching the stale/warn sets", () => {
    const report = buildReport(
      [briefAged("s1", 120), briefAged("s2", 200), briefAged("w1", 70)],
      NOW,
    );
    assert.deepEqual(githubOutputLines(report), [
      "stale_count=2",
      "warn_count=1",
      "has_stale=true",
    ]);
  });

  it("emits has_stale=false when nothing is stale (drives auto-close)", () => {
    const report = buildReport([briefAged("w1", 70), briefAged("f1", 10)], NOW);
    assert.deepEqual(githubOutputLines(report), [
      "stale_count=0",
      "warn_count=1",
      "has_stale=false",
    ]);
  });

  it("emits has_stale=false for a completely clean set", () => {
    const report = buildReport([briefAged("f1", 5), briefAged("f2", 20)], NOW);
    assert.deepEqual(githubOutputLines(report), [
      "stale_count=0",
      "warn_count=0",
      "has_stale=false",
    ]);
  });

  it("keeps has_stale aligned with the staleBriefs set size", () => {
    const report = buildReport([briefAged("s1", 95)], NOW);
    const lines = githubOutputLines(report);
    const hasStale = lines.includes("has_stale=true");
    assert.equal(hasStale, report.staleBriefs.length > 0);
    assert.ok(lines.includes(`stale_count=${report.staleBriefs.length}`));
  });
});

describe("renderIssueBody", () => {
  it("renders both stale and approaching sections with brief rows", () => {
    const report = buildReport(
      [
        briefAged("pt-d7", 120, { countrySlug: "portugal", pathwayKey: "d7" }),
        briefAged("es-nlv", 70, { countrySlug: "spain", pathwayKey: "nlv" }),
      ],
      NOW,
    );
    const body = renderIssueBody(report);

    assert.match(body, /# Decision Brief freshness review/);
    assert.match(body, /Total briefs: \*\*2\*\*/);
    assert.match(body, /Stale \(>90 days since last review\): \*\*1\*\*/);
    assert.match(body, /Approaching stale \(60-90 days\): \*\*1\*\*/);
    assert.match(body, /## Stale briefs \(refresh before next release\)/);
    assert.match(body, /## Approaching stale \(schedule a review\)/);
    assert.match(body, /\| `pt-d7` \| portugal \| d7 \|.*\| 120 \|/);
    assert.match(body, /\| `es-nlv` \| spain \| nlv \|.*\| 70 \|/);
  });

  it("omits the stale section when no briefs are stale", () => {
    const report = buildReport([briefAged("es-nlv", 70)], NOW);
    const body = renderIssueBody(report);

    assert.doesNotMatch(body, /## Stale briefs/);
    assert.match(body, /## Approaching stale \(schedule a review\)/);
    assert.match(body, /Stale \(>90 days since last review\): \*\*0\*\*/);
  });

  it("omits the approaching section when nothing is approaching", () => {
    const report = buildReport([briefAged("pt-d7", 120)], NOW);
    const body = renderIssueBody(report);

    assert.match(body, /## Stale briefs \(refresh before next release\)/);
    assert.doesNotMatch(body, /## Approaching stale/);
  });

  it("renders a clean summary with neither section for an all-fresh report", () => {
    const report = buildReport([briefAged("f1", 10)], NOW);
    const body = renderIssueBody(report);

    assert.doesNotMatch(body, /## Stale briefs/);
    assert.doesNotMatch(body, /## Approaching stale/);
    assert.match(body, /Stale \(>90 days since last review\): \*\*0\*\*/);
    assert.match(body, /Approaching stale \(60-90 days\): \*\*0\*\*/);
  });

  it("falls back to '-' for missing country/pathway metadata", () => {
    const report = buildReport([briefAged("orphan", 120)], NOW);
    const body = renderIssueBody(report);
    assert.match(body, /\| `orphan` \| - \| - \|.*\| 120 \|/);
  });
});

describe("extractBriefs", () => {
  it("pairs each id with its country, pathway, and lastReviewedAt", () => {
    const source = `
const BRIEFS: DecisionBrief[] = [
  {
    id: "portugal-d7",
    countrySlug: "portugal",
    pathwayKey: "d7",
    headline: "Portugal D7",
    lastReviewedAt: "2026-01-15",
  },
  {
    id: "spain-nlv",
    countrySlug: "spain",
    pathwayKey: "nlv",
    headline: "Spain NLV",
    lastReviewedAt: "2026-02-20",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(briefs, [
      {
        id: "portugal-d7",
        countrySlug: "portugal",
        pathwayKey: "d7",
        lastReviewedAt: "2026-01-15",
      },
      {
        id: "spain-nlv",
        countrySlug: "spain",
        pathwayKey: "nlv",
        lastReviewedAt: "2026-02-20",
      },
    ]);
  });

  it("returns the correct count for the briefs in the array", () => {
    const source = `
const BRIEFS = [
  { id: "a", countrySlug: "x", lastReviewedAt: "2026-01-01" },
  { id: "b", countrySlug: "y", lastReviewedAt: "2026-01-02" },
  { id: "c", countrySlug: "z", lastReviewedAt: "2026-01-03" },
];
`;
    assert.equal(extractBriefs(source).length, 3);
  });

  it("yields null metadata when countrySlug / pathwayKey are absent", () => {
    const source = `
const BRIEFS = [
  {
    id: "overview-only",
    headline: "No country or pathway here",
    lastReviewedAt: "2026-03-01",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.equal(briefs.length, 1);
    assert.equal(briefs[0].countrySlug, null);
    assert.equal(briefs[0].pathwayKey, null);
    assert.equal(briefs[0].id, "overview-only");
    assert.equal(briefs[0].lastReviewedAt, "2026-03-01");
  });

  it("handles an overview brief (no pathway) alongside a full brief", () => {
    const source = `
const BRIEFS = [
  {
    id: "canada-overview",
    countrySlug: "canada",
    lastReviewedAt: "2026-04-01",
  },
  {
    id: "canada-express-entry",
    countrySlug: "canada",
    pathwayKey: "express-entry",
    lastReviewedAt: "2026-04-05",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(briefs, [
      {
        id: "canada-overview",
        countrySlug: "canada",
        pathwayKey: null,
        lastReviewedAt: "2026-04-01",
      },
      {
        id: "canada-express-entry",
        countrySlug: "canada",
        pathwayKey: "express-entry",
        lastReviewedAt: "2026-04-05",
      },
    ]);
  });

  it("ignores the type definition's `id: string;` above the BRIEFS array", () => {
    const source = `
export type DecisionBrief = {
  id: string;
  countrySlug: string;
  pathwayKey?: string;
  lastReviewedAt: string;
};

const BRIEFS: DecisionBrief[] = [
  {
    id: "portugal-overview",
    countrySlug: "portugal",
    lastReviewedAt: "2026-05-01",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.equal(briefs.length, 1);
    assert.equal(briefs[0].id, "portugal-overview");
  });

  it("does not pick up ids that appear before the BRIEFS const", () => {
    const source = `
const SOMETHING_ELSE = [
  { id: "not-a-brief", lastReviewedAt: "2020-01-01" },
];

const BRIEFS = [
  { id: "real-brief", countrySlug: "malta", lastReviewedAt: "2026-05-10" },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(
      briefs.map((b) => b.id),
      ["real-brief"],
    );
  });

  it("skips an id that has no lastReviewedAt in its block", () => {
    const source = `
const BRIEFS = [
  {
    id: "missing-review-date",
    countrySlug: "spain",
  },
  {
    id: "has-review-date",
    countrySlug: "spain",
    lastReviewedAt: "2026-06-01",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(
      briefs.map((b) => b.id),
      ["has-review-date"],
    );
  });

  it("ignores a nested quoted `id:` inside a brief (sourceLinks / changeLog / meta)", () => {
    const source = `
const BRIEFS = [
  {
    id: "portugal-d7",
    countrySlug: "portugal",
    pathwayKey: "d7",
    lastReviewedAt: "2026-01-15",
    sourceLinks: [
      { id: "src-1", label: "AIMA", url: "https://example.gov", type: "official" },
    ],
    changeLog: [
      { id: "log-1", date: "2026-01-10", summary: "Updated fees", severity: "P1" },
    ],
    meta: { id: "meta-1", confidence: "High" },
  },
  {
    id: "spain-nlv",
    countrySlug: "spain",
    pathwayKey: "nlv",
    lastReviewedAt: "2026-02-20",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(briefs, [
      {
        id: "portugal-d7",
        countrySlug: "portugal",
        pathwayKey: "d7",
        lastReviewedAt: "2026-01-15",
      },
      {
        id: "spain-nlv",
        countrySlug: "spain",
        pathwayKey: "nlv",
        lastReviewedAt: "2026-02-20",
      },
    ]);
  });

  it("does not let a nested id with its own review date mis-pair dates", () => {
    // A nested object carrying both `id` and `lastReviewedAt` must not be
    // promoted to a standalone brief, and must not steal the parent's date.
    const source = `
const BRIEFS = [
  {
    id: "real-brief",
    countrySlug: "malta",
    lastReviewedAt: "2026-05-10",
    changeLog: [
      { id: "nested", lastReviewedAt: "2019-01-01", summary: "old" },
    ],
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(briefs, [
      {
        id: "real-brief",
        countrySlug: "malta",
        pathwayKey: null,
        lastReviewedAt: "2026-05-10",
      },
    ]);
  });

  it("ignores brackets and `id:`-like text that appear inside string values", () => {
    const source = `
const BRIEFS = [
  {
    id: "tricky",
    countrySlug: "spain",
    decisionSummary: "Mind the braces { [ ( and a fake id: \\"nope\\" inside text",
    lastReviewedAt: "2026-03-03",
  },
];
`;
    const briefs = extractBriefs(source);
    assert.deepEqual(
      briefs.map((b) => b.id),
      ["tricky"],
    );
    assert.equal(briefs[0].lastReviewedAt, "2026-03-03");
  });

  it("parses the real decisionBriefs.ts: every brief has a non-empty id and lastReviewedAt", async () => {
    const source = await readFile(REAL_BRIEFS_PATH, "utf8");
    const briefs = extractBriefs(source);

    assert.ok(
      briefs.length > 0,
      "expected at least one brief parsed from the real data file",
    );

    for (const brief of briefs) {
      assert.equal(
        typeof brief.id,
        "string",
        `brief id should be a string: ${JSON.stringify(brief)}`,
      );
      assert.ok(
        brief.id.length > 0,
        `brief id should be non-empty: ${JSON.stringify(brief)}`,
      );
      assert.equal(
        typeof brief.lastReviewedAt,
        "string",
        `lastReviewedAt should be a string for ${brief.id}`,
      );
      assert.ok(
        brief.lastReviewedAt.length > 0,
        `lastReviewedAt should be non-empty for ${brief.id}`,
      );
    }

    const ids = briefs.map((b) => b.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      "expected every parsed brief id to be unique",
    );
  });
});
