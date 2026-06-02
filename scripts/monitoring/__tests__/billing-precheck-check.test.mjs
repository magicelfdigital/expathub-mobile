// Unit tests for the restore pre-check alert decision logic.
//
// These guard the paging thresholds in
// `scripts/monitoring/billing-precheck-check.mjs`: a future tweak to the
// absolute-count / failure-ratio thresholds, the minimum-attempts gate, or the
// PostHog response parsing must not silently stop paging on-call — the worst
// time to discover that is during a real outage.
//
// PostHog is mocked (global `fetch` is stubbed) so the suite runs in CI with no
// live network. Run with: `node --test scripts/monitoring/__tests__/`.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  evaluateAlert,
  countEvents,
  resolveThresholds,
} from "../billing-precheck-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "monitoring",
  "billing-precheck-alert.json",
);

// Load the real shipped thresholds so the tests track the production config.
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));

test("config file has the expected threshold shape", () => {
  const t = resolveThresholds(config);
  assert.equal(typeof t.windowMinutes, "number");
  assert.equal(typeof t.absoluteThreshold, "number");
  assert.equal(typeof t.ratioThreshold, "number");
  assert.equal(typeof t.ratioMinAttempts, "number");
  // Sanity: the ratio gate must require more attempts than a single failure,
  // otherwise the quiet-window protection is meaningless.
  assert.ok(t.ratioMinAttempts > 1);
});

test("no alert in a quiet window with a single failure", () => {
  // One failure, only a handful of attempts: below the absolute threshold and
  // below the minimum-attempts gate, so the ratio is never evaluated.
  const result = evaluateAlert({ failed: 1, attempts: 5, config });
  assert.equal(result.alerting, false);
  assert.equal(result.absoluteBreached, false);
  assert.equal(result.ratioBreached, false);
  assert.equal(result.ratioEligible, false);
  assert.deepEqual(result.reasons, []);
});

test("alerts when the absolute failure count is exceeded", () => {
  const { absoluteThreshold } = resolveThresholds(config);
  // Exceed the absolute threshold even though attempts are below the ratio
  // gate — the absolute check stands alone.
  const result = evaluateAlert({
    failed: absoluteThreshold + 1,
    attempts: 5,
    config,
  });
  assert.equal(result.alerting, true);
  assert.equal(result.absoluteBreached, true);
  assert.equal(result.ratioBreached, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /absolute threshold/);
});

test("does not alert at exactly the absolute threshold (strictly greater)", () => {
  const { absoluteThreshold } = resolveThresholds(config);
  const result = evaluateAlert({
    failed: absoluteThreshold,
    attempts: 5,
    config,
  });
  assert.equal(result.absoluteBreached, false);
  assert.equal(result.alerting, false);
});

test("ratio breach only pages once minimum attempts are met", () => {
  const { ratioThreshold, ratioMinAttempts, absoluteThreshold } =
    resolveThresholds(config);

  // A failure ratio well above the threshold but with too few attempts: the
  // minimum-attempts gate must suppress the page. Keep failures at/under the
  // absolute threshold so we are isolating the ratio path.
  const fewAttempts = ratioMinAttempts - 1;
  const failedBelowGate = Math.min(
    absoluteThreshold,
    Math.max(1, Math.ceil(fewAttempts * (ratioThreshold + 0.5))),
  );
  const quiet = evaluateAlert({
    failed: failedBelowGate,
    attempts: fewAttempts,
    config,
  });
  assert.ok(
    quiet.ratio > ratioThreshold,
    "test setup should produce a ratio above the threshold",
  );
  assert.equal(quiet.ratioEligible, false);
  assert.equal(quiet.ratioBreached, false);
  assert.equal(quiet.alerting, false);

  // Same kind of ratio, now with enough attempts to clear the gate: it pages.
  const attempts = ratioMinAttempts * 5;
  // Choose a failure count above the ratio threshold but at/under the absolute
  // threshold, so only the ratio path can trip.
  const failed = Math.min(
    absoluteThreshold,
    Math.floor(attempts * ratioThreshold) + 1,
  );
  const loud = evaluateAlert({ failed, attempts, config });
  assert.ok(loud.ratio > ratioThreshold);
  assert.equal(loud.ratioEligible, true);
  assert.equal(loud.absoluteBreached, false, "absolute path must not trip here");
  assert.equal(loud.ratioBreached, true);
  assert.equal(loud.alerting, true);
  assert.equal(loud.reasons.length, 1);
  assert.match(loud.reasons[0], /failure ratio/);
});

test("no alert below both thresholds", () => {
  const { absoluteThreshold, ratioThreshold, ratioMinAttempts } =
    resolveThresholds(config);
  // Plenty of attempts (gate cleared) but a low ratio and low absolute count.
  // Keep failures at/under the absolute threshold, then pick an attempt count
  // large enough that the ratio also stays below its threshold.
  const failed = Math.max(1, Math.floor(absoluteThreshold / 2));
  const attempts =
    Math.ceil(failed / ratioThreshold) + ratioMinAttempts + 10;
  assert.ok(failed <= absoluteThreshold, "failed must stay under absolute too");
  assert.ok(failed / attempts < ratioThreshold, "ratio must stay under too");
  const result = evaluateAlert({ failed, attempts, config });
  assert.equal(result.ratioEligible, true);
  assert.equal(result.absoluteBreached, false);
  assert.equal(result.ratioBreached, false);
  assert.equal(result.alerting, false);
  assert.deepEqual(result.reasons, []);
});

test("zero failures never alerts", () => {
  const { ratioMinAttempts } = resolveThresholds(config);
  const result = evaluateAlert({
    failed: 0,
    attempts: ratioMinAttempts * 100,
    config,
  });
  assert.equal(result.alerting, false);
  assert.equal(result.ratio, 0);
});

// ---------------------------------------------------------------------------
// PostHog response parsing (countEvents). Mock global fetch so no network is
// touched and a malformed / non-OK response is treated as a probe failure.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(impl) {
  globalThis.fetch = impl;
}

const baseArgs = {
  endpoint: "https://us.posthog.example/api/projects/1/query/",
  apiKey: "test-key",
  event: "billing_pre_check_failed",
  windowMinutes: 15,
  timeoutMs: 5000,
};

test("countEvents returns the parsed count on a well-formed response", async () => {
  stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [[7]] }),
  }));
  const count = await countEvents(baseArgs);
  assert.equal(count, 7);
});

test("countEvents treats a non-OK PostHog response as a probe failure", async () => {
  stubFetch(async () => ({
    ok: false,
    status: 503,
    text: async () => "service unavailable",
  }));
  await assert.rejects(countEvents(baseArgs), /PostHog HTTP 503/);
});

test("countEvents treats a malformed (non-numeric) response as a probe failure", async () => {
  stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [["not-a-number"]] }),
  }));
  await assert.rejects(countEvents(baseArgs), /Unexpected PostHog response/);
});

test("countEvents treats a missing results shape as a probe failure", async () => {
  stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ unexpected: true }),
  }));
  await assert.rejects(countEvents(baseArgs), /Unexpected PostHog response/);
});
