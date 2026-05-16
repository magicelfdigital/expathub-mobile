import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import {
  registerQuizSaveAnalyticsRoutes,
  resetQuizSaveAnalyticsEnsureCache,
} from "../quizSaveAnalytics";

type QueryHandler = (text: string, values?: unknown[]) => { rows: any[] };

function buildApp(opts: {
  authOk?: boolean;
  pool?: any;
}): Express {
  const app = express();
  registerQuizSaveAnalyticsRoutes(app, {
    requireAdminBasicAuth: (_req: Request, res: Response) => {
      if (opts.authOk === false) {
        res.status(401).set("WWW-Authenticate", "Basic").send("Unauthorized");
        return false;
      }
      return true;
    },
    getPool: () => (opts.pool === undefined ? null : (opts.pool as any)),
  });
  return app;
}

function fakePool(handler: QueryHandler) {
  return {
    query: jest.fn(async (text: string, values?: unknown[]) =>
      handler(text, values),
    ),
    end: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  resetQuizSaveAnalyticsEnsureCache();
});

describe.each([
  "/api/admin/quiz-save-analytics.csv",
  "/admin/quiz-save-analytics.csv",
])("GET %s", (csvPath) => {
  it("rejects unauthenticated requests via the admin gate", async () => {
    const app = buildApp({ authOk: false, pool: null });
    const res = await request(app).get(csvPath);
    expect(res.status).toBe(401);
  });

  it("returns 503 plain text when the database is not configured", async () => {
    const app = buildApp({ authOk: true, pool: null });
    const res = await request(app).get(csvPath);
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/not configured/i);
  });

  it("returns a sectioned CSV with totals, surface, placement and weekly blocks", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      if (/per_week/.test(text)) {
        return {
          rows: [
            // Per-(week, placement, surface) rows. Every active row is on
            // the mobile surface here so the per-surface summary section
            // can verify that totals land in the right bucket.
            {
              week_start: "2026-04-20",
              placement: "mid_quiz",
              surface: "web",
              shown: 20,
              submitted: 3,
              dismissed: 15,
            },
            {
              week_start: "2026-04-20",
              placement: "result_screen",
              surface: "mobile",
              shown: 20,
              submitted: 4,
              dismissed: 15,
            },
          ],
        };
      }
      if (/FROM quiz_save_events/.test(text)) {
        // The funnel breakdown query — return per-surface/per-placement counts.
        return {
          rows: [
            { event: "quiz_save_shown", surface: "web", placement: "mid_quiz", n: "20" },
            { event: "quiz_save_submitted", surface: "web", placement: "mid_quiz", n: "3" },
            { event: "quiz_save_shown", surface: "mobile", placement: "result_screen", n: "20" },
            { event: "quiz_save_submitted", surface: "mobile", placement: "result_screen", n: "4" },
          ],
        };
      }
      if (/FROM quiz_leads/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get(csvPath);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="quiz-save-analytics-30d-2026-04-20\.csv"/,
    );
    const lines = res.text.split("\n");
    expect(lines[0]).toMatch(/^# Quiz save-prompt analytics/);
    expect(lines).toContain(
      "section,key,shown,submitted,dismissed,recovery_rate",
    );
    // Totals + surface + placement rows are all present.
    expect(lines.some((l) => l.startsWith("totals,all,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("surface,web,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("surface,mobile,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("placement,mid_quiz,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("placement,result_screen,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("placement,unknown,"))).toBe(true);
    // Weekly section header + the active week row.
    expect(
      lines.some((l) =>
        l.startsWith("week_start,shown,submitted,dismissed,recovery_rate"),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.startsWith("2026-04-20,"))).toBe(true);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("honours the ?days window when computing the dataset", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get(`${csvPath}?days=7`);

    expect(res.status).toBe(200);
    const intervalCalls = pool.query.mock.calls.filter(
      ([, values]) => Array.isArray(values) && values[0] === "7 days",
    );
    expect(intervalCalls.length).toBeGreaterThan(0);
  });
});

describe("GET /admin/quiz-save-analytics (HTML)", () => {
  it("renders a Download CSV link in the footer wired to the /admin CSV endpoint", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get("/admin/quiz-save-analytics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain('href="/admin/quiz-save-analytics.csv?days=30"');
    expect(res.text).toContain("Download CSV");
  });

  it("preserves the active ?days window in the Download CSV link", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get("/admin/quiz-save-analytics?days=7");

    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/admin/quiz-save-analytics.csv?days=7"');
  });
});
