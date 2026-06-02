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
  resetIdentifyMissingAnonEnsureCache,
  getCrossDeviceBridgeCount,
  getCrossDeviceBridgeFailureCount,
  getCrossDeviceBridgeLastFailureAt,
  resetCrossDeviceBridgeState,
  resetAuthPromptBackfillFreshnessCache,
  getLastBackfillStaleAlertAt,
} from "../routes";

// Routes queryMock to the durable missing-anon-id store so the health probe
// (which now reads from Postgres) returns deterministic totals. CREATE
// TABLE / INDEX statements resolve empty; the totals SELECT and per-surface
// GROUP BY return the supplied rows. Everything else resolves empty.
function mockMissingAnonDb(
  totals: { all_time: number; last_24h: number; last_seen: string | null },
  bySurface: Array<{ surface: string; c: number }> = [],
): void {
  queryMock.mockImplementation((text: string) => {
    if (/CREATE TABLE|CREATE INDEX/i.test(text)) {
      return Promise.resolve({ rows: [] });
    }
    if (/AS all_time/i.test(text)) {
      return Promise.resolve({ rows: [totals] });
    }
    if (/GROUP BY/i.test(text) && /identify_missing_anon_events/i.test(text)) {
      return Promise.resolve({ rows: bySurface });
    }
    return Promise.resolve({ rows: [] });
  });
}

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
  // Default: all queries resolve empty. The health probe's DB read tolerates
  // empty rows (treats them as zero counts); individual tests override this
  // via mockMissingAnonDb when they need specific totals.
  queryMock.mockResolvedValue({ rows: [] });
  poolEndMock.mockReset();
  poolEndMock.mockResolvedValue(undefined);
  poolFactoryMock.mockReset();
  fetchMock.mockReset();
  resetIdentifyMissingAnonIdCount();
  resetIdentifyMissingAnonEnsureCache();
  resetCrossDeviceBridgeState();
  resetAuthPromptBackfillFreshnessCache();
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
    mockMissingAnonDb({ all_time: 0, last_24h: 0, last_seen: null });
    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.identify_missing_anon_id.count).toBe(0);
    expect(res.body.identify_missing_anon_id.all_time_count).toBe(0);
    expect(res.body.identify_missing_anon_id.last_24h_count).toBe(0);
    expect(res.body.identify_missing_anon_id.last_seen_at).toBeNull();
    expect(res.body.identify_missing_anon_id.by_surface).toEqual({});
    expect(res.body.cross_device_bridge).toEqual({
      emitted: 0,
      failed: 0,
      last_failure_at: null,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("persists each missing-anon event to identify_missing_anon_events", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:1",
        properties: { surface: "mobile" },
      });
    // No $anon_distinct_id and no distinct_id at all — should persist a null
    // distinct_id with the "unknown" surface fallback.
    await request(app)
      .post("/api/analytics")
      .send({ event: "$identify", properties: {} });

    // Wait a tick so the fire-and-forget persistence path completes.
    await new Promise((resolve) => setImmediate(resolve));
    const inserts = queryMock.mock.calls.filter(([text]) =>
      /INSERT INTO identify_missing_anon_events/.test(text),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.[1]).toEqual(["mobile", "user:1"]);
    expect(inserts[1]?.[1]).toEqual(["unknown", null]);
  });

  it("does not persist a well-formed $identify to the missing-anon table", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:1",
        properties: { $anon_distinct_id: "anon:ok", surface: "web" },
      });

    await new Promise((resolve) => setImmediate(resolve));
    const insert = queryMock.mock.calls.find(([text]) =>
      /INSERT INTO identify_missing_anon_events/.test(text),
    );
    expect(insert).toBeUndefined();
  });

  it("reports durable all-time and 24h counts and per-surface totals from the DB", async () => {
    mockMissingAnonDb(
      { all_time: 12, last_24h: 3, last_seen: "2026-06-01T00:00:00.000Z" },
      [
        { surface: "mobile", c: 9 },
        { surface: "web", c: 3 },
      ],
    );

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.identify_missing_anon_id.count).toBe(12);
    expect(res.body.identify_missing_anon_id.all_time_count).toBe(12);
    expect(res.body.identify_missing_anon_id.last_24h_count).toBe(3);
    expect(res.body.identify_missing_anon_id.by_surface).toEqual({
      mobile: 9,
      web: 3,
    });
    expect(res.body.identify_missing_anon_id.last_seen_at).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("stays healthy when there are old events but none in the last 24h", async () => {
    // Durable all-time count is non-zero (ancient regression already logged)
    // but the rolling 24h window is clean — the alert should auto-clear.
    mockMissingAnonDb(
      { all_time: 8, last_24h: 0, last_seen: "2026-01-01T00:00:00.000Z" },
      [{ surface: "mobile", c: 8 }],
    );

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.identify_missing_anon_id.all_time_count).toBe(8);
    expect(res.body.identify_missing_anon_id.last_24h_count).toBe(0);
  });

  it("falls back to in-memory counters when the DB read fails", async () => {
    fetchMock.mockResolvedValue(upstreamOk());

    // Record one missing-anon event in-memory via the inspection path.
    await request(app)
      .post("/api/analytics")
      .send({
        event: "$identify",
        distinct_id: "user:1",
        properties: { surface: "mobile" },
      });
    expect(getIdentifyMissingAnonIdCount()).toBe(1);

    // Now make every DB query reject so the health read fails.
    queryMock.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/_internal/analytics-health");
    // Falls back to the in-memory count (1), so still reports unhealthy.
    expect(res.status).toBe(503);
    expect(res.body.identify_missing_anon_id.count).toBe(1);
    expect(res.body.identify_missing_anon_id.last_24h_count).toBe(1);
    expect(res.body.identify_missing_anon_id.by_surface).toEqual({
      mobile: 1,
    });
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

describe.each(["/admin/ab-results.csv", "/api/admin/ab-results.csv"])(
  "GET %s",
  (csvPath) => {
    const ADMIN_USER = "admin";
    const ADMIN_PASS = "secret";

    beforeAll(() => {
      process.env.ADMIN_BASIC_USER = ADMIN_USER;
      process.env.ADMIN_BASIC_PASS = ADMIN_PASS;
    });

    afterAll(() => {
      delete process.env.ADMIN_BASIC_USER;
      delete process.env.ADMIN_BASIC_PASS;
    });

    it("rejects requests without admin credentials", async () => {
      const res = await request(app).get(csvPath);
      expect(res.status).toBe(401);
    });

    it("returns a sectioned CSV with a flags block and per-variant rows", async () => {
      queryMock.mockImplementation((text: string) => {
        if (/FROM ab_test_assignments/.test(text)) {
          return Promise.resolve({
            rows: [
              {
                test_name: "annual_price",
                variant: "annual_89",
                visitors: 100,
                conversions: 5,
                revenue_day_0: 445,
                revenue_day_60: 890,
              },
              {
                test_name: "annual_price",
                variant: "annual_99",
                visitors: 80,
                conversions: 2,
                revenue_day_0: 198,
                revenue_day_60: 198,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).get(csvPath).auth(ADMIN_USER, ADMIN_PASS);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(
        /attachment; filename="ab-results\.csv"/,
      );
      const lines = res.text.split("\n");
      expect(lines[0]).toMatch(/^# A\/B test results/);
      expect(lines).toContain("section,key,value");
      expect(
        lines.some((l) => l.startsWith("flags,annual_price_enabled,")),
      ).toBe(true);
      expect(lines).toContain(
        "section,test,variant,visitors,conversions,conversion_rate,revenue_day_0,revenue_day_60,arpu_day_60",
      );
      expect(lines).toContain(
        "variant,annual_price,annual_89,100,5,0.0500,445.00,890.00,8.90",
      );
      expect(lines).toContain(
        "variant,annual_price,annual_99,80,2,0.0250,198.00,198.00,2.48",
      );
      expect(poolEndMock).toHaveBeenCalled();
    });
  },
);

describe("A/B results — optional ?days=N date window", () => {
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "secret";

  beforeAll(() => {
    process.env.ADMIN_BASIC_USER = ADMIN_USER;
    process.env.ADMIN_BASIC_PASS = ADMIN_PASS;
  });

  afterAll(() => {
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASS;
  });

  // Capture the (text, values) of the aggregation query so each test can
  // assert the exact windowed query shape that hit the pool.
  function captureAbQuery(): () => { text: string; values: any[] | undefined } {
    let captured: { text: string; values: any[] | undefined } = {
      text: "",
      values: undefined,
    };
    queryMock.mockImplementation((text: string, values?: any[]) => {
      if (/FROM ab_test_assignments/.test(text)) {
        captured = { text, values };
        return Promise.resolve({
          rows: [
            {
              test_name: "annual_price",
              variant: "annual_89",
              visitors: 10,
              conversions: 1,
              revenue_day_0: 89,
              revenue_day_60: 89,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    return () => captured;
  }

  it("aggregates over all time (no interval param) when ?days is absent", async () => {
    const getQuery = captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBeNull();
    const { text, values } = getQuery();
    expect(text).not.toMatch(/assigned_at >= NOW/);
    expect(values).toBeUndefined();
  });

  it("restricts assignments and conversions to the trailing window for ?days=30", async () => {
    const getQuery = captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results?days=30")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(30);
    const { text, values } = getQuery();
    expect(text).toMatch(/a\.assigned_at >= NOW\(\) - \$1::interval/);
    expect(text).toMatch(/c\.created_at >= NOW\(\) - \$1::interval/);
    expect(values).toEqual(["30 days"]);
  });

  it("clamps ?days above 365 down to 365", async () => {
    const getQuery = captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results?days=10000")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(365);
    expect(getQuery().values).toEqual(["365 days"]);
  });

  it("treats a non-positive / non-numeric ?days as all-time", async () => {
    const getQuery = captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results?days=abc")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBeNull();
    expect(getQuery().values).toBeUndefined();
  });

  it("notes the active window in the CSV when ?days is set", async () => {
    captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results.csv?days=30")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    const lines = res.text.split("\n");
    expect(lines[0]).toBe("# A/B test results (last 30 days)");
    expect(lines).toContain("window,days,30");
  });

  it("notes all-time in the CSV when ?days is absent", async () => {
    captureAbQuery();
    const res = await request(app)
      .get("/api/admin/ab-results.csv")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    const lines = res.text.split("\n");
    expect(lines[0]).toBe("# A/B test results (all time)");
    expect(lines).toContain("window,days,all");
  });
});

describe("GET /admin/ab-results — HTML dashboard", () => {
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "secret";

  beforeAll(() => {
    process.env.ADMIN_BASIC_USER = ADMIN_USER;
    process.env.ADMIN_BASIC_PASS = ADMIN_PASS;
  });

  afterAll(() => {
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASS;
  });

  it("rejects requests without admin credentials", async () => {
    const res = await request(app).get("/admin/ab-results");
    expect(res.status).toBe(401);
  });

  it("renders a per-test variant table with computed metrics", async () => {
    queryMock.mockImplementation((text: string) => {
      if (/FROM ab_test_assignments/.test(text)) {
        return Promise.resolve({
          rows: [
            {
              test_name: "annual_price",
              variant: "annual_89",
              visitors: 100,
              conversions: 5,
              revenue_day_0: 445,
              revenue_day_60: 890,
            },
            {
              test_name: "annual_price",
              variant: "annual_99",
              visitors: 80,
              conversions: 2,
              revenue_day_0: 198,
              revenue_day_60: 198,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .get("/admin/ab-results")
      .auth(ADMIN_USER, ADMIN_PASS);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("A/B test results");
    expect(res.text).toContain("annual_price");
    expect(res.text).toContain("annual_89");
    expect(res.text).toContain("annual_99");
    // conversion_rate 5/100 = 5.00%, ARPU 890/100 = $8.90
    expect(res.text).toContain("5.00%");
    expect(res.text).toContain("$8.90");
    expect(res.text).toContain("$890.00");
    // links back to CSV, JSON and admin index
    expect(res.text).toContain('href="/admin/ab-results.csv"');
    expect(res.text).toContain('href="/api/admin/ab-results"');
    expect(res.text).toContain('href="/admin"');
    expect(poolEndMock).toHaveBeenCalled();
  });
});

describe("GET /api/_internal/analytics-health — backfill staleness", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS;
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function mockBackfillSelect(ranAt: string | null) {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("SELECT id, ran_at")) {
        return {
          rows:
            ranAt == null
              ? []
              : [
                  {
                    id: 1,
                    ran_at: new Date(ranAt),
                    fetched: 1,
                    inserted: 1,
                    skipped: 0,
                    since_value: null,
                  },
                ],
        };
      }
      return { rows: [] };
    });
  }

  it("turns the probe red (503) and logs an alert when the backfill is stale", async () => {
    // 30 days ago, well beyond the 14-day default threshold.
    const ranAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockBackfillSelect(ranAt);

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.auth_prompt_backfill.stale).toBe(true);
    expect(res.body.auth_prompt_backfill.has_run).toBe(true);
    expect(res.body.auth_prompt_backfill.threshold_days).toBe(14);

    const alert = errorSpy.mock.calls.find(([msg]) =>
      String(msg).includes("auth-prompt PostHog backfill is stale"),
    );
    expect(alert).toBeDefined();
    expect(typeof getLastBackfillStaleAlertAt()).toBe("string");
  });

  it("stays green (200) when the backfill ran recently", async () => {
    const ranAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockBackfillSelect(ranAt);

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.auth_prompt_backfill.stale).toBe(false);
    expect(res.body.auth_prompt_backfill.has_run).toBe(true);
  });

  it("stays green when the backfill has never run (fresh deploy)", async () => {
    mockBackfillSelect(null);

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.auth_prompt_backfill.stale).toBe(false);
    expect(res.body.auth_prompt_backfill.has_run).toBe(false);
  });

  it("honours a custom AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS threshold", async () => {
    process.env.AUTH_PROMPT_BACKFILL_STALE_AFTER_DAYS = "3";
    const ranAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockBackfillSelect(ranAt);

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(503);
    expect(res.body.auth_prompt_backfill.stale).toBe(true);
    expect(res.body.auth_prompt_backfill.threshold_days).toBe(3);
  });

  it("does not flip red on a transient DB error (degrades gracefully)", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("SELECT id, ran_at")) {
        throw new Error("connection reset");
      }
      return { rows: [] };
    });

    const res = await request(app).get("/api/_internal/analytics-health");
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.auth_prompt_backfill).toBeNull();
  });
});
