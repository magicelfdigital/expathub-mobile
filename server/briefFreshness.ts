import type { Express, Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Mirror of the thresholds in scripts/monitoring/freshness-check.mjs so the
// admin dashboard and the scheduled job stay in agreement.
const STALE_THRESHOLD_DAYS = 90;
const WARN_THRESHOLD_DAYS = 60;

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

// Parse the static decisionBriefs.ts source the same way the cron script
// does. Avoids importing the React Native data module from the Express
// runtime.
export function extractBriefs(
  source: string,
): Array<{ id: string; countrySlug: string | null; pathwayKey: string | null; lastReviewedAt: string }> {
  const arrayStart = source.indexOf("const BRIEFS");
  const body = arrayStart >= 0 ? source.slice(arrayStart) : source;

  const idRe = /\bid:\s*"([^"]+)"/g;
  const ids = [...body.matchAll(idRe)];

  const entries: Array<{
    id: string;
    countrySlug: string | null;
    pathwayKey: string | null;
    lastReviewedAt: string;
  }> = [];

  for (let i = 0; i < ids.length; i++) {
    const idMatch = ids[i];
    const startIdx = idMatch.index ?? 0;
    const endIdx = i + 1 < ids.length ? (ids[i + 1].index ?? body.length) : body.length;
    const block = body.slice(startIdx, endIdx);

    const reviewMatch = /\blastReviewedAt:\s*"([^"]+)"/.exec(block);
    const countryMatch = /\bcountrySlug:\s*"([^"]+)"/.exec(block);
    const pathwayMatch = /\bpathwayKey:\s*"([^"]+)"/.exec(block);

    if (!reviewMatch) continue;

    entries.push({
      id: idMatch[1],
      countrySlug: countryMatch ? countryMatch[1] : null,
      pathwayKey: pathwayMatch ? pathwayMatch[1] : null,
      lastReviewedAt: reviewMatch[1],
    });
  }
  return entries;
}

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
  <div class="meta">Report generated ${escapeHtml(report.generatedAt)}. JSON at <code>/api/admin/brief-freshness</code>.</div>
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
