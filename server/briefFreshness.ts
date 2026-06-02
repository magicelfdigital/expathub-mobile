import type { Express, Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Shared, RN-graph-free source of truth for the freshness thresholds, also
// consumed by the CI checker (scripts/monitoring/freshness-check.mjs) and the
// in-app validator (src/data/briefValidation.ts), so the admin dashboard and
// the scheduled job can never drift out of agreement.
import {
  STALE_THRESHOLD_DAYS,
  WARN_THRESHOLD_DAYS,
} from "../src/data/freshnessThresholds.mjs";

// Shared brief parser — single source of truth so this dashboard and the
// scheduled CI checker (scripts/monitoring/freshness-check.mjs) can never drift
// apart and mis-count briefs. Previously this file kept its own fragile copy
// that paired every quoted `id:` with the next `lastReviewedAt:`, which would
// mis-count if a nested quoted `id:` were ever added inside a brief. Re-exported
// below so existing importers/tests that pull `extractBriefs` from this module
// keep working.
import { extractBriefs } from "../src/data/extractBriefs.mjs";

const BRIEFS_PATH = resolve(process.cwd(), "src", "data", "decisionBriefs.ts");

export type FreshnessEntry = {
  id: string;
  countrySlug: string | null;
  pathwayKey: string | null;
  lastReviewedAt: string;
  ageDays: number | null;
  status: "fresh" | "warn" | "stale" | "invalid";
};

export type FreshnessReport = {
  generatedAt: string;
  staleThresholdDays: number;
  warnThresholdDays: number;
  totalBriefs: number;
  staleCount: number;
  warnCount: number;
  staleBriefs: FreshnessEntry[];
  warnBriefs: FreshnessEntry[];
  allBriefs: FreshnessEntry[];
};

function daysSince(iso: string): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function classify(days: number | null): FreshnessEntry["status"] {
  if (days === null) return "invalid";
  if (days > STALE_THRESHOLD_DAYS) return "stale";
  if (days > WARN_THRESHOLD_DAYS) return "warn";
  return "fresh";
}

// Re-exported from the shared parser (src/data/extractBriefs.mjs) so this
// dashboard and the cron script parse the BRIEFS array identically. See that
// module for the full description of the string/comment-aware, depth-tracking
// scanner and why nested quoted `id:` fields are ignored. Avoids importing the
// React Native data module from the Express runtime.
export { extractBriefs };

export async function buildFreshnessReport(): Promise<FreshnessReport> {
  const source = await readFile(BRIEFS_PATH, "utf8");
  const raw = extractBriefs(source);

  const allBriefs: FreshnessEntry[] = raw.map((b) => {
    const ageDays = daysSince(b.lastReviewedAt);
    return { ...b, ageDays, status: classify(ageDays) };
  });

  const staleBriefs = allBriefs
    .filter((b) => b.status === "stale")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const warnBriefs = allBriefs
    .filter((b) => b.status === "warn")
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  return {
    generatedAt: new Date().toISOString(),
    staleThresholdDays: STALE_THRESHOLD_DAYS,
    warnThresholdDays: WARN_THRESHOLD_DAYS,
    totalBriefs: allBriefs.length,
    staleCount: staleBriefs.length,
    warnCount: warnBriefs.length,
    staleBriefs,
    warnBriefs,
    allBriefs,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Defuse CSV formula injection: spreadsheet apps treat cells beginning
  // with =, +, -, @, tab, or CR as formulas. Brief ids / slugs are
  // content-controlled, but prefix any such leading character defensively.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Multi-section CSV mirroring the auth-prompt / quiz-save dashboards: each
// section is its own header+rows block separated by a blank line so a
// spreadsheet importer can map each block to its own schema.
export function renderFreshnessCsv(report: FreshnessReport): string {
  const sections: string[][] = [];
  sections.push([`# Decision Brief freshness — generated ${report.generatedAt}`]);

  // Section 1 — summary counts and the thresholds they were classified by.
  sections.push([
    "section,metric,value",
    `summary,total_briefs,${report.totalBriefs}`,
    `summary,stale_count,${report.staleCount}`,
    `summary,warn_count,${report.warnCount}`,
    `summary,stale_threshold_days,${report.staleThresholdDays}`,
    `summary,warn_threshold_days,${report.warnThresholdDays}`,
  ]);

  // Section 2 — per-brief rows, oldest first to match the HTML table order.
  const sorted = [...report.allBriefs].sort(
    (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0),
  );
  const briefLines: string[] = [
    "section,id,country,pathway,last_reviewed,age_days,status",
  ];
  for (const b of sorted) {
    briefLines.push(
      [
        "brief",
        csvEscape(b.id),
        csvEscape(b.countrySlug ?? ""),
        csvEscape(b.pathwayKey ?? ""),
        csvEscape(b.lastReviewedAt),
        b.ageDays ?? "",
        csvEscape(b.status),
      ].join(","),
    );
  }
  sections.push(briefLines);

  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}

function renderRow(b: FreshnessEntry): string {
  const status = b.status === "stale" ? "🔴" : b.status === "warn" ? "🟡" : b.status === "invalid" ? "⚠️" : "🟢";
  return `<tr>
    <td>${status}</td>
    <td><code>${escapeHtml(b.id)}</code></td>
    <td>${escapeHtml(b.countrySlug ?? "-")}</td>
    <td>${escapeHtml(b.pathwayKey ?? "-")}</td>
    <td>${escapeHtml(b.lastReviewedAt)}</td>
    <td style="text-align:right">${b.ageDays ?? "?"}</td>
  </tr>`;
}

export function renderFreshnessHtml(report: FreshnessReport): string {
  const sorted = [...report.allBriefs].sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const rows = sorted.map(renderRow).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Decision Brief freshness</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 1080px; color: #111; background: #fafafa; }
    h1 { margin: 0 0 8px; }
    .nav { margin-bottom: 16px; }
    .summary { display: flex; gap: 16px; margin: 16px 0; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; flex: 1; }
    .card .label { color: #666; font-size: 12px; text-transform: uppercase; }
    .card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .card.stale .value { color: #c0392b; }
    .card.warn .value { color: #b9770e; }
    table { width: 100%; border-collapse: collapse; background: #fff;
      border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    th { background: #f7f7f7; font-weight: 600; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .meta { color: #666; margin-top: 16px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="nav"><a href="/admin">← Admin tools</a></div>
  <h1>Decision Brief freshness</h1>
  <p>Briefs with <code>lastReviewedAt</code> older than ${report.staleThresholdDays} days are stale and should be refreshed before the next App Store release.</p>
  <div class="summary">
    <div class="card"><div class="label">Total briefs</div><div class="value">${report.totalBriefs}</div></div>
    <div class="card stale"><div class="label">Stale (&gt;${report.staleThresholdDays}d)</div><div class="value">${report.staleCount}</div></div>
    <div class="card warn"><div class="label">Approaching (&gt;${report.warnThresholdDays}d)</div><div class="value">${report.warnCount}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th></th><th>Brief ID</th><th>Country</th><th>Pathway</th><th>Last reviewed</th><th style="text-align:right">Age (days)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="meta">Report generated ${escapeHtml(report.generatedAt)}. JSON at <code>/api/admin/brief-freshness</code> · <a href="/admin/brief-freshness.csv">Download CSV</a>.</div>
</body>
</html>`;
}

export function registerBriefFreshnessRoutes(
  app: Express,
  deps: { requireAdminBasicAuth: (req: Request, res: Response) => boolean },
): void {
  app.get("/api/admin/brief-freshness", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res.json(report);
    } catch (err: any) {
      console.error("Brief freshness JSON error:", err?.message);
      res.status(500).json({ error: "Failed to build freshness report" });
    }
  });

  app.get("/admin/brief-freshness.csv", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res
        .type("text/csv; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          'attachment; filename="brief-freshness.csv"',
        )
        .send(renderFreshnessCsv(report));
    } catch (err: any) {
      console.error("Brief freshness CSV error:", err?.message);
      res
        .status(500)
        .type("text/plain")
        .send(`Failed to build freshness report: ${err?.message ?? "unknown"}`);
    }
  });

  app.get("/admin/brief-freshness", async (req, res) => {
    if (!deps.requireAdminBasicAuth(req, res)) return;
    try {
      const report = await buildFreshnessReport();
      res.type("text/html").send(renderFreshnessHtml(report));
    } catch (err: any) {
      console.error("Brief freshness HTML error:", err?.message);
      res
        .status(500)
        .type("text/html")
        .send(`<h1>Freshness report unavailable</h1><pre>${escapeHtml(String(err?.message ?? err))}</pre>`);
    }
  });
}
