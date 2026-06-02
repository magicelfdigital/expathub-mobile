import express, { type Express } from "express";
import request from "supertest";

// Mirror the route-test pattern used by analytics.routes.test.ts /
// quizSaveAnalytics.routes.test.ts: mock `pg` so the inline probe route's
// `getPool()` hands back a fake pool whose `query` is driven by a per-test
// handler. This exercises the *actual* HTTP route
// (`/api/_internal/quiz-save-prompt-health`) end-to-end — status code, SQL
// wiring, and the pool.end() lifecycle — which the pure-logic unit tests in
// quizSavePromptHealth.test.ts cannot reach.

type QueryHandler = (text: string, values?: unknown[]) => { rows: any[] };

let queryHandler: QueryHandler = () => ({ rows: [] });
const poolEndMock = jest.fn<Promise<void>, []>();

jest.mock("pg", () => {
  class FakePool {
    query = (text: string, values?: unknown[]) =>
      Promise.resolve(queryHandler(text, values));
    end = () => poolEndMock();
  }
  return { __esModule: true, default: { Pool: FakePool }, Pool: FakePool };
});

jest.mock("stripe", () => {
  const Stripe = jest.fn().mockImplementation(() => ({}));
  return { __esModule: true, default: Stripe };
});

(global as any).fetch = jest.fn();

import { registerRoutes } from "../routes";
import { resetQuizSaveAnalyticsEnsureCache } from "../quizSaveAnalytics";

// Build the zero-filled daily series the probe's SQL would return: `trailing`
// are the baseline days (oldest-first) and `today` is the most recent complete
// day appended last — exactly the shape `computeQuizSavePromptHealth` maps.
function seriesRows(
  trailing: number[],
  today: number,
): Array<{ date: string; shown: number }> {
  const rows = trailing.map((shown, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    shown,
  }));
  rows.push({ date: "2026-05-31", shown: today });
  return rows;
}

// Stand in for the `quiz_save_events` table: the ensure-table migrations
// (CREATE TABLE / ALTER TABLE / CREATE INDEX) return nothing; the daily-count
// SELECT (identified by its generate_series CTE) returns the seeded series.
function seedPromptEvents(
  trailing: number[],
  today: number,
): QueryHandler {
  return (text: string) => {
    if (/generate_series/.test(text) && /FROM quiz_save_events/.test(text)) {
      return { rows: seriesRows(trailing, today) };
    }
    return { rows: [] };
  };
}

let app: Express;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://test";
  app = express();
  app.use(express.json());
  await registerRoutes(app);
});

beforeEach(() => {
  resetQuizSaveAnalyticsEnsureCache();
  poolEndMock.mockReset();
  poolEndMock.mockResolvedValue(undefined);
  queryHandler = () => ({ rows: [] });
});

describe("GET /api/_internal/quiz-save-prompt-health", () => {
  it("returns 503 with reason zero_today when the prompt went silent against a non-zero baseline", async () => {
    // Seven non-zero baseline days, then a zero evaluated day.
    queryHandler = seedPromptEvents([10, 12, 9, 11, 10, 13, 8], 0);

    const res = await request(app).get(
      "/api/_internal/quiz-save-prompt-health",
    );

    expect(res.status).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.reason).toBe("zero_today");
    expect(res.body.evaluated_day.shown).toBe(0);
    expect(res.body.placement).toBe("result_screen");
    expect(res.headers["cache-control"]).toBe("no-store");
    // The route must release the pool it opened, regardless of verdict.
    expect(poolEndMock).toHaveBeenCalledTimes(1);
  });

  it("returns 200 when the evaluated day is in line with the trailing baseline", async () => {
    queryHandler = seedPromptEvents([10, 12, 9, 11, 10, 13, 8], 11);

    const res = await request(app).get(
      "/api/_internal/quiz-save-prompt-health",
    );

    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.reason).toBe("ok");
    expect(res.body.evaluated_day.shown).toBe(11);
    expect(poolEndMock).toHaveBeenCalledTimes(1);
  });
});
