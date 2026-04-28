import express, { type Express } from "express";
import request from "supertest";

type QueryCall = { text: string; values: any[] };

const queryMock = jest.fn<Promise<{ rows: any[] }>, [string, any[]?]>();
const poolEndMock = jest.fn<Promise<void>, []>();
const poolFactoryMock = jest.fn();

jest.mock("pg", () => {
  class FakePool {
    constructor(opts: any) {
      poolFactoryMock(opts);
    }
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

function authResponse(userId: string | number): Response {
  return new Response(JSON.stringify({ user: { id: userId } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
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
  poolFactoryMock.mockReset();
  fetchMock.mockReset();
});

describe("GET /api/progress", () => {
  it("returns 401 when no Authorization header is present", async () => {
    fetchMock.mockResolvedValueOnce(unauthorizedResponse());
    const res = await request(app).get("/api/progress?country=portugal");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the country query parameter is missing", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));
    const res = await request(app)
      .get("/api/progress")
      .set("Authorization", "Bearer token-x");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "country is required" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("seeds the default progress rows and returns the per-step list", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));

    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("INSERT INTO user_progress")) {
        return { rows: [] };
      }
      // SELECT step_id, completed, completed_at FROM user_progress ...
      return {
        rows: [
          { step_id: "research_quiz", completed: true, completed_at: "2026-01-01T00:00:00Z" },
          { step_id: "shortlist_built", completed: false, completed_at: null },
        ],
      };
    });

    const res = await request(app)
      .get("/api/progress?country=portugal")
      .set("Authorization", "Bearer token-x");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { stepId: "research_quiz", completed: true, completedAt: "2026-01-01T00:00:00Z" },
      { stepId: "shortlist_built", completed: false, completedAt: null },
    ]);

    const insertCalls = queryMock.mock.calls.filter(([t]) =>
      t.includes("INSERT INTO user_progress"),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    for (const [, values] of insertCalls) {
      expect(values?.[0]).toBe("user_42");
      expect(values?.[2]).toBe("portugal");
    }

    const selectCall = queryMock.mock.calls.find(([t]) =>
      t.includes("SELECT step_id, completed, completed_at"),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall?.[1]).toEqual(["user_42", "portugal"]);
  });
});

describe("POST /api/progress", () => {
  it("returns 401 without a valid bearer token", async () => {
    fetchMock.mockResolvedValueOnce(unauthorizedResponse());
    const res = await request(app)
      .post("/api/progress")
      .send({ country: "portugal", stepId: "research_quiz", completed: true });
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the country field is missing from the body", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));
    const res = await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-x")
      .send({ stepId: "research_quiz", completed: true });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "country, stepId and completed are required",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the stepId is not a known generic step", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));
    const res = await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-x")
      .send({ country: "portugal", stepId: "not_a_real_step", completed: true });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Unknown stepId" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("performs an upsert keyed by (user_id, step_id, target_country) — insert path", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-x")
      .send({ country: "portugal", stepId: "research_quiz", completed: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      stepId: "research_quiz",
      completed: true,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [text, values] = queryMock.mock.calls[0] as [string, any[]];
    expect(text).toMatch(/INSERT INTO user_progress/);
    expect(text).toMatch(/ON CONFLICT \(user_id, step_id, target_country\)/);
    expect(values[0]).toBe("user_42");
    expect(values[1]).toBe("research_quiz");
    expect(values[2]).toBe("portugal");
    expect(values[3]).toBe(true);
    expect(values[4]).toBeInstanceOf(Date);
  });

  it("supports the update path (toggling completed back to false stores a null timestamp)", async () => {
    fetchMock.mockResolvedValueOnce(authResponse("user_42"));
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-x")
      .send({ country: "portugal", stepId: "shortlist_built", completed: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      stepId: "shortlist_built",
      completed: false,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [text, values] = queryMock.mock.calls[0] as [string, any[]];
    expect(text).toMatch(/ON CONFLICT/);
    expect(values[3]).toBe(false);
    expect(values[4]).toBeNull();
  });

  it("isolates rows by (user_id, step_id, target_country) — distinct users hit distinct rows", async () => {
    // First request: user A, country portugal
    fetchMock.mockResolvedValueOnce(authResponse("user_A"));
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-A")
      .send({ country: "portugal", stepId: "research_quiz", completed: true });

    // Second request: user B, country portugal — same step
    fetchMock.mockResolvedValueOnce(authResponse("user_B"));
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-B")
      .send({ country: "portugal", stepId: "research_quiz", completed: true });

    // Third request: user A, country spain — same step, different country
    fetchMock.mockResolvedValueOnce(authResponse("user_A"));
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .post("/api/progress")
      .set("Authorization", "Bearer token-A")
      .send({ country: "spain", stepId: "research_quiz", completed: true });

    expect(queryMock).toHaveBeenCalledTimes(3);
    const tuples = queryMock.mock.calls.map(
      ([, values]) => [values?.[0], values?.[1], values?.[2]] as const,
    );
    expect(tuples).toEqual([
      ["user_A", "research_quiz", "portugal"],
      ["user_B", "research_quiz", "portugal"],
      ["user_A", "research_quiz", "spain"],
    ]);
    // All three are distinct composite keys.
    const uniqueKeys = new Set(tuples.map((t) => t.join("|")));
    expect(uniqueKeys.size).toBe(3);
  });
});
