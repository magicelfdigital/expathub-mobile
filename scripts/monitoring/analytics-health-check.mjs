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
import { fileURLToPath } from "node:url";
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

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ExpatHub-AnalyticsHealthMonitor/1.0 (uptime check; non-commercial)",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const config = await loadConfig();
  const url = process.env.ANALYTICS_HEALTH_URL || config.endpoint;
  const expected = Number(config.expectedStatus) || 200;
  const timeoutMs = Number(config.timeoutMs) || 15_000;

  const runAt = new Date().toISOString();
  let response;
  let body = null;
  let fetchError = null;

  try {
    response = await fetchWithTimeout(url, timeoutMs);
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } catch (err) {
    fetchError = err?.message || String(err);
  }

  const status = response?.status ?? null;
  const healthy = status === expected;

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

  if (!healthy) {
    console.error(
      `[analytics-health] FAIL — ${url} returned HTTP ${status} (expected ${expected})`,
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

main().catch((err) => {
  console.error("[analytics-health] runner crashed:", err);
  process.exit(1);
});
