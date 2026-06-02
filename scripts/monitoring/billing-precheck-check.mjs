#!/usr/bin/env node
// Queries PostHog for the production rate of `billing_pre_check_failed`
// events and exits non-zero when it crosses an alert threshold, so the
// scheduled GitHub Action treats it as a build failure (and opens /
// updates the standing on-call issue).
//
// `billing_pre_check_failed` is emitted from `BillingOrchestrator.restore()`
// (src/billing/orchestrator.ts) when BOTH backend entitlement pre-check
// attempts throw. A sustained rise means the backend entitlements endpoint
// is failing and every restore is silently falling through to the slow path
// — exactly the kind of regression nobody notices until users complain.
//
// Thresholds live in `monitoring/billing-precheck-alert.json` so they can be
// tuned without editing this script. We alert when EITHER:
//   - failures in the trailing window exceed `absoluteThreshold`, OR
//   - failures / restore attempts exceed `ratioThreshold` (only once at
//     least `ratioMinAttempts` restore attempts have happened, so a single
//     failure during a quiet window doesn't page anyone).
//
// Requires POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY (matching the
// existing PostHog backfills in server/). POSTHOG_HOST defaults to the US
// cloud. If the credentials are absent the probe SKIPS (exit 0) rather than
// failing, so a fork without PostHog access doesn't generate noise.
//
// Usage:
//   node scripts/monitoring/billing-precheck-check.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(ROOT, "monitoring", "billing-precheck-alert.json");
const STATE_PATH = resolve(
  ROOT,
  "monitoring",
  "billing-precheck-alert-state.json",
);

async function loadConfig() {
  const raw = await readFile(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// Resolves the alert thresholds from a raw config object, applying the same
// defaults `main()` uses. Kept pure so it can be unit-tested.
export function resolveThresholds(config = {}) {
  return {
    windowMinutes: Number(config.windowMinutes) || 15,
    absoluteThreshold: Number(config.absoluteThreshold) || 10,
    ratioThreshold: Number(config.ratioThreshold) || 0.02,
    ratioMinAttempts: Number(config.ratioMinAttempts) || 20,
  };
}

// Pure decision logic: given the failure / attempt counts in the window and a
// config, decide whether to page on-call. We alert when EITHER the absolute
// failure count exceeds `absoluteThreshold` OR the failure-to-attempt ratio
// exceeds `ratioThreshold` — but the ratio check only counts once at least
// `ratioMinAttempts` restore attempts have happened, so a single failure
// during a quiet window doesn't page anyone.
export function evaluateAlert({ failed, attempts, config }) {
  const { windowMinutes, absoluteThreshold, ratioThreshold, ratioMinAttempts } =
    resolveThresholds(config);

  const ratio = attempts > 0 ? failed / attempts : 0;
  const ratioEligible = attempts >= ratioMinAttempts;
  const absoluteBreached = failed > absoluteThreshold;
  const ratioBreached = ratioEligible && ratio > ratioThreshold;
  const alerting = absoluteBreached || ratioBreached;

  const reasons = [];
  if (absoluteBreached) {
    reasons.push(
      `${failed} failures in ${windowMinutes}m exceeds absolute threshold of ${absoluteThreshold}`,
    );
  }
  if (ratioBreached) {
    reasons.push(
      `failure ratio ${(ratio * 100).toFixed(1)}% (${failed}/${attempts}) exceeds ${(
        ratioThreshold * 100
      ).toFixed(1)}% over ${windowMinutes}m`,
    );
  }

  return {
    windowMinutes,
    absoluteThreshold,
    ratioThreshold,
    ratioMinAttempts,
    ratio,
    ratioEligible,
    absoluteBreached,
    ratioBreached,
    alerting,
    reasons,
  };
}

// Counts events of a given name in the trailing `windowMinutes` via HogQL.
export async function countEvents({
  endpoint,
  apiKey,
  event,
  windowMinutes,
  timeoutMs,
}) {
  const query =
    `SELECT count() FROM events ` +
    `WHERE event = '${event.replace(/'/g, "")}' ` +
    `AND timestamp >= now() - INTERVAL ${Number(windowMinutes)} MINUTE`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent":
          "ExpatHub-BillingPreCheckMonitor/1.0 (alert probe; non-commercial)",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`PostHog HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    const json = await resp.json();
    const value = json?.results?.[0]?.[0];
    const count = Number(value);
    if (!Number.isFinite(count)) {
      throw new Error(
        `Unexpected PostHog response shape: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return count;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const config = await loadConfig();
  const { windowMinutes, absoluteThreshold, ratioThreshold, ratioMinAttempts } =
    resolveThresholds(config);
  const timeoutMs = Number(config.timeoutMs) || 20_000;
  const failedEvent = config.failedEvent || "billing_pre_check_failed";
  const attemptEvent = config.attemptEvent || "restore_tapped";

  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(
    /\/$/,
    "",
  );
  const projectId = process.env.POSTHOG_PROJECT_ID || "";
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";

  const runAt = new Date().toISOString();

  if (!projectId || !apiKey) {
    // No credentials — skip rather than fail so a fork / unconfigured
    // environment doesn't open spurious alert issues.
    console.log(
      "[billing-precheck] SKIP — POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY not set",
    );
    await writeState({
      lastRunAt: runAt,
      skipped: true,
      reason: "missing PostHog credentials",
    });
    process.exit(0);
  }

  const endpoint = `${host}/api/projects/${encodeURIComponent(projectId)}/query/`;

  let failed;
  let attempts;
  try {
    [failed, attempts] = await Promise.all([
      countEvents({
        endpoint,
        apiKey,
        event: failedEvent,
        windowMinutes,
        timeoutMs,
      }),
      countEvents({
        endpoint,
        apiKey,
        event: attemptEvent,
        windowMinutes,
        timeoutMs,
      }),
    ]);
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[billing-precheck] FAIL — PostHog query error: ${message}`);
    await writeState({
      lastRunAt: runAt,
      queryError: message,
    });
    // Treat an unreachable PostHog as a probe failure so the on-call knows
    // the alert itself is blind, rather than silently passing.
    process.exit(1);
  }

  const { ratio, ratioEligible, alerting, reasons } = evaluateAlert({
    failed,
    attempts,
    config,
  });

  await writeState({
    lastRunAt: runAt,
    windowMinutes,
    failedEvent,
    attemptEvent,
    failed,
    attempts,
    ratio,
    absoluteThreshold,
    ratioThreshold,
    ratioMinAttempts,
    ratioEligible,
    alerting,
    reasons,
  });

  if (alerting) {
    console.error(`[billing-precheck] ALERT — ${reasons.join("; ")}`);
    process.exit(1);
  }

  console.log(
    `[billing-precheck] OK — ${failed} ${failedEvent} / ${attempts} ${attemptEvent} ` +
      `in last ${windowMinutes}m (ratio ${(ratio * 100).toFixed(1)}%, ` +
      `thresholds: >${absoluteThreshold} abs, >${(ratioThreshold * 100).toFixed(
        1,
      )}% ratio @ ${ratioMinAttempts}+ attempts)`,
  );
  // Explicit exit so undici's keep-alive socket pool doesn't keep the event
  // loop alive after the probe completes.
  process.exit(0);
}

// Only run the probe when executed directly (`node billing-precheck-check.mjs`),
// not when imported by tests for the exported pure functions above.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[billing-precheck] runner crashed:", err);
    process.exit(1);
  });
}
