// Unit tests for the analytics health alert decision logic.
//
// These guard the paging behaviour in
// `scripts/monitoring/analytics-health-check.mjs`: a future tweak to the
// expected-status threshold or to how the probe response is parsed must not
// silently stop paging on-call — the worst time to discover that is during a
// real incident (PostHog can no longer stitch pre-account events to the
// post-account user, silently breaking every cross-signup funnel).
//
// The health endpoint is mocked (global `fetch` is stubbed) so the suite runs
// in CI with no live network. Run with:
//   node --test scripts/monitoring/__tests__/
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  evaluateAlert,
  probeHealth,
  resolveThresholds,
} from "../analytics-health-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "monitoring",
  "analytics-health.json",
);

// Load the real shipped thresholds so the tests track the production config.
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));

test("config file has the expected threshold shape", () => {
  const t = resolveThresholds(config);
  assert.equal(typeof t.expectedStatus, "number");
  assert.equal(typeof t.timeoutMs, "number");
  // Sanity: a positive timeout, and an HTTP status in the valid range.
  assert.ok(t.timeoutMs > 0);
  assert.ok(t.expectedStatus >= 100 && t.expectedStatus < 600);
});

test("no alert when the probe returns the expected healthy status", () => {
  const { expectedStatus } = resolveThresholds(config);
  const result = evaluateAlert({ status: expectedStatus, config });
  assert.equal(result.alerting, false);
  assert.equal(result.healthy, true);
  assert.equal(result.reachable, true);
  assert.deepEqual(result.reasons, []);
});

test("alerts when the probe returns its unhealthy 503 status", () => {
  const { expectedStatus } = resolveThresholds(config);
  assert.notEqual(expectedStatus, 503, "503 must be an unhealthy status");
  const result = evaluateAlert({ status: 503, config });
  assert.equal(result.alerting, true);
  assert.equal(result.healthy, false);
  assert.equal(result.reachable, true);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /HTTP 503/);
});

test("alerts on any non-expected status (boundary just off the threshold)", () => {
  const { expectedStatus } = resolveThresholds(config);
  // One above and one below the expected status both page — only an exact
  // match is considered healthy.
  const above = evaluateAlert({ status: expectedStatus + 1, config });
  const below = evaluateAlert({ status: expectedStatus - 1, config });
  assert.equal(above.alerting, true);
  assert.equal(below.alerting, true);
});

test("alerts when the endpoint is unreachable (transport error)", () => {
  const result = evaluateAlert({
    status: null,
    fetchError: "ECONNREFUSED",
    config,
  });
  assert.equal(result.alerting, true);
  assert.equal(result.healthy, false);
  assert.equal(result.reachable, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /could not reach probe/);
});

// ---------------------------------------------------------------------------
// Probe fetch + parse (probeHealth). Mock global fetch so no network is
// touched and a malformed / non-OK response is surfaced as a probe failure.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(impl) {
  globalThis.fetch = impl;
}

const baseArgs = {
  url: "https://www.expathub.example/api/_internal/analytics-health",
  timeoutMs: 5000,
};

test("probeHealth returns the status and parsed body on a healthy response", async () => {
  stubFetch(async () => ({
    status: 200,
    json: async () => ({ identify_missing_anon_id: { count: 0 } }),
  }));
  const { status, body, fetchError } = await probeHealth(baseArgs);
  assert.equal(status, 200);
  assert.equal(fetchError, null);
  assert.equal(body.identify_missing_anon_id.count, 0);

  // The pure decision treats this as healthy.
  const decision = evaluateAlert({ status, fetchError, config });
  assert.equal(decision.alerting, false);
});

test("probeHealth surfaces a 503 unhealthy status, which the decision pages on", async () => {
  stubFetch(async () => ({
    status: 503,
    json: async () => ({ identify_missing_anon_id: { count: 42 } }),
  }));
  const { status, fetchError } = await probeHealth(baseArgs);
  assert.equal(status, 503);
  assert.equal(fetchError, null);

  const decision = evaluateAlert({ status, fetchError, config });
  assert.equal(decision.alerting, true);
});

test("probeHealth records a transport error as a probe failure", async () => {
  stubFetch(async () => {
    throw new Error("network down");
  });
  const { status, fetchError } = await probeHealth(baseArgs);
  assert.equal(status, null);
  assert.match(fetchError, /network down/);

  const decision = evaluateAlert({ status, fetchError, config });
  assert.equal(decision.alerting, true);
  assert.equal(decision.reachable, false);
});

test("probeHealth tolerates a malformed (non-JSON) body without crashing", async () => {
  stubFetch(async () => ({
    status: 200,
    json: async () => {
      throw new Error("invalid json");
    },
  }));
  const { status, body, fetchError } = await probeHealth(baseArgs);
  // A 200 with an unparseable body is still healthy on status; the body is
  // recorded as null rather than throwing.
  assert.equal(status, 200);
  assert.equal(body, null);
  assert.equal(fetchError, null);

  const decision = evaluateAlert({ status, fetchError, config });
  assert.equal(decision.alerting, false);
});
