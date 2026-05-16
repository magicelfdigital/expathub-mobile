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

describe("GET /api/admin/quiz-save-analytics.csv", () => {
  it("rejects unauthenticated requests via the admin gate", async () => {
    const app = buildApp({ authOk: false, pool: null });
    const res = await request(app).get("/api/admin/quiz-save-analytics.csv");
    expect(res.status).toBe(401);
  });

  it("returns 503 plain text when the database is not configured", async () => {
    const app = buildApp({ authOk: true, pool: null });
    const res = await request(app).get("/api/admin/quiz-save-analytics.csv");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/not configured/i);
  });

  it("returns CSV with the expected headers, content type, and filename", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      if (/per_week/.test(text)) {
        return {
          rows: [
            {
              week_start: "2026-04-20",
              placement: "mid_quiz",
              shown: 20,
              submitted: 3,
              dismissed: 15,
            },
            {
              week_start: "2026-04-20",
              placement: "result_screen",
              shown: 20,
              submitted: 4,
              dismissed: 15,
            },
            {
              week_start: "2026-04-20",
              placement: "unknown",
              shown: 0,
              submitted: 0,
              dismissed: 0,
            },
          ],
        };
      }
      if (/FROM quiz_save_events/.test(text)) return { rows: [] };
      if (/FROM quiz_leads/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get("/api/admin/quiz-save-analytics.csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="quiz-save-weekly-2026-04-20\.csv"/,
    );
    const lines = res.text.trim().split("\n");
    // First line is the schema header so spreadsheet importers can map fields.
    expect(lines[0]).toContain("week_start,shown,submitted,dismissed,recovery_rate");
    expect(lines[0]).toContain("mid_quiz_shown");
    expect(lines[0]).toContain("result_screen_recovery_rate");
    expect(lines[0]).toContain("unknown_recovery_rate");
    // Body row for the active week reflects the fake placement rows above.
    const activeRow = lines.find((l) => l.startsWith("2026-04-20,"));
    expect(activeRow).toBe(
      "2026-04-20,40,7,30,0.1750,20,3,0.1500,20,4,0.2000,0,0,",
    );
    // Always closes the pool so connections aren't leaked across requests.
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("honours the ?days window when computing the dataset", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get(
      "/api/admin/quiz-save-analytics.csv?days=7",
    );

    expect(res.status).toBe(200);
    const intervalCalls = pool.query.mock.calls.filter(
      ([, values]) => Array.isArray(values) && values[0] === "7 days",
    );
    expect(intervalCalls.length).toBeGreaterThan(0);
  });
});

describe("GET /admin/quiz-save-analytics (HTML)", () => {
  it("renders a Download CSV link wired to the CSV endpoint", async () => {
    const pool = fakePool((text) => {
      if (/CREATE TABLE/.test(text)) return { rows: [] };
      if (/ALTER TABLE/.test(text)) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp({ authOk: true, pool });

    const res = await request(app).get("/admin/quiz-save-analytics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain('href="/api/admin/quiz-save-analytics.csv"');
    expect(res.text).toContain("Download CSV");
  });
});
