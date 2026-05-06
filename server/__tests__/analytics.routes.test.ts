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
