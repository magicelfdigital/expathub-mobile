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
  getCrossDeviceBridgeCount,
  getCrossDeviceBridgeFailureCount,
  getCrossDeviceBridgeLastFailureAt,
  resetCrossDeviceBridgeState,
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
  resetCrossDeviceBridgeState();
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
    expect(res.body.cross_device_bridge).toEqual({
      emitted: 0,
      failed: 0,
      last_failure_at: null,
    });
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

  it("bridges email-keyed and user-keyed distinct_ids seen on different devices", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    // Device A: visitor enters email at the gate. Anon promoted to email:<hash>.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "email:abc",
        properties: {
          $anon_distinct_id: "anon:phone",
          email_sha256: "abc",
          surface: "mobile",
        },
      });

    // Only the original event has been forwarded; no bridge needed yet
    // because this is the first time we've seen this email.
    expect(getCrossDeviceBridgeCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Device B: visitor registers on a laptop and skips the gate, so the
    // laptop's anon is promoted straight to user:<id>.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:42",
        properties: {
          $anon_distinct_id: "anon:laptop",
          email_sha256: "abc",
          surface: "web",
        },
      });

    // The server should have forwarded an extra $identify aliasing the
    // device-A email-keyed id to the device-B user-keyed id so PostHog
    // merges them server-to-server.
    expect(getCrossDeviceBridgeCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Find the synthetic bridge call among the three fetches by its
    // surface marker — order with the original forward isn't guaranteed.
    const bridgeCall = fetchMock.mock.calls.find(([, init]) => {
      try {
        return JSON.parse((init as any).body).properties?.surface ===
          "server_reconcile";
      } catch {
        return false;
      }
    });
    expect(bridgeCall).toBeDefined();
    expect(bridgeCall![0]).toBe("https://www.expathub.website/api/analytics");
    const bridgeBody = JSON.parse(bridgeCall![1].body);
    expect(bridgeBody.event).toBe("$identify");
    expect(bridgeBody.distinct_id).toBe("user:42");
    expect(bridgeBody.properties.$anon_distinct_id).toBe("email:abc");
    expect(bridgeBody.properties.email_sha256).toBe("abc");
    expect(bridgeBody.properties.surface).toBe("server_reconcile");
  });

  it("does not bridge when the same distinct_id re-identifies with the same email", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    const payload = {
      event: "$identify",
      distinct_id: "email:dup",
      properties: {
        $anon_distinct_id: "anon:1",
        email_sha256: "dup",
        surface: "mobile",
      },
    };
    await request(app).post("/api/analytics").send(payload);
    await request(app).post("/api/analytics").send(payload);

    expect(getCrossDeviceBridgeCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores $identify events without an email_sha256 trait", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:7",
        properties: {
          $anon_distinct_id: "anon:7",
          surface: "web",
        },
      });

    expect(getCrossDeviceBridgeCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aliases toward email:<hash> when an anon id arrives after a known email id", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    // First we see the email-keyed id (higher tier).
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "email:rank",
        properties: {
          $anon_distinct_id: "anon:first",
          email_sha256: "rank",
          surface: "mobile",
        },
      });

    // Then a bare anon id $identify happens against the same email (unusual,
    // but defensive). The bridge should keep the email-keyed id as the
    // surviving distinct_id rather than demote it.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "anon:second",
        properties: {
          email_sha256: "rank",
          surface: "web",
        },
      });

    expect(getCrossDeviceBridgeCount()).toBe(1);
    const bridgeCall = fetchMock.mock.calls.find(([, init]) => {
      try {
        return JSON.parse((init as any).body).properties?.surface ===
          "server_reconcile";
      } catch {
        return false;
      }
    });
    expect(bridgeCall).toBeDefined();
    const bridgeBody = JSON.parse(bridgeCall![1].body);
    expect(bridgeBody.distinct_id).toBe("email:rank");
    expect(bridgeBody.properties.$anon_distinct_id).toBe("anon:second");
  });

  it("does not re-emit the same bridge when a known distinct_id re-identifies", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    // Device A: email gate.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "email:dedup",
        properties: {
          $anon_distinct_id: "anon:phone",
          email_sha256: "dedup",
          surface: "mobile",
        },
      });

    // Device B: register. First time we see this pair — bridge fires.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:7",
        properties: {
          $anon_distinct_id: "anon:laptop",
          email_sha256: "dedup",
          surface: "web",
        },
      });
    expect(getCrossDeviceBridgeCount()).toBe(1);

    // Device B fires $identify a few more times (e.g. user re-opens the
    // app). The (user:7, email:dedup) pair is already bridged upstream,
    // so we should not emit another bridge — just noise.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:7",
        properties: {
          $anon_distinct_id: "anon:laptop2",
          email_sha256: "dedup",
          surface: "web",
        },
      });
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:7",
        properties: {
          $anon_distinct_id: "anon:laptop3",
          email_sha256: "dedup",
          surface: "web",
        },
      });

    // Still exactly one bridge for the (user:7 ← email:dedup) pair.
    // The repeated $identify events from user:7 carry their own
    // $anon_distinct_id (anon:laptop2 / anon:laptop3) in the original
    // forwarded payload, so PostHog already merges those anons → user:7
    // off the client identify. The server doesn't need to emit any extra
    // bridge — the only cross-device pair (email:dedup ← user:7) was
    // already aliased the first time.
    expect(getCrossDeviceBridgeCount()).toBe(1);
  });

  it("records and warns on bridge failure when upstream rejects the merge", async () => {
    // Device A's original $identify is forwarded successfully.
    fetchMock.mockResolvedValueOnce(upstreamOk());
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "email:fail",
        properties: {
          $anon_distinct_id: "anon:phone",
          email_sha256: "fail",
          surface: "mobile",
        },
      });

    // Device B fires next. The bridge fetch is the first call after this
    // (because reconcile runs before the upstream forward), so make the
    // *next* fetch — the bridge — reject; the device-B forward that follows
    // it succeeds.
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    fetchMock.mockResolvedValueOnce(upstreamOk());
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:99",
        properties: {
          $anon_distinct_id: "anon:laptop",
          email_sha256: "fail",
          surface: "web",
        },
      });

    // Wait for the bridge's .catch handler to fire.
    await new Promise((resolve) => setImmediate(resolve));

    expect(getCrossDeviceBridgeCount()).toBe(1);
    expect(getCrossDeviceBridgeFailureCount()).toBe(1);
    expect(typeof getCrossDeviceBridgeLastFailureAt()).toBe("string");
    const bridgeWarn = warnSpy.mock.calls.find(([msg]) =>
      String(msg).includes("cross-device $identify bridge failed"),
    );
    expect(bridgeWarn).toBeDefined();
    expect(bridgeWarn?.[1]?.email_sha256_prefix).toBe("fail");
    expect(bridgeWarn?.[1]?.distinct_id).toBe("user:99");
    expect(bridgeWarn?.[1]?.anon_distinct_id).toBe("email:fail");

    // Health probe should flip to unhealthy (HTTP 503) on a bridge failure
    // even though no missing-anon-id warnings have fired — the bridge is
    // the mechanism that prevents cross-device double-counting.
    const health = await request(app).get("/api/_internal/analytics-health");
    expect(health.status).toBe(503);
    expect(health.body.healthy).toBe(false);
    expect(health.body.cross_device_bridge.emitted).toBe(1);
    expect(health.body.cross_device_bridge.failed).toBe(1);
    expect(typeof health.body.cross_device_bridge.last_failure_at).toBe(
      "string",
    );
  });

  it("records bridge failure when upstream returns a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk());
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "email:s5",
        properties: {
          $anon_distinct_id: "anon:a",
          email_sha256: "s5",
          surface: "mobile",
        },
      });

    fetchMock.mockResolvedValueOnce(
      new Response("upstream broken", { status: 502 }),
    );
    fetchMock.mockResolvedValueOnce(upstreamOk());
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:5",
        properties: {
          $anon_distinct_id: "anon:b",
          email_sha256: "s5",
          surface: "web",
        },
      });

    await new Promise((resolve) => setImmediate(resolve));

    expect(getCrossDeviceBridgeCount()).toBe(1);
    expect(getCrossDeviceBridgeFailureCount()).toBe(1);
    const bridgeWarn = warnSpy.mock.calls.find(([msg]) =>
      String(msg).includes("cross-device $identify bridge failed"),
    );
    expect(bridgeWarn?.[1]?.reason).toContain("upstream_status_502");
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
