#!/usr/bin/env node
// Polls the analytics health probe and exits non-zero on failure so the
// scheduled GitHub Action treats it as a build failure (and opens / updates
// the standing on-call issue). The probe itself is defined in
// `server/routes.ts` at `/api/_internal/analytics-health` and returns
// HTTP 503 once the in-process counter of `$identify` events missing
// `$anon_distinct_id` is non-zero.
//
// Config lives in `monitoring/analytics-health.json` so the URL and timeout
// can be tweaked without changing this script.
//
// Usage:
//   node scripts/monitoring/analytics-health-check.mjs
//   ANALYTICS_HEALTH_URL=http://localhost:5000/api/_internal/analytics-health \
//     node scripts/monitoring/analytics-health-check.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(ROOT, "monitoring", "analytics-health.json");
const STATE_PATH = resolve(ROOT, "monitoring", "analytics-health-state.json");

async function loadConfig() {
  const raw = await readFile(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// Resolves the probe thresholds from a raw config object, applying the same
// defaults `main()` uses. Kept pure so it can be unit-tested.
export function resolveThresholds(config = {}) {
  return {
    expectedStatus: Number(config.expectedStatus) || 200,
    timeoutMs: Number(config.timeoutMs) || 15_000,
  };
}

// Fetches the health endpoint, capturing the HTTP status, parsed JSON body,
// and any transport error rather than throwing. Uses the global `fetch` so
// tests can stub it without touching the network. A body that fails to parse
// as JSON is recorded as `null` (the probe's HTTP status is what decides the
// alert, not the body shape).
export async function probeHealth({ url, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status = null;
  let body = null;
  let fetchError = null;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ExpatHub-AnalyticsHealthMonitor/1.0 (uptime check; non-commercial)",
        Accept: "application/json",
      },
    });
    status = response.status;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } catch (err) {
    fetchError = err?.message || String(err);
  } finally {
    clearTimeout(timer);
  }
  return { status, body, fetchError };
}

// Pure decision logic: given the probe's HTTP status (or a transport error)
// and the config, decide whether to page on-call. We alert when EITHER the
// endpoint was unreachable (a transport error or malformed/non-OK response
// surfaced as `fetchError`) OR the returned status does not match the expected
// healthy status. Kept pure so it can be unit-tested.
export function evaluateAlert({ status, fetchError, config }) {
  const { expectedStatus } = resolveThresholds(config);

  const reachable = !fetchError;
  const healthy = reachable && status === expectedStatus;
  const alerting = !healthy;

  const reasons = [];
  if (fetchError) {
    reasons.push(`could not reach probe: ${fetchError}`);
  } else if (status !== expectedStatus) {
    reasons.push(`probe returned HTTP ${status} (expected ${expectedStatus})`);
  }

  return {
    expectedStatus,
    status: status ?? null,
    reachable,
    healthy,
    alerting,
    reasons,
  };
}

async function main() {
  const config = await loadConfig();
  const url = process.env.ANALYTICS_HEALTH_URL || config.endpoint;
  const { expectedStatus, timeoutMs } = resolveThresholds(config);

  const runAt = new Date().toISOString();
  const { status, body, fetchError } = await probeHealth({ url, timeoutMs });

  const { healthy, alerting, reasons } = evaluateAlert({
    status,
    fetchError,
    config,
  });

  const state = {
    lastRunAt: runAt,
    endpoint: url,
    healthy,
    status,
    fetchError,
    body,
  };
  await writeState(state);

  if (fetchError) {
    console.error(
      `[analytics-health] FAIL — could not reach ${url}: ${fetchError}`,
    );
    process.exit(1);
  }

  if (alerting) {
    console.error(
      `[analytics-health] FAIL — ${url} returned HTTP ${status} (expected ${expectedStatus})`,
    );
    if (body && typeof body === "object") {
      const m = body.identify_missing_anon_id;
      if (m && typeof m === "object") {
        console.error(
          `[analytics-health] missing-anon-id count=${m.count} last_seen_at=${
            m.last_seen_at
          } by_surface=${JSON.stringify(m.by_surface)}`,
        );
      }
    }
    process.exit(1);
  }

  console.log(
    `[analytics-health] OK — ${url} returned HTTP ${status}, count=${
      body?.identify_missing_anon_id?.count ?? 0
    }`,
  );
  // Explicit exit so undici's keep-alive socket pool doesn't keep the
  // event loop alive after the probe completes.
  process.exit(0);
}

// Only run the probe when executed directly
// (`node analytics-health-check.mjs`), not when imported by tests for the
// exported pure functions above.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[analytics-health] runner crashed:", err);
    process.exit(1);
  });
}
