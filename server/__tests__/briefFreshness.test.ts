import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import {
  extractBriefs,
  buildFreshnessReport,
  renderFreshnessCsv,
  registerBriefFreshnessRoutes,
  type FreshnessReport,
} from "../briefFreshness";
// The scheduled CI checker re-exports the same shared parser. Import it here
// so the drift-guard below can compare both re-exports against the real data.
import { extractBriefs as monitoringExtractBriefs } from "../../scripts/monitoring/freshness-check.mjs";

function buildApp(authOk = true): Express {
  const app = express();
  registerBriefFreshnessRoutes(app, {
    requireAdminBasicAuth: (_req: Request, res: Response) => {
      if (!authOk) {
        res.status(401).set("WWW-Authenticate", "Basic").send("Unauthorized");
        return false;
      }
      return true;
    },
  });
  return app;
}

const sampleReport: FreshnessReport = {
  generatedAt: "2026-06-01T00:00:00.000Z",
  staleThresholdDays: 90,
  warnThresholdDays: 60,
  totalBriefs: 2,
  staleCount: 1,
  warnCount: 0,
  staleBriefs: [
    {
      id: "spain-nlv",
      countrySlug: "spain",
      pathwayKey: "nlv",
      lastReviewedAt: "2024-01-01",
      ageDays: 200,
      status: "stale",
    },
  ],
  warnBriefs: [],
  allBriefs: [
    {
      id: "portugal-overview",
      countrySlug: "portugal",
      pathwayKey: null,
      lastReviewedAt: "2026-05-01",
      ageDays: 30,
      status: "fresh",
    },
    {
      id: "spain-nlv",
      countrySlug: "spain",
      pathwayKey: "nlv",
      lastReviewedAt: "2024-01-01",
      ageDays: 200,
      status: "stale",
    },
  ],
};

describe("briefFreshness", () => {
  describe("extractBriefs", () => {
    it("pairs each id with the lastReviewedAt that follows it in source order", () => {
      const src = `
        export type DecisionBrief = {
          id: string;
          lastReviewedAt: string;
        };
        const BRIEFS: DecisionBrief[] = [
          {
            id: "portugal-overview",
            countrySlug: "portugal",
            lastReviewedAt: "2026-05-01",
          },
          {
            id: "spain-nlv",
            countrySlug: "spain",
            pathwayKey: "nlv",
            lastReviewedAt: "2024-01-01",
          },
        ];
      `;
      const briefs = extractBriefs(src);
      expect(briefs).toEqual([
        {
          id: "portugal-overview",
          countrySlug: "portugal",
          pathwayKey: null,
          lastReviewedAt: "2026-05-01",
        },
        {
          id: "spain-nlv",
          countrySlug: "spain",
          pathwayKey: "nlv",
          lastReviewedAt: "2024-01-01",
        },
      ]);
    });

    it("ignores type definitions above the BRIEFS array", () => {
      const src = `
        type Foo = { id: string; lastReviewedAt: string };
        const NOT_A_BRIEF = { id: "ignored", lastReviewedAt: "1999-01-01" };
        const BRIEFS = [
          { id: "real", countrySlug: "x", lastReviewedAt: "2026-05-01" },
        ];
      `;
      const briefs = extractBriefs(src);
      expect(briefs).toHaveLength(1);
      expect(briefs[0].id).toBe("real");
    });

    it("ignores a nested quoted id inside a brief (sourceLinks / changeLog / meta)", () => {
      const src = `
        const BRIEFS: DecisionBrief[] = [
          {
            id: "portugal-d7",
            countrySlug: "portugal",
            pathwayKey: "d7",
            lastReviewedAt: "2026-01-15",
            sourceLinks: [
              { id: "src-1", label: "AIMA", url: "https://example.gov" },
            ],
            changeLog: [
              { id: "log-1", lastReviewedAt: "2019-01-01", summary: "old" },
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
      const briefs = extractBriefs(src);
      expect(briefs).toEqual([
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
  });

  describe("parser parity with the monitoring script", () => {
    // Both server/briefFreshness.ts and scripts/monitoring/freshness-check.mjs
    // re-export the same shared parser (src/data/extractBriefs.mjs). This guard
    // fails loudly if a future edit reverts either side to a private copy and
    // silently reintroduces mismatched brief counts / dates.
    it("parses the real decisionBriefs.ts identically through both re-exports", async () => {
      const briefsPath = resolve(
        process.cwd(),
        "src",
        "data",
        "decisionBriefs.ts",
      );
      const source = await readFile(briefsPath, "utf8");

      const fromDashboard = extractBriefs(source);
      const fromMonitoring = monitoringExtractBriefs(source);

      expect(fromDashboard.length).toBeGreaterThan(0);
      // Full structural equality: ids, lastReviewedAt, and metadata must match.
      expect(fromDashboard).toEqual(fromMonitoring);

      // Compare the id + lastReviewedAt sets explicitly so a mismatch names the
      // disagreeing briefs rather than just failing a deep-equal.
      const fingerprint = (briefs: { id: string; lastReviewedAt: string }[]) =>
        briefs
          .map((b) => `${b.id}::${b.lastReviewedAt}`)
          .sort();
      expect(fingerprint(fromDashboard)).toEqual(fingerprint(fromMonitoring));
    });
  });

  describe("buildFreshnessReport", () => {
    it("classifies the real decisionBriefs.ts data with stale/warn counts", async () => {
      const report = await buildFreshnessReport();
      expect(report.totalBriefs).toBeGreaterThan(0);
      expect(report.staleCount + report.warnCount).toBeLessThanOrEqual(
        report.totalBriefs,
      );
      for (const b of report.staleBriefs) {
        expect(b.status).toBe("stale");
        expect(b.ageDays).toBeGreaterThan(report.staleThresholdDays);
      }
      for (const b of report.warnBriefs) {
        expect(b.status).toBe("warn");
        expect(b.ageDays).toBeGreaterThan(report.warnThresholdDays);
        expect(b.ageDays).toBeLessThanOrEqual(report.staleThresholdDays);
      }
    });
  });

  describe("renderFreshnessCsv", () => {
    it("renders a sectioned CSV with a summary block and per-brief block", () => {
      const csv = renderFreshnessCsv(sampleReport);
      const lines = csv.split("\n");
      expect(lines[0]).toMatch(/^# Decision Brief freshness/);
      // Summary section.
      expect(lines).toContain("section,metric,value");
      expect(lines).toContain("summary,total_briefs,2");
      expect(lines).toContain("summary,stale_count,1");
      expect(lines).toContain("summary,warn_count,0");
      expect(lines).toContain("summary,stale_threshold_days,90");
      expect(lines).toContain("summary,warn_threshold_days,60");
      // Per-brief section, oldest first.
      expect(lines).toContain(
        "section,id,country,pathway,last_reviewed,age_days,status",
      );
      const briefRows = lines.filter((l) => l.startsWith("brief,"));
      expect(briefRows[0]).toBe(
        "brief,spain-nlv,spain,nlv,2024-01-01,200,stale",
      );
      expect(briefRows).toContain(
        "brief,portugal-overview,portugal,,2026-05-01,30,fresh",
      );
      expect(csv.endsWith("\n")).toBe(true);
    });
  });

  describe("GET /admin/brief-freshness.csv", () => {
    it("rejects unauthenticated requests via the admin gate", async () => {
      const res = await request(buildApp(false)).get(
        "/admin/brief-freshness.csv",
      );
      expect(res.status).toBe(401);
    });

    it("returns the real freshness data as an attachment CSV", async () => {
      const res = await request(buildApp()).get("/admin/brief-freshness.csv");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(
        /attachment; filename="brief-freshness\.csv"/,
      );
      const lines = res.text.split("\n");
      expect(lines[0]).toMatch(/^# Decision Brief freshness/);
      expect(lines).toContain("section,metric,value");
      expect(
        lines.some((l) => l.startsWith("summary,total_briefs,")),
      ).toBe(true);
      expect(lines.some((l) => l.startsWith("brief,"))).toBe(true);
    });
  });

  describe("GET /admin/brief-freshness (HTML)", () => {
    it("links to the CSV download in the footer", async () => {
      const res = await request(buildApp()).get("/admin/brief-freshness");
      expect(res.status).toBe(200);
      expect(res.text).toContain('href="/admin/brief-freshness.csv"');
    });
  });
});
