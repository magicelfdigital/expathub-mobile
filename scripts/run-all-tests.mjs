#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { openSync, readFileSync } from "node:fs";

const PHASES = [];
let exitCode = 0;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

function spawnServer(cmd, args, { logFile, env }) {
  const out = openSync(logFile, "w");
  return spawn(cmd, args, {
    stdio: ["ignore", out, out],
    env: { ...process.env, ...env },
    detached: false,
  });
}

async function waitForUrl(url, timeoutSec, label, logFile) {
  for (let i = 0; i < timeoutSec; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        console.log(`[run-all-tests] ${label} is up after ${i}s`);
        return;
      }
    } catch {}
    await sleep(1000);
  }
  console.error(`[run-all-tests] ${label} failed to start within ${timeoutSec}s`);
  try {
    console.error(`--- ${logFile} ---`);
    console.error(readFileSync(logFile, "utf8"));
  } catch {}
  throw new Error(`${label} did not become ready`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), sleep(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  } catch {}
}

async function phase(name, fn) {
  const slot = { name, ok: false, ms: 0 };
  PHASES.push(slot);
  const started = Date.now();
  console.log(`\n=== [run-all-tests] PHASE: ${name} ===`);
  try {
    await fn();
    slot.ok = true;
    slot.ms = Date.now() - started;
    console.log(`=== [run-all-tests] PHASE OK: ${name} (${slot.ms}ms) ===`);
  } catch (err) {
    exitCode = 1;
    slot.ms = Date.now() - started;
    slot.error = String(err?.message ?? err);
    console.error(`=== [run-all-tests] PHASE FAIL: ${name} — ${err?.message ?? err} ===`);
  }
}

await phase("jest", async () => {
  await run("npx", ["jest", "--ci"]);
});

const webSpaPhase = phase("playwright:web-spa", async () => {
  await run("npx", ["vite", "build", "--config", "web/vite.config.ts"]);
  const server = spawnServer("npx", ["tsx", "server/index.ts"], {
    logFile: "server.log",
    env: {
      NODE_ENV: "production",
      PORT: "5000",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "local-test-session-secret",
    },
  });
  try {
    await waitForUrl("http://localhost:5000/", 60, "Express server", "server.log");
    await run(
      "npx",
      [
        "playwright",
        "test",
        "tests/e2e/locked-section.spec.ts",
        "tests/e2e/cancellation-exit-offer.spec.ts",
        "--reporter=list",
      ],
      { env: { PLAYWRIGHT_BASE_URL: "http://localhost:5000" } },
    );
  } finally {
    await stopChild(server);
  }
});

const expoWebPhase = phase("playwright:expo-web", async () => {
  const expo = spawnServer("npx", ["expo", "start", "--web", "--port", "8081"], {
    logFile: "expo.log",
    env: {
      NODE_ENV: "development",
      CI: "true",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_DOMAIN: "localhost:8081",
    },
  });
  try {
    await waitForUrl("http://localhost:8081/", 180, "Expo web bundle", "expo.log");
    await run(
      "npx",
      ["playwright", "test", "tests/e2e/worksheet-signup-submit.spec.ts", "--reporter=list"],
      { env: { PLAYWRIGHT_EXPO_BASE_URL: "http://localhost:8081" } },
    );
  } finally {
    await stopChild(expo);
  }
});

await Promise.all([webSpaPhase, expoWebPhase]);

console.log("\n=== [run-all-tests] SUMMARY ===");
for (const p of PHASES) {
  const status = p.ok ? "PASS" : "FAIL";
  console.log(`  [${status}] ${p.name} (${p.ms}ms)${p.error ? ` — ${p.error}` : ""}`);
}
console.log(`Logs: server.log, expo.log`);

process.exit(exitCode);
