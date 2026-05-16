/**
 * Server-level test for the worksheet free-tier gate (task #80).
 *
 * The "one free worksheet per user" rule lives in two endpoints:
 *   - GET  /api/worksheets/:worksheetId
 *   - POST /api/worksheets/:worksheetId/submit
 *
 * For a non-entitled user, both endpoints must:
 *   - return 200 when the user has 0 prior responses (their one free
 *     worksheet) OR is acting on a worksheet they already submitted
 *     (editing path)
 *   - return 402 when the user has >=1 prior response on a DIFFERENT
 *     worksheet (the paywall backstop)
 *
 * These tests stub the upstream entitlement check to "not entitled" and
 * use the pg.Pool mock to simulate the prior-responses query.
 */

import express, { type Express } from "express";
import request from "supertest";

const queryMock = jest.fn<Promise<{ rows: any[] }>, [string, any[]?]>();
const poolEndMock = jest.fn<Promise<void>, []>();

jest.mock("pg", () => {
  class FakePool {
    constructor(_opts: any) {}
    query = (text: string, values?: any[]) => queryMock(text, values);
    end = () => poolEndMock();
  }
  return { __esModule: true, default: { Pool: FakePool }, Pool: FakePool };
});

jest.mock("stripe", () => {
  const Stripe = jest.fn().mockImplementation(() => ({}));
  return { __esModule: true, default: Stripe };
});

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

import { registerRoutes } from "../routes";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub upstream so the user is authenticated but NOT entitled.
 * Each request to a worksheet endpoint triggers two upstream calls:
 *   1. /api/auth/me           → resolves the user id from the bearer token
 *   2. /api/entitlements      → checked by hasActiveEntitlement
 * We return 401 for entitlements so the route falls through to the
 * reverse-trial check, which finds no row and reports the user as
 * non-entitled.
 */
function stubFreeUser(userId: string) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/auth/me")) {
      return jsonResponse({ user: { id: userId } });
    }
    if (url.endsWith("/api/entitlements")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    return jsonResponse({}, 404);
  });
}

/**
 * Default pool.query handler. Returns []/{} for ensure-table and seed
 * statements, an empty reverse-trial lookup, and delegates the
 * user_worksheet_responses SELECT to the per-test override.
 */
function setPoolQueryHandler(priorWorksheetIds: string[]) {
  queryMock.mockImplementation(async (text: string) => {
    if (/SELECT worksheet_id FROM user_worksheet_responses/i.test(text)) {
      return { rows: priorWorksheetIds.map((id) => ({ worksheet_id: id })) };
    }
    if (/SELECT started_at FROM user_reverse_trials/i.test(text)) {
      return { rows: [] };
    }
    // CREATE TABLE / CREATE INDEX / INSERT seed → noop.
    return { rows: [] };
  });
}

let app: Express;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://test";
  app = express();
  app.use(express.json());
  await registerRoutes(app);
});

beforeEach(() => {
  queryMock.mockReset();
  poolEndMock.mockReset();
  poolEndMock.mockResolvedValue(undefined);
  fetchMock.mockReset();
});

describe("GET /api/worksheets/:worksheetId — free-tier gate", () => {
  it("returns 200 for a non-entitled user with zero prior responses (their one free worksheet)", async () => {
    stubFreeUser("user_1");
    setPoolQueryHandler([]);

    const res = await request(app)
      .get("/api/worksheets/ws_financial_cushion")
      .set("Authorization", "Bearer token-x");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ws_financial_cushion");
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeGreaterThan(0);
  });

  it("returns 402 for a non-entitled user who already submitted a DIFFERENT worksheet", async () => {
    stubFreeUser("user_2");
    setPoolQueryHandler(["ws_income_stability"]);

    const res = await request(app)
      .get("/api/worksheets/ws_financial_cushion")
      .set("Authorization", "Bearer token-x");

    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "Subscription required" });
  });

  it("returns 200 for a non-entitled user editing the worksheet they already submitted", async () => {
    stubFreeUser("user_3");
    setPoolQueryHandler(["ws_financial_cushion"]);

    const res = await request(app)
      .get("/api/worksheets/ws_financial_cushion")
      .set("Authorization", "Bearer token-x");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ws_financial_cushion");
  });
});

describe("POST /api/worksheets/:worksheetId/submit — free-tier gate", () => {
  // Use the financial-cushion worksheet's actual question ids/values so
  // validateAnswersShape + scoreWorksheet accept the payload.
  const VALID_ANSWERS = {
    savings_months: "6to12",
    expenses_priced: 4,
    comfort_drawdown: 3,
  };

  it("returns 200 for a non-entitled user submitting their first worksheet", async () => {
    stubFreeUser("user_4");
    setPoolQueryHandler([]);

    const res = await request(app)
      .post("/api/worksheets/ws_financial_cushion/submit")
      .set("Authorization", "Bearer token-x")
      .send({ answers: VALID_ANSWERS });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.worksheetId).toBe("ws_financial_cushion");
    expect(typeof res.body.dimensionScore).toBe("number");
  });

  it("returns 402 for a non-entitled user submitting a SECOND distinct worksheet", async () => {
    stubFreeUser("user_5");
    setPoolQueryHandler(["ws_income_stability"]);

    const res = await request(app)
      .post("/api/worksheets/ws_financial_cushion/submit")
      .set("Authorization", "Bearer token-x")
      .send({ answers: VALID_ANSWERS });

    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "Subscription required" });
  });

  it("returns 200 for a non-entitled user RE-submitting (editing) their already-completed worksheet", async () => {
    stubFreeUser("user_6");
    setPoolQueryHandler(["ws_financial_cushion"]);

    const res = await request(app)
      .post("/api/worksheets/ws_financial_cushion/submit")
      .set("Authorization", "Bearer token-x")
      .send({ answers: VALID_ANSWERS });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.worksheetId).toBe("ws_financial_cushion");
  });
});
