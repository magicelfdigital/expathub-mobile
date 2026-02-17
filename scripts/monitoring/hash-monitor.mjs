import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");

const SOURCES_PATH = resolve(ROOT, "monitoring", "sources.json");
const STATE_PATH = resolve(ROOT, "monitoring", "state.json");
const PROPOSALS_PATH = resolve(ROOT, "monitoring", "proposals.json");

const FETCH_TIMEOUT_MS = 15_000;

const P0_KEYWORDS = [
  "suspend", "paused", "terminated", "ban", "no longer", "ineligible",
  "eligibility", "income requirement", "threshold", "work permit",
  "work authorization", "sponsorship", "skilled worker",
  "digital nomad visa requirements", "minimum income",
  "new law", "decree", "regulation",
];

const P1_KEYWORDS = [
  "processing time", "appointments", "fees updated", "documentation",
  "proof", "insurance requirement", "tax guidance", "renewal", "forms",
];

const DATE_PATTERN = /effective\s+(?:\w+\s+\d{1,2}[,.]?\s*\d{4}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}|\d{4}-\d{2}-\d{2})/i;

function inferSeverity(text) {
  const lower = text.toLowerCase();
  let severity = "P2";

  if (P0_KEYWORDS.some((kw) => lower.includes(kw))) {
    severity = "P0";
  } else if (P1_KEYWORDS.some((kw) => lower.includes(kw))) {
    severity = "P1";
  }

  if (DATE_PATTERN.test(lower)) {
    if (severity === "P2") severity = "P1";
    else if (severity === "P1") severity = "P0";
  }

  return severity;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeHtml(raw) {
  let text = raw;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ExpatHub-Monitor/1.0 (automated-change-detection; non-commercial)",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const sourcesRaw = await readFile(SOURCES_PATH, "utf8");
  const sources = JSON.parse(sourcesRaw);

  const stateRaw = await readFile(STATE_PATH, "utf8");
  const state = JSON.parse(stateRaw);

  const proposals = [];
  let changedCount = 0;

  for (const source of sources) {
    if (!source.url || source.url.trim() === "") {
      console.log(`[SKIP] ${source.id} — no URL configured`);
      continue;
    }

    console.log(`[FETCH] ${source.id} — ${source.url}`);

    let html;
    try {
      html = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[WARN] ${source.id} — fetch failed: ${err.message}`);
      proposals.push({
        id: source.id,
        countrySlug: source.countrySlug,
        pathwayKey: source.pathwayKey,
        url: source.url,
        detectedAt: new Date().toISOString(),
        severity: "P2",
        summary: `Source unreachable: ${err.message}`,
      });
      continue;
    }

    const normalized = normalizeHtml(html);
    const newHash = sha256(normalized);
    const prevHash = state.hashes[source.id];

    if (prevHash && prevHash !== newHash) {
      changedCount++;
      const severity = inferSeverity(normalized);
      console.log(`[CHANGE] ${source.id} — hash differs — severity: ${severity}`);
      proposals.push({
        id: source.id,
        countrySlug: source.countrySlug,
        pathwayKey: source.pathwayKey,
        url: source.url,
        detectedAt: new Date().toISOString(),
        severity,
        summary:
          severity === "P0"
            ? "Source content changed with potential eligibility/legal impact. Immediate review required."
            : severity === "P1"
              ? "Source content changed with potential process/threshold impact. Review within 7 days."
              : "Source content changed (hash diff). Review for decision-impacting updates.",
      });
    } else if (!prevHash) {
      console.log(`[INIT] ${source.id} — first hash recorded`);
    } else {
      console.log(`[OK] ${source.id} — no change`);
    }

    state.hashes[source.id] = newHash;
  }

  state.lastRunAt = new Date().toISOString();

  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
  await writeFile(
    PROPOSALS_PATH,
    JSON.stringify(proposals, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `\nDone. ${changedCount} change(s) detected, ${proposals.length} proposal(s) written.`
  );
}

main().catch((err) => {
  console.error("Monitor runner failed:", err);
  process.exit(1);
});
