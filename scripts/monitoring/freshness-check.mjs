#!/usr/bin/env node
// Weekly Decision Brief freshness check.
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

// Shared, RN-graph-free source of truth for the freshness thresholds, also
// consumed by the in-app validator (src/data/briefValidation.ts). Editing the
// numbers there keeps CI and the validator in lockstep.
import {
  STALE_THRESHOLD_DAYS,
  WARN_THRESHOLD_DAYS,
  RELEASE_BLOCK_THRESHOLD_DAYS,
} from "../../src/data/freshnessThresholds.mjs";

// Shared brief parser — single source of truth so this cron job and the admin
// freshness dashboard (server/briefFreshness.ts) can never drift apart and
// mis-count briefs. Re-exported below so existing importers/tests that pull
// `extractBriefs` from this module keep working.
import { extractBriefs } from "../../src/data/extractBriefs.mjs";

// `import.meta` is rewritten to `undefined` when this module is transpiled to
// CommonJS for the jest runtime (the server jest suite imports the re-exported
// `extractBriefs` from here to drift-guard it against the admin dashboard's
// copy). Guard the access so the module stays importable in that context; the
// file-I/O paths below are only used by the CLI entry points, which jest never
// invokes.
const selfUrl = import.meta?.url;
const __dirname = selfUrl ? dirname(fileURLToPath(selfUrl)) : process.cwd();
const ROOT = selfUrl ? resolve(__dirname, "..", "..") : process.cwd();

const BRIEFS_PATH = resolve(ROOT, "src", "data", "decisionBriefs.ts");
const REPORT_PATH = resolve(ROOT, "monitoring", "freshness-report.json");
const ISSUE_BODY_PATH = resolve(ROOT, "monitoring", "freshness-issue.md");

// Release-blocking threshold. Any brief older than this (in days) hard-fails
// the freshness gate (see `--gate` mode and brief-freshness-gate.yml). This is
// stricter than the soft STALE_THRESHOLD_DAYS reporting tier: the 90/60-day
// tiers only warn, while crossing this line blocks a release. Defaults to
// RELEASE_BLOCK_THRESHOLD_DAYS ("over 6 months", shared with the in-app
// validator) and is overridable via the BRIEF_FRESHNESS_GATE_DAYS env var.
const DEFAULT_GATE_THRESHOLD_DAYS = RELEASE_BLOCK_THRESHOLD_DAYS;

export function getGateThresholdDays(env = process.env) {
  const raw = env.BRIEF_FRESHNESS_GATE_DAYS;
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    return DEFAULT_GATE_THRESHOLD_DAYS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid BRIEF_FRESHNESS_GATE_DAYS="${raw}". Expected a positive number of days.`,
    );
  }
  return Math.floor(parsed);
}

// Briefs that should block a release: any with a valid review date older than
// the gate threshold. Invalid dates also block (a brief with an unparseable
// review date cannot be vouched as fresh).
export function findReleaseBlockingBriefs(report, thresholdDays) {
  return report.allBriefs
    .filter((b) =>
      b.ageDays === null ? true : b.ageDays > thresholdDays,
    )
    .sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity));
}

function daysSince(isoDate, now = Date.now()) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// Re-exported from the shared parser (src/data/extractBriefs.mjs) so the cron
// job and the admin freshness dashboard parse the BRIEFS array identically.
// See that module for the full description of the string/comment-aware,
// depth-tracking scanner and why nested quoted `id:` fields are ignored.
export { extractBriefs };

export function classify(days) {
  if (days === null) return "invalid";
  if (days > STALE_THRESHOLD_DAYS) return "stale";
  if (days > WARN_THRESHOLD_DAYS) return "warn";
  return "fresh";
}

// Assemble the freshness report from already-extracted briefs. Pure (no I/O):
// computes each brief's age relative to `now`, classifies it, and buckets the
// results into stale/warn/invalid sets sorted oldest-first. Shared by both the
// weekly report path and the release gate so they classify identically.
export function buildReport(briefs, now = Date.now()) {
  const enriched = briefs.map((b) => {
    const ageDays = daysSince(b.lastReviewedAt, now);
    return { ...b, ageDays, status: classify(ageDays) };
  });

  const staleBriefs = enriched
    .filter((b) => b.status === "stale")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const warnBriefs = enriched
    .filter((b) => b.status === "warn")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const invalidBriefs = enriched.filter((b) => b.status === "invalid");

  return {
    generatedAt: new Date(now).toISOString(),
    staleThresholdDays: STALE_THRESHOLD_DAYS,
    warnThresholdDays: WARN_THRESHOLD_DAYS,
    totalBriefs: enriched.length,
    staleBriefs,
    warnBriefs,
    invalidBriefs,
    allBriefs: enriched,
  };
}

// GitHub Actions step outputs that drive the workflow's open/auto-close
// decision. `has_stale` gates whether the standing issue is opened/updated
// (true) or auto-closed (false); the counts populate the issue comment trail.
export function githubOutputLines(report) {
  const staleCount = report.staleBriefs.length;
  const warnCount = report.warnBriefs.length;
  const hasStale = staleCount > 0;
  return [
    `stale_count=${staleCount}`,
    `warn_count=${warnCount}`,
    `has_stale=${hasStale ? "true" : "false"}`,
  ];
}

export function renderIssueBody(report) {
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

// Build a Slack message (incoming-webhook payload) summarising the review.
// Uses the same stale/warn thresholds as the rest of the script so the
// notification matches the GitHub issue and stdout summary.
export function renderSlackMessage(report) {
  const { generatedAt, staleBriefs, warnBriefs, totalBriefs } = report;

  const headline =
    staleBriefs.length > 0
      ? `:rotating_light: Decision Brief freshness review — ${staleBriefs.length} stale brief${staleBriefs.length === 1 ? "" : "s"} need refreshing`
      : `:hourglass_flowing_sand: Decision Brief freshness review — ${warnBriefs.length} brief${warnBriefs.length === 1 ? "" : "s"} approaching stale`;

  const summaryLines = [
    `*${headline}*`,
    `Scanned ${totalBriefs} briefs · ${staleBriefs.length} stale (>${STALE_THRESHOLD_DAYS}d) · ${warnBriefs.length} approaching (>${WARN_THRESHOLD_DAYS}d).`,
  ];

  const previewLimit = 10;
  const listBlock = (label, briefs) => {
    if (briefs.length === 0) return null;
    const rows = briefs
      .slice(0, previewLimit)
      .map((b) => `• \`${b.id}\` — ${b.ageDays}d (reviewed ${b.lastReviewedAt})`);
    if (briefs.length > previewLimit) {
      rows.push(`• …and ${briefs.length - previewLimit} more`);
    }
    return `*${label}*\n${rows.join("\n")}`;
  };

  const sections = [
    listBlock("Stale (refresh before next release)", staleBriefs),
    listBlock("Approaching stale (schedule a review)", warnBriefs),
  ].filter(Boolean);

  const footer = `Update each brief's \`lastReviewedAt\` in \`src/data/decisionBriefs.ts\` after verifying against official sources. Generated ${generatedAt}.`;

  const text = [summaryLines.join("\n"), ...sections, footer].join("\n\n");

  return { text };
}

// POST the summary to a Slack incoming webhook. Returns false (and logs)
// rather than throwing so a Slack outage never fails the freshness job.
export async function notifySlack(webhookUrl, report) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renderSlackMessage(report)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[freshness] Slack notification failed: ${res.status} ${res.statusText} ${body}`.trim(),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[freshness] Slack notification error: ${err?.message || err}`);
    return false;
  }
}

export async function runFreshnessCheck({ writeFiles = true } = {}) {
  const source = await readFile(BRIEFS_PATH, "utf8");
  const briefs = extractBriefs(source);
  const report = buildReport(briefs);
  const { staleBriefs, warnBriefs } = report;

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
  return import.meta?.url === `file://${process.argv[1]}`;
}

// Release-blocking gate. Exits non-zero when any brief is older than the
// configured gate threshold (default 180 days). The soft 90/60-day tiers are
// reported for context but never affect the exit code. Invoked via `--gate`.
async function runGate() {
  const thresholdDays = getGateThresholdDays();
  // No file writes needed for the gate; it only inspects the live data.
  const report = await runFreshnessCheck({ writeFiles: false });
  const blocking = findReleaseBlockingBriefs(report, thresholdDays);

  console.log(
    `Freshness gate: ${report.totalBriefs} briefs scanned, ` +
      `threshold ${thresholdDays} days.`,
  );
  console.log(
    `  Soft tiers (non-blocking): stale (>${STALE_THRESHOLD_DAYS}d)=${report.staleBriefs.length}, ` +
      `approaching (>${WARN_THRESHOLD_DAYS}d)=${report.warnBriefs.length}`,
  );

  if (blocking.length === 0) {
    console.log(
      `  PASS — no brief is older than ${thresholdDays} days.`,
    );
    return 0;
  }

  console.error(
    `  FAIL — ${blocking.length} brief(s) exceed the ${thresholdDays}-day release threshold:`,
  );
  for (const b of blocking) {
    const age = b.ageDays === null ? "invalid date" : `${b.ageDays}d`;
    console.error(
      `    BLOCK  ${b.id} (${age}, reviewed ${b.lastReviewedAt})`,
    );
  }
  console.error(
    `\nUpdate each brief's lastReviewedAt in src/data/decisionBriefs.ts after ` +
      `verifying figures against the cited official sources, then re-run the gate.`,
  );
  return 1;
}

async function runReport() {
  const report = await runFreshnessCheck();
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
  const hasWarn = warnBriefs.length > 0;

  // Notify Slack when anything is stale or approaching stale — same
  // thresholds that drive the issue body and stdout summary. Skipped silently
  // when no webhook is configured (e.g. local runs).
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl && (hasStale || hasWarn)) {
    const ok = await notifySlack(webhookUrl, report);
    console.log(`  Slack notification: ${ok ? "sent" : "failed"}`);
  } else if (!webhookUrl) {
    console.log("  Slack notification: skipped (no SLACK_WEBHOOK_URL set)");
  }

  if (process.env.GITHUB_OUTPUT) {
    // Used by the workflow to decide whether to open/update an issue.
    const out = githubOutputLines(report).join("\n");
    // Append (don't overwrite) — GITHUB_OUTPUT is a file.
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_OUTPUT, out + "\n");
  }

  return 0;
}

if (isMain()) {
  const isGate = process.argv.includes("--gate");
  const run = isGate ? runGate : runReport;
  run()
    .then((exitCode) => {
      if (exitCode) process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Freshness check failed:", err);
      process.exit(1);
    });
}
