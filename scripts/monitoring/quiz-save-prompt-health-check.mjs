#!/usr/bin/env node
// Polls the save-progress prompt health probe and exits non-zero on failure so
// the scheduled GitHub Action treats it as a build failure (and opens / updates
// the standing on-call issue). The probe itself is defined in `server/routes.ts`
// at `/api/_internal/quiz-save-prompt-health` and returns HTTP 503 once the most
// recent complete day's `quiz_save_shown` events with `placement: result_screen`
// drop to zero or fall below the trailing 7-day median floor (logic in
// `server/quizSavePromptHealth.ts`).
//
// Config lives in `monitoring/quiz-save-prompt-health.json` so the URL and
// timeout can be tweaked without changing this script. Alert sensitivity
// (median floor ratio, trailing window) lives in
// `server/quizSavePromptHealth.ts` (QUIZ_SAVE_PROMPT_HEALTH_CONFIG).
//
// Usage:
//   node scripts/monitoring/quiz-save-prompt-health-check.mjs
//   QUIZ_SAVE_PROMPT_HEALTH_URL=http://localhost:5000/api/_internal/quiz-save-prompt-health \
//     node scripts/monitoring/quiz-save-prompt-health-check.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(ROOT, "monitoring", "quiz-save-prompt-health.json");
const STATE_PATH = resolve(
  ROOT,
  "monitoring",
  "quiz-save-prompt-health-state.json",
);

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
          "ExpatHub-QuizSavePromptMonitor/1.0 (uptime check; non-commercial)",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const config = await loadConfig();
  const url = process.env.QUIZ_SAVE_PROMPT_HEALTH_URL || config.endpoint;
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
      `[quiz-save-prompt-health] FAIL — could not reach ${url}: ${fetchError}`,
    );
    process.exit(1);
  }

  if (!healthy) {
    console.error(
      `[quiz-save-prompt-health] FAIL — ${url} returned HTTP ${status} (expected ${expected})`,
    );
    if (body && typeof body === "object") {
      const ev = body.evaluated_day;
      const tr = body.trailing;
      console.error(
        `[quiz-save-prompt-health] reason=${body.reason} placement=${
          body.placement
        } evaluated=${ev ? `${ev.date} shown=${ev.shown}` : "n/a"} ` +
          `trailing_median=${tr?.median} floor=${tr?.floor}`,
      );
    }
    process.exit(1);
  }

  const ev = body?.evaluated_day;
  console.log(
    `[quiz-save-prompt-health] OK — ${url} returned HTTP ${status}, reason=${
      body?.reason ?? "ok"
    }, evaluated=${ev ? `${ev.date} shown=${ev.shown}` : "n/a"}`,
  );
  // Explicit exit so undici's keep-alive socket pool doesn't keep the event
  // loop alive after the probe completes.
  process.exit(0);
}

main().catch((err) => {
  console.error("[quiz-save-prompt-health] runner crashed:", err);
  process.exit(1);
});
