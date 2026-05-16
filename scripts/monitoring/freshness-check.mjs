#!/usr/bin/env node
// Quarterly Decision Brief freshness check.
//
// Parses src/data/decisionBriefs.ts statically (regex over the BRIEFS array)
// so this script can run in a plain Node environment without pulling in the
// React Native / Expo module graph. Each brief entry has exactly one `id` and
// one `lastReviewedAt` field, declared in that order, so we walk the file and
// pair them positionally.
//
// Exits 0 always (the goal is reporting, not failing CI). Writes a JSON
// report to monitoring/freshness-report.json and prints a human-readable
// summary to stdout. When run inside GitHub Actions with stale briefs found,
// also writes an issue body to monitoring/freshness-issue.md so the workflow
// can open or update a tracking issue.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");

const BRIEFS_PATH = resolve(ROOT, "src", "data", "decisionBriefs.ts");
const REPORT_PATH = resolve(ROOT, "monitoring", "freshness-report.json");
const ISSUE_BODY_PATH = resolve(ROOT, "monitoring", "freshness-issue.md");

const STALE_THRESHOLD_DAYS = 90;
const WARN_THRESHOLD_DAYS = 60;

function daysSince(isoDate) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

// Extract briefs from the TS source. We match BRIEFS array entries by
// pairing each `id: "..."` with the `lastReviewedAt: "..."` that follows
// it in source order. Skips type definitions (which sit above the BRIEFS
// const) by anchoring on the BRIEFS array opening bracket.
export function extractBriefs(source) {
  const arrayStart = source.indexOf("const BRIEFS");
  const body = arrayStart >= 0 ? source.slice(arrayStart) : source;

  const idRe = /\bid:\s*"([^"]+)"/g;
  const reviewRe = /\blastReviewedAt:\s*"([^"]+)"/g;
  const countryRe = /\bcountrySlug:\s*"([^"]+)"/g;
  const pathwayRe = /\bpathwayKey:\s*"([^"]+)"/g;

  const ids = [...body.matchAll(idRe)];
  const reviews = [...body.matchAll(reviewRe)];

  const briefs = [];
  for (let i = 0; i < ids.length; i++) {
    const idMatch = ids[i];
    const startIdx = idMatch.index ?? 0;
    const endIdx = i + 1 < ids.length ? (ids[i + 1].index ?? body.length) : body.length;
    const block = body.slice(startIdx, endIdx);

    const reviewMatch = /\blastReviewedAt:\s*"([^"]+)"/.exec(block);
    const countryMatch = /\bcountrySlug:\s*"([^"]+)"/.exec(block);
    const pathwayMatch = /\bpathwayKey:\s*"([^"]+)"/.exec(block);

    if (!reviewMatch) continue;

    briefs.push({
      id: idMatch[1],
      countrySlug: countryMatch ? countryMatch[1] : null,
      pathwayKey: pathwayMatch ? pathwayMatch[1] : null,
      lastReviewedAt: reviewMatch[1],
    });
  }
  return briefs;
}

function classify(days) {
  if (days === null) return "invalid";
  if (days > STALE_THRESHOLD_DAYS) return "stale";
  if (days > WARN_THRESHOLD_DAYS) return "warn";
  return "fresh";
}

function renderIssueBody(report) {
  const { generatedAt, staleBriefs, warnBriefs, totalBriefs } = report;
  const lines = [
    `# Decision Brief freshness review`,
    ``,
    `Automated check generated ${generatedAt}.`,
    ``,
    `- Total briefs: **${totalBriefs}**`,
    `- Stale (>${STALE_THRESHOLD_DAYS} days since last review): **${staleBriefs.length}**`,
    `- Approaching stale (${WARN_THRESHOLD_DAYS}-${STALE_THRESHOLD_DAYS} days): **${warnBriefs.length}**`,
    ``,
  ];

  if (staleBriefs.length > 0) {
    lines.push(`## Stale briefs (refresh before next release)`, ``);
    lines.push(`| Brief ID | Country | Pathway | Last reviewed | Age (days) |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const b of staleBriefs) {
      lines.push(
        `| \`${b.id}\` | ${b.countrySlug ?? "-"} | ${b.pathwayKey ?? "-"} | ${b.lastReviewedAt} | ${b.ageDays} |`,
      );
    }
    lines.push(``);
  }

  if (warnBriefs.length > 0) {
    lines.push(`## Approaching stale (schedule a review)`, ``);
    lines.push(`| Brief ID | Country | Pathway | Last reviewed | Age (days) |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const b of warnBriefs) {
      lines.push(
        `| \`${b.id}\` | ${b.countrySlug ?? "-"} | ${b.pathwayKey ?? "-"} | ${b.lastReviewedAt} | ${b.ageDays} |`,
      );
    }
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `Update each brief's \`lastReviewedAt\` field in \`src/data/decisionBriefs.ts\` after verifying figures against the cited official sources. See \`scripts/monitoring/freshness-check.mjs\`.`,
  );
  return lines.join("\n");
}

export async function runFreshnessCheck({ writeFiles = true } = {}) {
  const source = await readFile(BRIEFS_PATH, "utf8");
  const briefs = extractBriefs(source);

  const enriched = briefs.map((b) => {
    const ageDays = daysSince(b.lastReviewedAt);
    return { ...b, ageDays, status: classify(ageDays) };
  });

  const staleBriefs = enriched
    .filter((b) => b.status === "stale")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const warnBriefs = enriched
    .filter((b) => b.status === "warn")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const invalidBriefs = enriched.filter((b) => b.status === "invalid");

  const report = {
    generatedAt: new Date().toISOString(),
    staleThresholdDays: STALE_THRESHOLD_DAYS,
    warnThresholdDays: WARN_THRESHOLD_DAYS,
    totalBriefs: enriched.length,
    staleBriefs,
    warnBriefs,
    invalidBriefs,
    allBriefs: enriched,
  };

  if (writeFiles) {
    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    if (staleBriefs.length > 0 || warnBriefs.length > 0) {
      await writeFile(ISSUE_BODY_PATH, renderIssueBody(report), "utf8");
    }
  }

  return report;
}

function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMain()) {
  runFreshnessCheck()
    .then((report) => {
      const { totalBriefs, staleBriefs, warnBriefs, invalidBriefs } = report;
      console.log(`Freshness check: ${totalBriefs} briefs scanned.`);
      console.log(`  Stale (>${STALE_THRESHOLD_DAYS}d): ${staleBriefs.length}`);
      console.log(`  Approaching (>${WARN_THRESHOLD_DAYS}d): ${warnBriefs.length}`);
      if (invalidBriefs.length > 0) {
        console.log(`  Invalid dates: ${invalidBriefs.length}`);
      }
      for (const b of staleBriefs) {
        console.log(`    STALE  ${b.id} (${b.ageDays}d, reviewed ${b.lastReviewedAt})`);
      }
      for (const b of warnBriefs) {
        console.log(`    WARN   ${b.id} (${b.ageDays}d, reviewed ${b.lastReviewedAt})`);
      }
      const hasStale = staleBriefs.length > 0;
      if (process.env.GITHUB_OUTPUT) {
        // Used by the workflow to decide whether to open/update an issue.
        const out = [
          `stale_count=${staleBriefs.length}`,
          `warn_count=${warnBriefs.length}`,
          `has_stale=${hasStale ? "true" : "false"}`,
        ].join("\n");
        // Append (don't overwrite) — GITHUB_OUTPUT is a file.
        return import("node:fs/promises").then((fs) =>
          fs.appendFile(process.env.GITHUB_OUTPUT, out + "\n"),
        );
      }
      return undefined;
    })
    .catch((err) => {
      console.error("Freshness check failed:", err);
      process.exit(1);
    });
}
