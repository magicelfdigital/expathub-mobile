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
            // Per-(week, placement, surface) rows. Every active row is on
            // the mobile surface here so the per-surface summary section
            // can verify that totals land in the right bucket.
            {
              week_start: "2026-04-20",
              placement: "mid_quiz",
              surface: "mobile",
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
            {
              week_start: "2026-04-20",
              placement: "unknown",
              surface: "mobile",
              shown: 0,
              submitted: 0,
              dismissed: 0,
            },
          ],
        };
      }
      if (/FROM quiz_save_events/.test(text)) {
        // Powers totals + per-surface breakdown in the summary section.
        return {
          rows: [
            { event: "quiz_save_shown", surface: "mobile", placement: "mid_quiz", n: "20" },
            { event: "quiz_save_submitted", surface: "mobile", placement: "mid_quiz", n: "3" },
            { event: "quiz_save_dismissed", surface: "mobile", placement: "mid_quiz", n: "15" },
            { event: "quiz_save_shown", surface: "mobile", placement: "result_screen", n: "20" },
            { event: "quiz_save_submitted", surface: "mobile", placement: "result_screen", n: "4" },
            { event: "quiz_save_dismissed", surface: "mobile", placement: "result_screen", n: "15" },
          ],
        };
      }
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
    const lines = res.text.split("\n");
    // First line documents the window in days so a downloaded CSV is
    // self-describing — the team can tell at a glance what `?days=` was
    // in effect when the file was generated.
    expect(lines[0]).toBe("# window_days,30");
    // Summary section comes first with totals + per-surface breakdown.
    expect(lines[1]).toBe("scope,shown,submitted,dismissed,recovery_rate");
    expect(lines.slice(2, 5)).toEqual([
      "total,40,7,30,0.1750",
      "web,0,0,0,",
      "mobile,40,7,30,0.1750",
    ]);
    // Weekly section follows, separated by a blank line and its own header.
    expect(lines).toContain(
      "week_start,shown,submitted,dismissed,recovery_rate,mid_quiz_shown,mid_quiz_submitted,mid_quiz_recovery_rate,result_screen_shown,result_screen_submitted,result_screen_recovery_rate,unknown_shown,unknown_submitted,unknown_recovery_rate",
    );
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
    // Default window is 30 days; the CSV link must preserve it so a
    // download matches what the user is looking at on the dashboard.
    expect(res.text).toContain('href="/api/admin/quiz-save-analytics.csv?days=30"');
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
    expect(res.text).toContain('href="/api/admin/quiz-save-analytics.csv?days=7"');
  });
});
