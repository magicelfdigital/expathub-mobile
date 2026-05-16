import express, { type Express } from "express";
import request from "supertest";

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

import {
  registerRoutes,
  getIdentifyMissingAnonIdCount,
  resetIdentifyMissingAnonIdCount,
} from "../routes";

function upstreamOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let app: Express;
let warnSpy: jest.SpyInstance;

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
  resetIdentifyMissingAnonIdCount();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("POST /api/analytics — $identify payload inspection", () => {
  it("warns and increments the counter when $identify is missing $anon_distinct_id", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());

    const res = await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:42",
        properties: {
          surface: "web",
          distinct_id: "user:42",
          // $anon_distinct_id is intentionally missing
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Event is still forwarded upstream so live data is never dropped.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("$anon_distinct_id");
    expect(getIdentifyMissingAnonIdCount()).toBe(1);
  });

  it("warns when $anon_distinct_id is present but empty", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:42",
        properties: {
          $anon_distinct_id: "",
          surface: "web",
        },
      });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(getIdentifyMissingAnonIdCount()).toBe(1);
  });

  it("stays silent for a well-formed $identify payload", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());

    const res = await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:42",
        properties: {
          $anon_distinct_id: "anon_abc123",
          surface: "web",
          distinct_id: "user:42",
        },
      });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(getIdentifyMissingAnonIdCount()).toBe(0);
  });

  it("ignores non-$identify events even when they have no $anon_distinct_id", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "quiz_started",
        distinct_id: "anon_abc123",
        properties: { surface: "web", distinct_id: "anon_abc123" },
      });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(getIdentifyMissingAnonIdCount()).toBe(0);
  });

  it("persists quiz_save_* events to quiz_save_events while still forwarding upstream", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());
    queryMock.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post("/api/analytics")
      .send({
        event: "quiz_save_submitted",
        distinct_id: "anon_xyz",
        properties: {
          surface: "web",
          distinct_id: "anon_xyz",
          placement: "mid_quiz",
        },
      });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Wait a tick so the fire-and-forget persistence path completes.
    await new Promise((resolve) => setImmediate(resolve));
    const insertCall = queryMock.mock.calls.find(([text]) =>
      /INSERT INTO quiz_save_events/.test(text),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual([
      "quiz_save_submitted",
      "web",
      "anon_xyz",
      "mid_quiz",
    ]);
  });

  it("does not persist non-quiz-save events even if a pool is available", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());
    queryMock.mockResolvedValue({ rows: [] });

    await request(app)
      .post("/api/analytics")
      .send({
        event: "quiz_completed",
        distinct_id: "anon_qc",
        properties: { surface: "web" },
      });

    await new Promise((resolve) => setImmediate(resolve));
    const insertCall = queryMock.mock.calls.find(([text]) =>
      /INSERT INTO quiz_save_events/.test(text),
    );
    expect(insertCall).toBeUndefined();
  });

  it("reports healthy (HTTP 200) when no warnings have fired", async () => {
    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.identify_missing_anon_id.count).toBe(0);
    expect(res.body.identify_missing_anon_id.last_seen_at).toBeNull();
    expect(res.body.identify_missing_anon_id.by_surface).toEqual({});
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("tracks the surface of the missing-anon-id warning", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:1",
        properties: { surface: "mobile" },
      });
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:2",
        properties: { surface: "web" },
      });
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:3",
        properties: { surface: "mobile" },
      });

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.identify_missing_anon_id.count).toBe(3);
    expect(res.body.identify_missing_anon_id.by_surface).toEqual({
      mobile: 2,
      web: 1,
    });
    expect(typeof res.body.identify_missing_anon_id.last_seen_at).toBe(
      "string",
    );
  });

  it("still responds 200 (and warns once) when the upstream proxy throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const res = await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:42",
        properties: { surface: "web" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(getIdentifyMissingAnonIdCount()).toBe(1);
  });
});
