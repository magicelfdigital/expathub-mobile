import { extractBriefs, buildFreshnessReport } from "../briefFreshness";

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
});
