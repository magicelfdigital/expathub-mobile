import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import pg from "pg";
import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";
import {
  ensureUserProgressCreatedAt,
  registerPlannerAnalyticsRoutes,
} from "./plannerAnalytics";
import {
  recordQuizSaveEvent,
  registerQuizSaveAnalyticsRoutes,
} from "./quizSaveAnalytics";
import {
  computeQuizSavePromptHealth,
  unavailableQuizSavePromptHealthSnapshot,
} from "./quizSavePromptHealth";
import {
  recordAuthPromptEvent,
  registerAuthPromptAnalyticsRoutes,
  getAuthPromptBackfillFreshness,
  type BackfillFreshness,
} from "./authPromptAnalytics";
import { registerBriefFreshnessRoutes } from "./briefFreshness";
import {
  WORKSHEETS,
  WORKSHEET_BY_ID,
  scoreWorksheet,
  validateAnswersShape,
} from "../src/data/worksheets";

// ── A/B test config ─────────────────────────────────────────────────────
//
// One active pricing test, toggled by an env flag. The retired
// `paid_intro_test` (monthly $0.99 vs free trial) was removed once both
// plans were standardised on a 14-day free trial.
const PRICING_VARIANT_COOKIE = "eh_sid";
const TEST_ANNUAL_PRICE = "annual_price_test";
type AnnualVariant = "annual_89" | "annual_99";

function annualPriceEnabled(): boolean {
  return process.env.ENABLE_ANNUAL_PRICE_TEST === "1" ||
    process.env.ENABLE_ANNUAL_PRICE_TEST === "true";
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function setSessionCookie(res: Response, sessionId: string): void {
  const oneYear = 60 * 60 * 24 * 365;
  res.appendHeader(
    "Set-Cookie",
    `${PRICING_VARIANT_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${oneYear}; SameSite=Lax`,
  );
}

function pickAnnualVariant(): AnnualVariant {
  if (!annualPriceEnabled()) return "annual_89"; // control
  return Math.random() < 0.5 ? "annual_89" : "annual_99";
}

let abTablesEnsured = false;
async function ensureAbTables(pool: pg.Pool): Promise<void> {
  if (abTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ab_test_assignments (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(255),
      test_name VARCHAR(100) NOT NULL,
      variant VARCHAR(50) NOT NULL,
      assigned_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ab_test_assignments_session_test_idx
      ON ab_test_assignments (session_id, test_name)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(255),
      test_name VARCHAR(100) NOT NULL,
      variant VARCHAR(50) NOT NULL,
      plan VARCHAR(50),
      converted BOOLEAN DEFAULT FALSE,
      revenue_day_0 NUMERIC(10,2) DEFAULT 0,
      revenue_day_60 NUMERIC(10,2) DEFAULT 0,
      stripe_subscription_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  abTablesEnsured = true;
}

interface AbVariantRow {
  variant: string;
  visitors: number;
  conversions: number;
  conversion_rate: number;
  revenue_day_0: number;
  revenue_day_60: number;
  arpu_day_60: number;
}

interface AbResults {
  flags: { annual_price_enabled: boolean };
  // null = all-time (no date filter); a positive integer = the trailing
  // window in days that assignments / conversions were restricted to. Mirrors
  // the `?days=N` behaviour of the planner / quiz-save / auth-prompt
  // dashboards so operators can compare a test's recent performance against
  // its lifetime average.
  windowDays: number | null;
  tests: Record<string, AbVariantRow[]>;
}

// Optional trailing-window filter for the A/B results query. When `windowDays`
// is undefined the query aggregates over all time (the historical default);
// when set it restricts both the assignment cohort (by `assigned_at`) and the
// conversions joined to them (by `created_at`) to the trailing window. The
// conversion bound lives in the LEFT JOIN's ON clause — not a WHERE — so a
// windowed assignment with no recent conversion still shows as a visitor with
// zero conversions rather than dropping out of the cohort entirely.
async function computeAbResults(
  pool: pg.Pool,
  windowDays?: number,
): Promise<AbResults> {
  await ensureAbTables(pool);
  const windowed = typeof windowDays === "number";
  const result = windowed
    ? await pool.query(
        `
    SELECT
      a.test_name,
      a.variant,
      COUNT(DISTINCT a.session_id)::int AS visitors,
      COUNT(DISTINCT CASE WHEN c.converted THEN a.session_id END)::int AS conversions,
      COALESCE(SUM(c.revenue_day_0), 0)::float  AS revenue_day_0,
      COALESCE(SUM(c.revenue_day_60), 0)::float AS revenue_day_60
    FROM ab_test_assignments a
    LEFT JOIN conversions c
      ON c.session_id = a.session_id
     AND c.test_name  = a.test_name
     AND c.created_at >= NOW() - $1::interval
    WHERE a.assigned_at >= NOW() - $1::interval
    GROUP BY a.test_name, a.variant
    ORDER BY a.test_name, a.variant
  `,
        [`${windowDays} days`],
      )
    : await pool.query(`
    SELECT
      a.test_name,
      a.variant,
      COUNT(DISTINCT a.session_id)::int AS visitors,
      COUNT(DISTINCT CASE WHEN c.converted THEN a.session_id END)::int AS conversions,
      COALESCE(SUM(c.revenue_day_0), 0)::float  AS revenue_day_0,
      COALESCE(SUM(c.revenue_day_60), 0)::float AS revenue_day_60
    FROM ab_test_assignments a
    LEFT JOIN conversions c
      ON c.session_id = a.session_id
     AND c.test_name  = a.test_name
    GROUP BY a.test_name, a.variant
    ORDER BY a.test_name, a.variant
  `);

  const tests: Record<string, AbVariantRow[]> = {};
  for (const row of result.rows) {
    const visitors = Number(row.visitors) || 0;
    const conversions = Number(row.conversions) || 0;
    const r0 = Number(row.revenue_day_0) || 0;
    const r60 = Number(row.revenue_day_60) || 0;
    if (!tests[row.test_name]) tests[row.test_name] = [];
    tests[row.test_name].push({
      variant: row.variant,
      visitors,
      conversions,
      conversion_rate: visitors > 0 ? conversions / visitors : 0,
      revenue_day_0: r0,
      revenue_day_60: r60,
      arpu_day_60: visitors > 0 ? r60 / visitors : 0,
    });
  }
  return {
    flags: { annual_price_enabled: annualPriceEnabled() },
    windowDays: windowed ? windowDays! : null,
    tests,
  };
}

function abCsvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Defuse CSV formula injection on caller-influenced cells (test/variant
  // names) the same way the analytics dashboards do.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Multi-section CSV mirroring the analytics dashboards: a flags block and a
// per-(test, variant) block, each with its own header separated by a blank
// line so a spreadsheet importer can map each schema independently.
export function renderAbResultsCsv(data: AbResults): string {
  const sections: string[][] = [];
  // Note the active window in the title row so a downloaded file is
  // self-describing — "all time" when unfiltered, or "last N days" when the
  // caller passed ?days=N.
  const windowNote =
    data.windowDays === null ? "all time" : `last ${data.windowDays} days`;
  sections.push([`# A/B test results (${windowNote})`]);

  sections.push([
    "section,key,value",
    `flags,annual_price_enabled,${data.flags.annual_price_enabled}`,
    `window,days,${data.windowDays === null ? "all" : data.windowDays}`,
  ]);

  const variantLines: string[] = [
    "section,test,variant,visitors,conversions,conversion_rate,revenue_day_0,revenue_day_60,arpu_day_60",
  ];
  for (const testName of Object.keys(data.tests)) {
    for (const v of data.tests[testName]) {
      variantLines.push(
        [
          "variant",
          abCsvEscape(testName),
          abCsvEscape(v.variant),
          v.visitors,
          v.conversions,
          v.conversion_rate.toFixed(4),
          v.revenue_day_0.toFixed(2),
          v.revenue_day_60.toFixed(2),
          v.arpu_day_60.toFixed(2),
        ].join(","),
      );
    }
  }
  sections.push(variantLines);

  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}

function abHtmlEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Human-readable dashboard mirroring the other admin surfaces (planner,
// quiz-save, brief-freshness). Self-contained HTML — no client JS or
// external chart library — rendered server-side from computeAbResults().
export function renderAbResultsHtml(data: AbResults): string {
  const testNames = Object.keys(data.tests);
  const usd = (n: number): string =>
    `$${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const tablesHtml =
    testNames.length === 0
      ? `<p class="empty">No A/B test assignments recorded yet.</p>`
      : testNames
          .map((testName) => {
            const variants = data.tests[testName];
            const rows = variants
              .map(
                (v) => `
        <tr>
          <td><code>${abHtmlEscape(v.variant)}</code></td>
          <td class="num">${v.visitors.toLocaleString()}</td>
          <td class="num">${v.conversions.toLocaleString()}</td>
          <td class="num">${(v.conversion_rate * 100).toFixed(2)}%</td>
          <td class="num">${usd(v.revenue_day_0)}</td>
          <td class="num">${usd(v.revenue_day_60)}</td>
          <td class="num">${usd(v.arpu_day_60)}</td>
        </tr>`,
              )
              .join("");
            return `
    <section class="card">
      <h2><code>${abHtmlEscape(testName)}</code></h2>
      <table>
        <thead>
          <tr>
            <th>Variant</th>
            <th class="num">Visitors</th>
            <th class="num">Conversions</th>
            <th class="num">Conv. rate</th>
            <th class="num">Revenue (day 0)</th>
            <th class="num">Revenue (day 60)</th>
            <th class="num">ARPU (day 60)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>A/B test results — ExpatHub Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 960px; color: #111; background: #fafafa;
    }
    h1 { margin: 0 0 8px; }
    a { color: #0a66c2; }
    .nav { margin: 0 0 16px; color: #555; }
    .nav a { margin-right: 12px; }
    .flags { color: #555; margin: 0 0 16px; }
    .card {
      background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
      padding: 16px; margin-bottom: 16px;
    }
    .card h2 { margin: 0 0 12px; font-size: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; }
    th { color: #444; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .empty { color: #666; }
  </style>
</head>
<body>
  <h1>A/B test results</h1>
  <p class="nav">
    <a href="/admin">&larr; Admin index</a>
    <a href="/admin/ab-results.csv">Download CSV</a>
    <a href="/api/admin/ab-results">JSON</a>
  </p>
  <p class="flags">
    Flags: <code>annual_price_enabled = ${data.flags.annual_price_enabled}</code>
  </p>
  ${tablesHtml}
</body>
</html>`;
}

async function getOrAssignVariants(
  req: Request,
  res: Response,
): Promise<{
  sessionId: string;
  annualVariant: AnnualVariant;
  isNew: boolean;
}> {
  const cookies = parseCookies(req);
  let sessionId = cookies[PRICING_VARIANT_COOKIE];
  let isNew = false;
  if (!sessionId || sessionId.length < 8 || sessionId.length > 64) {
    sessionId = randomUUID();
    isNew = true;
    setSessionCookie(res, sessionId);
  }

  // Defaults if no DB; still serve a sensible response.
  let annualVariant: AnnualVariant = "annual_89";

  const pool = getPool();
  if (!pool) {
    return {
      sessionId,
      annualVariant: pickAnnualVariant(),
      isNew,
    };
  }

  try {
    await ensureAbTables(pool);
    // Read existing assignments for this session.
    const existing = await pool.query(
      `SELECT test_name, variant FROM ab_test_assignments WHERE session_id = $1`,
      [sessionId],
    );
    const map = new Map<string, string>();
    for (const row of existing.rows) {
      map.set(row.test_name, row.variant);
    }

    // ── Read-time flag enforcement ──────────────────────────────────────
    // A previously-bucketed visitor's stored variant is honoured only when
    // the test is currently enabled. When disabled, force the visitor into
    // the control arm even if a treatment variant was previously persisted —
    // this prevents a stale `annual_99` bucket from leaking across into a
    // period where we expect everyone in control.
    if (annualPriceEnabled()) {
      if (map.has(TEST_ANNUAL_PRICE)) {
        annualVariant = map.get(TEST_ANNUAL_PRICE) as AnnualVariant;
      } else {
        annualVariant = pickAnnualVariant();
        await pool.query(
          `INSERT INTO ab_test_assignments (session_id, test_name, variant)
           VALUES ($1, $2, $3)
           ON CONFLICT (session_id, test_name) DO NOTHING`,
          [sessionId, TEST_ANNUAL_PRICE, annualVariant],
        );
      }
    } else {
      annualVariant = "annual_89"; // forced control while test is off
    }
  } catch (err: any) {
    console.error("AB assignment error:", err?.message);
  } finally {
    await pool.end();
  }

  return { sessionId, annualVariant, isNew };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function requireAdminBasicAuth(req: Request, res: Response): boolean {
  const expectedUser = process.env.ADMIN_BASIC_USER || "admin";
  const expectedPass = process.env.ADMIN_BASIC_PASS;
  if (!expectedPass) {
    res.status(503).json({ error: "Admin endpoint not configured (set ADMIN_BASIC_PASS)" });
    return false;
  }
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="ab-admin"');
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    res.status(401).json({ error: "Invalid auth header" });
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) {
    res.status(401).json({ error: "Invalid auth header" });
    return false;
  }
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  if (!timingSafeEqual(user, expectedUser) || !timingSafeEqual(pass, expectedPass)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="ab-admin"');
    res.status(401).json({ error: "Invalid credentials" });
    return false;
  }
  return true;
}

const AUTH_API_URL = "https://www.expathub.website";
const PASSWORD_API_URL = "https://www.expathub.website";

type UpstreamUser = {
  id?: string | number;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

async function getUserFromToken(req: Request): Promise<UpstreamUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
    });
    if (!upstream.ok) return null;
    const data = (await upstream.json()) as { user?: UpstreamUser };
    return data?.user ?? null;
  } catch {
    return null;
  }
}

async function getUserIdFromToken(req: Request): Promise<string | null> {
  const user = await getUserFromToken(req);
  return user?.id?.toString() ?? null;
}

function getPool(): pg.Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  return new pg.Pool({ connectionString: dbUrl });
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

// ── Analytics payload inspection ──────────────────────────────────────────
// PostHog stitches pre-account quiz events to the post-account user via the
// `$anon_distinct_id` property on `$identify`. The web client always sends it
// (see `web/src/lib/pixel.ts`'s `sendIdentify`) and a Playwright check guards
// that surface, but the `/api/analytics` proxy itself forwards anything the
// client posts. To catch a future regression in any other surface (mobile,
// new web entry point, etc.) we inspect every `$identify` event server-side
// and surface a warning when the join field is missing. The inspection is
// strictly observational — events are still forwarded upstream so live data
// is never dropped.

// In-memory counters are retained as a fast fallback for when the database
// is unreachable, and to keep the existing server-log warning behaviour. The
// durable source of truth, however, is the `identify_missing_anon_events`
// Postgres table (see ensureIdentifyMissingAnonTable / recordMissingAnonEvent)
// so the health probe survives restarts.
let identifyMissingAnonIdCount = 0;
let identifyMissingAnonIdLastAt: string | null = null;
const identifyMissingAnonIdBySurface: Record<string, number> = {};
const ANALYTICS_HEALTH_STARTED_AT = new Date().toISOString();

export function getIdentifyMissingAnonIdCount(): number {
  return identifyMissingAnonIdCount;
}

export function resetIdentifyMissingAnonIdCount(): void {
  identifyMissingAnonIdCount = 0;
  identifyMissingAnonIdLastAt = null;
  for (const k of Object.keys(identifyMissingAnonIdBySurface)) {
    delete identifyMissingAnonIdBySurface[k];
  }
}

// Lazy DDL for the durable missing-anon-id event log. Mirrors the lazy-table
// pattern used elsewhere in this file (ensureAbTables, quiz_save_events): the
// cached promise is reset on failure so a transient error doesn't permanently
// disable persistence.
let ensureIdentifyMissingAnonPromise: Promise<void> | null = null;
export function resetIdentifyMissingAnonEnsureCache(): void {
  ensureIdentifyMissingAnonPromise = null;
}
async function ensureIdentifyMissingAnonTable(pool: pg.Pool): Promise<void> {
  if (!ensureIdentifyMissingAnonPromise) {
    ensureIdentifyMissingAnonPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS identify_missing_anon_events (
           id SERIAL PRIMARY KEY,
           surface VARCHAR(100) NOT NULL,
           distinct_id VARCHAR(255),
           created_at TIMESTAMP NOT NULL DEFAULT NOW()
         )`,
      );
      // The health probe filters on created_at for the rolling 24h window.
      await pool.query(
        `CREATE INDEX IF NOT EXISTS identify_missing_anon_events_created_at_idx
           ON identify_missing_anon_events (created_at)`,
      );
    })().catch((err) => {
      ensureIdentifyMissingAnonPromise = null;
      throw err;
    });
  }
  await ensureIdentifyMissingAnonPromise;
}

// Shared classifier for a `$identify` event that is missing its
// `$anon_distinct_id` join key. Returns null for healthy or non-identify
// payloads so both the in-memory warning path and the DB persistence path
// agree on what counts as a regression.
function detectMissingAnonIdentify(
  body: unknown,
): { surface: string; distinctId: string | null } | null {
  if (!body || typeof body !== "object") return null;
  if ((body as { event?: unknown }).event !== "$identify") return null;
  const properties = (body as { properties?: unknown }).properties;
  const anonId =
    properties && typeof properties === "object"
      ? (properties as { $anon_distinct_id?: unknown }).$anon_distinct_id
      : undefined;
  if (typeof anonId === "string" && anonId.length > 0) return null;
  const surfaceRaw =
    properties && typeof properties === "object"
      ? (properties as { surface?: unknown }).surface
      : undefined;
  const surface =
    typeof surfaceRaw === "string" && surfaceRaw.length > 0
      ? surfaceRaw
      : "unknown";
  const distinctIdRaw = (body as { distinct_id?: unknown }).distinct_id;
  const distinctId =
    typeof distinctIdRaw === "string" ? distinctIdRaw : null;
  return { surface, distinctId };
}

// Durable persistence of a single missing-anon-id event. Designed to run
// fire-and-forget from the /api/analytics handler (alongside the quiz_save /
// auth_prompt writers) so a DB hiccup never blocks forwarding upstream.
export async function recordMissingAnonEvent(
  pool: pg.Pool,
  body: unknown,
): Promise<void> {
  const missing = detectMissingAnonIdentify(body);
  if (!missing) return;
  await ensureIdentifyMissingAnonTable(pool);
  await pool.query(
    `INSERT INTO identify_missing_anon_events (surface, distinct_id)
     VALUES ($1, $2)`,
    [missing.surface, missing.distinctId],
  );
}

interface MissingAnonTotals {
  allTime: number;
  last24h: number;
  lastSeenAt: string | null;
  bySurface: Record<string, number>;
}

async function readMissingAnonTotalsFromDb(
  pool: pg.Pool,
): Promise<MissingAnonTotals> {
  await ensureIdentifyMissingAnonTable(pool);
  const totals = await pool.query(
    `SELECT
       COUNT(*)::int AS all_time,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '24 hours'
       )::int AS last_24h,
       MAX(created_at) AS last_seen
     FROM identify_missing_anon_events`,
  );
  const bySurfaceRows = await pool.query(
    `SELECT COALESCE(surface, 'unknown') AS surface, COUNT(*)::int AS c
       FROM identify_missing_anon_events
      GROUP BY COALESCE(surface, 'unknown')`,
  );
  const row = (totals?.rows?.[0] ?? {}) as {
    all_time?: number | string | null;
    last_24h?: number | string | null;
    last_seen?: string | Date | null;
  };
  const bySurface: Record<string, number> = {};
  for (const r of bySurfaceRows?.rows ?? []) {
    bySurface[(r as { surface: string }).surface] = Number(
      (r as { c: number | string }).c,
    );
  }
  const lastSeen = row.last_seen
    ? new Date(row.last_seen).toISOString()
    : null;
  return {
    allTime: Number(row.all_time ?? 0),
    last24h: Number(row.last_24h ?? 0),
    lastSeenAt: lastSeen,
    bySurface,
  };
}

export interface AnalyticsHealthSnapshot {
  healthy: boolean;
  identify_missing_anon_id: {
    // `count` is the all-time total (kept for backward compatibility with
    // existing scrapers). `all_time_count` is the same value under an
    // explicit name; `last_24h_count` drives the alert so it fires on recent
    // regressions and auto-clears after a quiet day, rather than staying red
    // forever once a single ancient event was logged.
    count: number;
    all_time_count: number;
    last_24h_count: number;
    last_seen_at: string | null;
    by_surface: Record<string, number>;
  };
  cross_device_bridge: {
    emitted: number;
    failed: number;
    last_failure_at: string | null;
  };
  started_at: string;
  generated_at: string;
}

// Reads the durable missing-anon totals from Postgres so the probe survives
// restarts. Falls back to the in-memory counters when no pool is configured
// or the DB read fails, so the probe degrades gracefully rather than 500ing.
export async function getAnalyticsHealthSnapshot(
  pool: pg.Pool | null,
): Promise<AnalyticsHealthSnapshot> {
  let allTime = identifyMissingAnonIdCount;
  let last24h = identifyMissingAnonIdCount;
  let lastSeenAt = identifyMissingAnonIdLastAt;
  let bySurface: Record<string, number> = { ...identifyMissingAnonIdBySurface };
  if (pool) {
    try {
      const totals = await readMissingAnonTotalsFromDb(pool);
      allTime = totals.allTime;
      last24h = totals.last24h;
      lastSeenAt = totals.lastSeenAt;
      bySurface = totals.bySurface;
    } catch (err: any) {
      console.warn(
        "[analytics] failed to read missing-anon totals from DB; falling back to in-memory counters",
        err?.message ?? err,
      );
    }
  }
  return {
    healthy: last24h === 0 && crossDeviceBridgesFailed === 0,
    identify_missing_anon_id: {
      count: allTime,
      all_time_count: allTime,
      last_24h_count: last24h,
      last_seen_at: lastSeenAt,
      by_surface: bySurface,
    },
    cross_device_bridge: {
      emitted: crossDeviceBridgesEmitted,
      failed: crossDeviceBridgesFailed,
      last_failure_at: crossDeviceBridgeLastFailureAt,
    },
    started_at: ANALYTICS_HEALTH_STARTED_AT,
    generated_at: new Date().toISOString(),
  };
}

// ── Auth-prompt backfill freshness alert (task #127) ──────────────────────
// The scheduled PostHog → `auth_prompt_events` reconciliation
// (authPromptBackfillScheduler.ts) can quietly stop running — credentials
// rotate out, the timer dies after a crash loop, etc. Rather than relying on
// someone noticing a stale "Last PostHog backfill" timestamp on the
// dashboard, the analytics health probe polls the newest row in
// `auth_prompt_backfill_runs` and folds a "stale" verdict into its red/green
// state. That reuses the *existing* notification channel: the probe returns
// HTTP 503 (which the uptime monitor pages on) and logs a structured alert.
//
// The check is cached for a few minutes so a high-frequency uptime probe does
// not hammer the database, and the alert log is emitted at most once per
// cache refresh while stale (not on every probe hit).
const BACKFILL_FRESHNESS_TTL_MS = 5 * 60 * 1000;
let backfillFreshnessCache: { at: number; value: BackfillFreshness } | null =
  null;
let lastBackfillStaleAlertAt: string | null = null;

export function resetAuthPromptBackfillFreshnessCache(): void {
  backfillFreshnessCache = null;
  lastBackfillStaleAlertAt = null;
}

export function getLastBackfillStaleAlertAt(): string | null {
  return lastBackfillStaleAlertAt;
}

async function evaluateAuthPromptBackfillFreshness(): Promise<BackfillFreshness | null> {
  const nowMs = Date.now();
  if (
    backfillFreshnessCache &&
    nowMs - backfillFreshnessCache.at < BACKFILL_FRESHNESS_TTL_MS
  ) {
    return backfillFreshnessCache.value;
  }
  const pool = getPool();
  if (!pool) return null;
  try {
    const freshness = await getAuthPromptBackfillFreshness(pool);
    backfillFreshnessCache = { at: nowMs, value: freshness };
    if (freshness.stale) {
      lastBackfillStaleAlertAt = new Date().toISOString();
      console.error(
        "[analytics] auth-prompt PostHog backfill is stale — scheduled reconciliation may be broken",
        {
          last_ran_at: freshness.lastRanAt,
          age_days:
            freshness.ageDays != null
              ? Number(freshness.ageDays.toFixed(2))
              : null,
          threshold_days: freshness.thresholdDays,
        },
      );
    }
    return freshness;
  } catch (err: any) {
    // A DB hiccup must not turn the probe red on its own — degrade to the
    // last known value (or "unknown") so the staleness check only ever fires
    // on a genuinely old backfill, not on a transient query failure.
    console.warn(
      "[analytics] could not evaluate auth-prompt backfill freshness:",
      err?.message ?? String(err),
    );
    return backfillFreshnessCache?.value ?? null;
  } finally {
    try {
      await pool.end();
    } catch {
      // ignore — pool may already be ended
    }
  }
}

// ── Cross-device email → distinct_id reconciliation ───────────────────────
// Same-device join works today: when a visitor enters their email at the
// readiness-lead / quiz-save gate, mobile + web promote the live distinct_id
// from `anon:<random>` to `email:<sha256>` and send a `$identify` event that
// aliases the two so PostHog merges them on the spot (Task #55).
//
// What still leaks is the *cross-device* case: a person who enters their
// email on phone (becomes `email:<hash>`) and later registers on a laptop
// where the gate was skipped (becomes `user:<id>` directly off the laptop's
// own `anon:<random>`). PostHog has no way to know `email:<hash>` and
// `user:<id>` are the same human until the user re-enters that email
// somewhere already-identified — meanwhile the funnel double-counts them.
//
// To close that gap we keep an in-process map of `email_sha256` → the set of
// distinct_ids we have already observed sending `$identify` with that hash.
// When a *new* distinct_id shows up for a known email we forward an extra
// `$identify` event upstream that aliases the previously-known id to the
// new one, so PostHog merges them server-to-server with no extra client work.
// The map is bounded (FIFO eviction past `RECONCILE_MAX_EMAILS`) so even a
// long-running process won't grow unbounded.
//
// This is observational + corrective only: original events are still
// forwarded unchanged, and we never emit anything that wasn't already
// implied by the client's own identify payloads.
const RECONCILE_MAX_EMAILS = 50_000;
const emailToDistinctIds = new Map<string, Set<string>>();
// Per-email cache of bridge pairs we have already emitted upstream. Pair
// shape is `${distinctId}→${anonDistinctId}` so reversed aliases are
// treated as distinct (PostHog cares about the direction). This prevents
// repeated $identify events from re-emitting the same bridge every time
// an already-known distinct_id re-identifies with the same email — once
// PostHog has merged a pair, replaying it is just noise.
const emittedBridges = new Map<string, Set<string>>();
let crossDeviceBridgesEmitted = 0;
let crossDeviceBridgesFailed = 0;
let crossDeviceBridgeLastFailureAt: string | null = null;

export function getCrossDeviceBridgeCount(): number {
  return crossDeviceBridgesEmitted;
}

export function getCrossDeviceBridgeFailureCount(): number {
  return crossDeviceBridgesFailed;
}

export function getCrossDeviceBridgeLastFailureAt(): string | null {
  return crossDeviceBridgeLastFailureAt;
}

export function resetCrossDeviceBridgeState(): void {
  crossDeviceBridgesEmitted = 0;
  crossDeviceBridgesFailed = 0;
  crossDeviceBridgeLastFailureAt = null;
  emailToDistinctIds.clear();
  emittedBridges.clear();
}

function hasEmittedBridge(
  emailHash: string,
  distinctId: string,
  anonDistinctId: string,
): boolean {
  const set = emittedBridges.get(emailHash);
  return !!set && set.has(`${distinctId}→${anonDistinctId}`);
}

function markBridgeEmitted(
  emailHash: string,
  distinctId: string,
  anonDistinctId: string,
): void {
  let set = emittedBridges.get(emailHash);
  if (!set) {
    set = new Set();
    emittedBridges.set(emailHash, set);
  }
  set.add(`${distinctId}→${anonDistinctId}`);
}

// Truncate the SHA-256 to its first 8 chars before logging. Enough to
// correlate failures with a specific person across log lines without
// leaking the full hash (which is reversible against a known email).
function safeEmailHashTag(hash: string): string {
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash;
}

function recordBridgeFailure(
  reason: string,
  context: {
    distinctId: string;
    anonDistinctId: string;
    emailHash: string;
  },
): void {
  crossDeviceBridgesFailed += 1;
  crossDeviceBridgeLastFailureAt = new Date().toISOString();
  console.warn(
    "[analytics] cross-device $identify bridge failed; PostHog merge may be lost",
    {
      reason,
      distinct_id: context.distinctId,
      anon_distinct_id: context.anonDistinctId,
      email_sha256_prefix: safeEmailHashTag(context.emailHash),
      failure_count: crossDeviceBridgesFailed,
    },
  );
}

function rankDistinctId(id: string): number {
  if (id.startsWith("user:")) return 3;
  if (id.startsWith("email:")) return 2;
  return 1;
}

function recordEmailDistinctId(
  emailHash: string,
  distinctId: string,
): string[] {
  let set = emailToDistinctIds.get(emailHash);
  if (!set) {
    if (emailToDistinctIds.size >= RECONCILE_MAX_EMAILS) {
      const oldestKey = emailToDistinctIds.keys().next().value as
        | string
        | undefined;
      if (oldestKey !== undefined) emailToDistinctIds.delete(oldestKey);
    }
    set = new Set();
    emailToDistinctIds.set(emailHash, set);
  } else {
    // Refresh insertion order so active emails aren't evicted.
    emailToDistinctIds.delete(emailHash);
    emailToDistinctIds.set(emailHash, set);
  }
  const priorIds = Array.from(set).filter((prior) => prior !== distinctId);
  set.add(distinctId);
  return priorIds;
}

function forwardBridgeIdentify(params: {
  distinctId: string;
  anonDistinctId: string;
  emailHash: string;
}): void {
  crossDeviceBridgesEmitted += 1;
  const body = {
    event: "$identify",
    distinct_id: params.distinctId,
    properties: {
      $anon_distinct_id: params.anonDistinctId,
      email_sha256: params.emailHash,
      surface: "server_reconcile",
      distinct_id: params.distinctId,
    },
  };
  // Failure observability — the bridge is the mechanism that prevents
  // cross-device double-counting, so a silent failure here would erode
  // funnel accuracy without anyone noticing. We log + bump a counter on
  // both synchronous throws (e.g. malformed URL) and async rejections
  // (upstream unreachable / non-2xx network error) so the health probe
  // and log search can surface regressions.
  try {
    const promise = fetch(`${AUTH_API_URL}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (promise && typeof (promise as Promise<unknown>).then === "function") {
      (promise as Promise<{ ok: boolean; status: number }>)
        .then((response) => {
          if (!response || !response.ok) {
            recordBridgeFailure(
              `upstream_status_${response?.status ?? "unknown"}`,
              params,
            );
          }
        })
        .catch((err) => {
          recordBridgeFailure(
            `upstream_error: ${err?.message ?? String(err)}`,
            params,
          );
        });
    }
  } catch (err: any) {
    recordBridgeFailure(`throw: ${err?.message ?? String(err)}`, params);
  }
}

function reconcileEmailIdentities(body: unknown): void {
  if (!body || typeof body !== "object") return;
  if ((body as { event?: unknown }).event !== "$identify") return;
  const properties = (body as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return;
  const emailHashRaw = (properties as { email_sha256?: unknown }).email_sha256;
  if (typeof emailHashRaw !== "string" || emailHashRaw.length === 0) return;
  const distinctIdRaw = (body as { distinct_id?: unknown }).distinct_id;
  if (typeof distinctIdRaw !== "string" || distinctIdRaw.length === 0) return;
  const emailHash = emailHashRaw.toLowerCase();
  const distinctId = distinctIdRaw;
  const priorIds = recordEmailDistinctId(emailHash, distinctId);
  if (priorIds.length === 0) return;
  const newRank = rankDistinctId(distinctId);
  for (const prior of priorIds) {
    const priorRank = rankDistinctId(prior);
    // Always alias toward the higher-tier id so `user:<id>` wins over
    // `email:<hash>` wins over `anon:<random>`. PostHog uses the
    // `distinct_id` of an `$identify` as the surviving person.
    const winner = newRank >= priorRank ? distinctId : prior;
    const loser = newRank >= priorRank ? prior : distinctId;
    // Dedup: once we've already told PostHog about a (winner, loser) pair
    // for this email, replaying the same $identify is just noise — every
    // subsequent event from `loser` is already routed to `winner` upstream.
    if (hasEmittedBridge(emailHash, winner, loser)) continue;
    markBridgeEmitted(emailHash, winner, loser);
    forwardBridgeIdentify({
      distinctId: winner,
      anonDistinctId: loser,
      emailHash,
    });
  }
}

function inspectIdentifyPayload(body: unknown): void {
  const missing = detectMissingAnonIdentify(body);
  if (!missing) return;
  identifyMissingAnonIdCount += 1;
  identifyMissingAnonIdLastAt = new Date().toISOString();
  identifyMissingAnonIdBySurface[missing.surface] =
    (identifyMissingAnonIdBySurface[missing.surface] ?? 0) + 1;
  console.warn(
    "[analytics] $identify event missing $anon_distinct_id; PostHog cannot stitch pre-account events",
    {
      distinct_id: missing.distinctId ?? undefined,
      surface: missing.surface,
      missing_count: identifyMissingAnonIdCount,
    },
  );
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Internal admin tooling — Basic-Auth-protected dashboards aggregating
  // planner usage. Registered before the SPA fallback so /admin and
  // /api/admin/planner-analytics resolve to these handlers, not the React
  // app.
  registerPlannerAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });
  registerQuizSaveAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });
  registerAuthPromptAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });
  registerBriefFreshnessRoutes(app, { requireAdminBasicAuth });

  // Analytics health probe — exposes the durable count of `$identify`
  // events that arrived without `$anon_distinct_id`. Counts are read from the
  // `identify_missing_anon_events` Postgres table so they survive deploys,
  // crashes, and workflow restarts (a slow trickle on a rarely-restarted
  // surface used to silently auto-clear this alert on every restart).
  // Designed to be scraped by an external uptime check (UptimeRobot,
  // BetterStack, etc.) so that a regression on any surface (web, mobile,
  // future entry point) pages us within minutes instead of being buried in
  // server logs. The endpoint is unauthenticated by design — uptime probes
  // typically can't carry Basic Auth — and only exposes counts, no PII.
  // Healthy state returns HTTP 200; a non-zero *last-24h* count returns HTTP
  // 503 so the alert fires on recent regressions (and auto-clears after a
  // quiet day) rather than staying red forever once a single ancient event
  // was logged. A stale auth-prompt backfill also turns the probe red even
  // when the counters are clean, so the same uptime alert fires (task #127).
  app.get("/api/_internal/analytics-health", async (_req, res) => {
    const pool = getPool();
    try {
      const snapshot = await getAnalyticsHealthSnapshot(pool);
      const freshness = await evaluateAuthPromptBackfillFreshness();
      const backfillStale = freshness?.stale === true;
      res.setHeader("Cache-Control", "no-store");
      const body = {
        ...snapshot,
        // A stale backfill turns the probe red even when the persisted counters
        // are clean, so the existing uptime alert fires (task #127).
        healthy: snapshot.healthy && !backfillStale,
        auth_prompt_backfill: freshness
          ? {
              stale: freshness.stale,
              has_run: freshness.hasRun,
              last_ran_at: freshness.lastRanAt,
              age_days: freshness.ageDays,
              threshold_days: freshness.thresholdDays,
            }
          : null,
      };
      res.status(body.healthy ? 200 : 503).json(body);
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  });

  // Save-progress prompt firing health — guards against the post-result
  // "save your progress" modal silently going dark (analytics
  // misconfiguration, a deploy that breaks the result-screen mount, etc).
  // Reads the locally-persisted `quiz_save_events` table and compares the
  // most recent complete day's `quiz_save_shown` (placement: result_screen)
  // count against the trailing 7-day median. Returns HTTP 503 when the prompt
  // dropped to zero or fell well below that baseline, so the same scheduled
  // GitHub Action / on-call pattern as the analytics-health probe surfaces it
  // within minutes. Unauthenticated by design (uptime probes can't carry
  // Basic Auth) and exposes only counts, no PII. Thresholds live in
  // `server/quizSavePromptHealth.ts`.
  app.get("/api/_internal/quiz-save-prompt-health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const pool = getPool();
    if (!pool) {
      // No DB configured — can't evaluate; surface the gap rather than
      // silently returning healthy.
      const snapshot = unavailableQuizSavePromptHealthSnapshot();
      res.status(503).json(snapshot);
      return;
    }
    try {
      const snapshot = await computeQuizSavePromptHealth(pool);
      res.status(snapshot.healthy ? 200 : 503).json(snapshot);
    } catch (err: any) {
      console.error(
        "Quiz-save prompt health probe error:",
        err?.message ?? err,
      );
      const snapshot = unavailableQuizSavePromptHealthSnapshot();
      res.status(503).json(snapshot);
    } finally {
      await pool.end();
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/me`, {
        method: "GET",
        headers,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${PASSWORD_API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Registration service unavailable" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const upstream = await fetch(`${AUTH_API_URL}/api/auth/logout`, {
        method: "POST",
        headers,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${PASSWORD_API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") {
          res.setHeader(key, value);
        }
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Password reset service unavailable" });
    }
  });

  app.delete("/api/account", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/account`, {
        method: "DELETE",
        headers,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") res.setHeader(key, value);
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Account deletion service unavailable" });
    }
  });

  app.post("/api/billing/mobile/refresh", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/billing/mobile/refresh`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") res.setHeader(key, value);
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Billing service unavailable" });
    }
  });

  app.get("/api/entitlements", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) headers["Authorization"] = authHeader;
      const upstream = await fetch(`${AUTH_API_URL}/api/entitlements`, {
        method: "GET",
        headers,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const upstreamContentType = upstream.headers.get("content-type") ?? "";
      if (upstreamContentType) res.setHeader("content-type", upstreamContentType);

      // Strip dropped legacy fields (`decisionPass`, `countryUnlocks`) from
      // the upstream payload before forwarding. The 2-tier pricing model
      // ignores these fields client-side; sending them is dead weight.
      if (upstreamContentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            delete (parsed as Record<string, unknown>).decisionPass;
            delete (parsed as Record<string, unknown>).countryUnlocks;
          }
          res.send(JSON.stringify(parsed));
          return;
        } catch {
          // Fall through and forward original text if parse fails.
        }
      }
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Entitlements service unavailable" });
    }
  });

  app.post("/api/analytics", async (req: Request, res: Response) => {
    inspectIdentifyPayload(req.body);
    reconcileEmailIdentities(req.body);
    // Persist quiz-save modal events locally (in addition to forwarding
    // upstream) so /admin/quiz-save-analytics can compute the recovery
    // rate without depending on PostHog's API. Failures are swallowed —
    // forwarding upstream is the source of truth for everything else.
    const persistPool = getPool();
    if (persistPool) {
      // Persist quiz-save, auth-prompt, and missing-anon-id events from the
      // same pool. Wait for all to settle before ending the pool so we don't
      // tear down a connection mid-INSERT for the slowest of them.
      Promise.allSettled([
        recordQuizSaveEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist quiz_save event:",
            err?.message ?? err,
          );
        }),
        recordAuthPromptEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist auth_prompt event:",
            err?.message ?? err,
          );
        }),
        recordMissingAnonEvent(persistPool, req.body).catch((err) => {
          console.warn(
            "[analytics] failed to persist missing-anon event:",
            err?.message ?? err,
          );
        }),
      ]).finally(() => {
        persistPool.end().catch(() => {});
      });
    }
    try {
      const upstream = await fetch(`${AUTH_API_URL}/api/analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      res.status(upstream.status).json({ ok: true });
    } catch {
      res.status(200).json({ ok: true });
    }
  });

  // ── A/B test endpoints ─────────────────────────────────────────────────

  app.get("/api/ab/me", async (req: Request, res: Response) => {
    const { sessionId, annualVariant } =
      await getOrAssignVariants(req, res);
    res.json({
      sessionId,
      tests: {
        annual_price: {
          enabled: annualPriceEnabled(),
          variant: annualVariant,
          // Surface the price the FE should display so the FE never
          // has to know about the env-flag wiring.
          priceUsd: annualVariant === "annual_99" ? 99 : 89,
        },
      },
    });
  });

  app.post("/api/ab/conversion", async (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const sessionId = cookies[PRICING_VARIANT_COOKIE];
    if (!sessionId) {
      res.status(400).json({ error: "Missing session cookie" });
      return;
    }
    const { plan, revenue, stripeSubscriptionId } = req.body as {
      plan?: string;
      revenue?: number;
      stripeSubscriptionId?: string;
    };

    // Only attribute conversions to tests that are currently enabled AND
    // relevant to the plan being purchased. A historical assignment from a
    // prior test period is ignored — otherwise a stale row would falsely
    // bump the active test's conversion rate.
    //   - annual   → annual_price_test
    const activeTests: string[] = [];
    if (plan === "annual" && annualPriceEnabled()) activeTests.push(TEST_ANNUAL_PRICE);

    if (activeTests.length === 0) {
      // No experiment is collecting data for this plan right now; nothing
      // to attribute. Still 200 OK so the FE doesn't display a noisy error.
      res.json({ ok: true, conversions: 0 });
      return;
    }

    const userId = await getUserIdFromToken(req);
    const pool = getPool();
    if (!pool) {
      res.json({ ok: true });
      return;
    }
    try {
      await ensureAbTables(pool);
      const assignments = await pool.query(
        `SELECT test_name, variant FROM ab_test_assignments
         WHERE session_id = $1 AND test_name = ANY($2::varchar[])`,
        [sessionId, activeTests],
      );
      if (assignments.rows.length === 0) {
        res.json({ ok: true, conversions: 0 });
        return;
      }
      let inserted = 0;
      for (const row of assignments.rows) {
        // Idempotency: don't double-record if the same session_id +
        // test_name + stripeSubscriptionId combination already converted
        // (e.g. the user reloaded /account?subscribed=true).
        const dedupeWhere = stripeSubscriptionId
          ? `WHERE session_id = $1 AND test_name = $2 AND stripe_subscription_id = $3 AND converted = TRUE`
          : `WHERE session_id = $1 AND test_name = $2 AND converted = TRUE AND stripe_subscription_id IS NULL`;
        const dedupeParams: unknown[] = stripeSubscriptionId
          ? [sessionId, row.test_name, stripeSubscriptionId]
          : [sessionId, row.test_name];
        const existing = await pool.query(
          `SELECT 1 FROM conversions ${dedupeWhere} LIMIT 1`,
          dedupeParams,
        );
        if (existing.rows.length > 0) continue;

        await pool.query(
          `INSERT INTO conversions
             (session_id, user_id, test_name, variant, plan, converted,
              revenue_day_0, stripe_subscription_id)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
          [
            sessionId,
            userId,
            row.test_name,
            row.variant,
            plan ?? null,
            typeof revenue === "number" ? revenue : 0,
            stripeSubscriptionId ?? null,
          ],
        );
        inserted += 1;
      }
      res.json({ ok: true, conversions: inserted });
    } catch (err: any) {
      console.error("Conversion record error:", err?.message);
      res.json({ ok: true });
    } finally {
      await pool.end();
    }
  });

  // Optional trailing-window parameter for the A/B results endpoints. Unlike
  // the planner / quiz-save / auth-prompt dashboards (which default to 30
  // days), the A/B view defaults to all-time when `?days` is absent — long
  // running tests are usually read against their lifetime totals, and the
  // window is opt-in for spot-checking recent performance. When present it is
  // clamped to 1–365 like the other dashboards.
  const readAbWindowDays = (req: Request): number | undefined => {
    const raw = req.query.days;
    if (typeof raw !== "string") return undefined;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(365, n);
  };

  app.get("/api/admin/ab-results", async (req: Request, res: Response) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      const data = await computeAbResults(pool, readAbWindowDays(req));
      res.json({
        ...data,
        // Cross-link to other internal tools so anyone who lands on this
        // JSON endpoint can find the full admin index and the planner
        // analytics dashboard without grep-hunting through routes.ts.
        links: {
          admin_index: "/admin",
          planner_analytics_html: "/admin/planner-analytics",
          planner_analytics_json: "/api/admin/planner-analytics",
          ab_results_csv: "/admin/ab-results.csv",
        },
      });
    } catch (err: any) {
      console.error("AB results error:", err?.message);
      res.status(500).json({ error: "Failed to compute results" });
    } finally {
      await pool.end();
    }
  });

  const sendAbResultsCsv = async (req: Request, res: Response) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res
        .status(503)
        .type("text/plain")
        .send("Database not configured (set DATABASE_URL).");
      return;
    }
    try {
      const data = await computeAbResults(pool, readAbWindowDays(req));
      res
        .type("text/csv; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          'attachment; filename="ab-results.csv"',
        )
        .send(renderAbResultsCsv(data));
    } catch (err: any) {
      console.error("AB results CSV error:", err?.message);
      res
        .status(500)
        .type("text/plain")
        .send(`Failed to compute results: ${err?.message ?? "unknown"}`);
    } finally {
      await pool.end();
    }
  };

  app.get("/admin/ab-results.csv", sendAbResultsCsv);
  app.get("/api/admin/ab-results.csv", sendAbResultsCsv);

  app.get("/admin/ab-results", async (req: Request, res: Response) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res
        .status(503)
        .type("text/html")
        .send("<h1>A/B test results unavailable</h1><p>Database is not configured (set DATABASE_URL).</p>");
      return;
    }
    try {
      const data = await computeAbResults(pool);
      res.type("text/html").send(renderAbResultsHtml(data));
    } catch (err: any) {
      console.error("AB results HTML error:", err?.message);
      res
        .status(500)
        .type("text/html")
        .send("<h1>A/B test results unavailable</h1><p>Failed to compute results.</p>");
    } finally {
      await pool.end();
    }
  });

  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
      return;
    }

    const { plan } = req.body as { plan?: "monthly" | "annual" };
    if (plan !== "monthly" && plan !== "annual") {
      res.status(400).json({ error: "plan must be 'monthly' or 'annual'" });
      return;
    }

    // Resolve variants for this session — drives the Stripe price for the
    // annual A/B test. Monthly has a single SKU since the paid-intro test
    // was retired.
    const { sessionId, annualVariant } =
      await getOrAssignVariants(req, res);

    // Variant-specific Stripe prices MUST be configured separately —
    // never silently fall back to the control SKU because that would
    // charge the treatment user the wrong amount.
    const monthlyId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const annualId = process.env.STRIPE_ANNUAL_PRICE_ID;
    const annual99Id = process.env.STRIPE_ANNUAL_99_PRICE_ID;

    let priceId: string | undefined;
    const trialDays = 14;
    const dueToday = 0;
    let missingEnv: string | null = null;

    if (plan === "monthly") {
      priceId = monthlyId;
      if (!priceId) missingEnv = "STRIPE_MONTHLY_PRICE_ID";
    } else {
      // annual — both variants enter a 14-day free trial, so day-0 revenue
      // is $0. The full annual charge ($89 or $99) only lands at trial end
      // and must be reconciled by the day-60 revenue rollup job from
      // Stripe invoice events, not from this success URL.
      if (annualVariant === "annual_99") {
        priceId = annual99Id;
        if (!priceId) missingEnv = "STRIPE_ANNUAL_99_PRICE_ID";
      } else {
        priceId = annualId;
        if (!priceId) missingEnv = "STRIPE_ANNUAL_PRICE_ID";
      }
    }

    if (!priceId || missingEnv) {
      res.status(503).json({
        error: `Stripe ${plan} price ID is not configured${
          plan === "annual" ? ` for variant "${annualVariant}"` : ""
        }. Set ${missingEnv}.`,
      });
      return;
    }

    try {
      const baseUrl = getBaseUrl(req);

      const successQuery = new URLSearchParams({
        subscribed: "true",
        plan,
        value: String(dueToday),
        currency: "USD",
        sid: sessionId,
        av: annualVariant,
      }).toString();

      const checkoutPayload: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/account?${successQuery}`,
        cancel_url: `${baseUrl}/pricing?checkout=cancel`,
        metadata: {
          eh_session_id: sessionId,
          annual_variant: annualVariant,
          plan,
        },
      };
      checkoutPayload.subscription_data = { trial_period_days: trialDays };

      const session = await stripe.checkout.sessions.create(checkoutPayload);

      res.json({
        url: session.url,
        variant: { annual: annualVariant },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
      return;
    }

    // Authz: derive customerId from the authenticated user. Any customerId
    // supplied in the body is ignored — accepting it from the client would
    // be an IDOR vulnerability (any caller could open another user's
    // billing portal by guessing/leaking a Stripe customer id).
    const user = await getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const customerId = user.stripeCustomerId;
    if (!customerId) {
      res.status(404).json({ error: "No Stripe customer on file for this account" });
      return;
    }

    try {
      const baseUrl = getBaseUrl(req);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: baseUrl,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stripe/status", async (_req: Request, res: Response) => {
    res.json({ hasProAccess: false });
  });

  app.post("/api/auth/quiz-lead", async (req: Request, res: Response) => {
    const { email, readinessLevel, topRegion, regionPreference, score, risks, source } = req.body as {
      email?: string;
      readinessLevel?: string;
      topRegion?: string;
      regionPreference?: string;
      score?: number;
      risks?: string[];
      source?: string;
    };

    const level = readinessLevel;
    if (!email || !level) {
      res.status(200).json({ ok: true });
      return;
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }

    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO quiz_leads (email, readiness_level, top_region, region_preference, score, risks, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [email, level, topRegion || null, regionPreference || null, score || null, JSON.stringify(risks || []), source || "ios_onboarding"]
      );
    } catch (err: any) {
      console.error("Quiz lead insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });

  app.post("/api/waitlist", async (req: Request, res: Response) => {
    const { countrySlug, email, note } = req.body as {
      countrySlug?: string;
      email?: string;
      note?: string;
    };

    if (!countrySlug || typeof countrySlug !== "string") {
      res.status(400).json({ error: "countrySlug is required" });
      return;
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }

    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        "INSERT INTO waitlist (country_slug, email, note) VALUES ($1, $2, $3)",
        [countrySlug, email, note || null]
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Waitlist insert error:", err);
      res.status(500).json({ error: "Failed to join waitlist" });
    } finally {
      if (pool) await pool.end();
    }
  });

  app.post("/api/readiness-lead", async (req: Request, res: Response) => {
    const { email, score, readinessLevel, risks, answers } = req.body as {
      email?: string;
      score?: number;
      readinessLevel?: string;
      risks?: string[];
      answers?: Record<string, string>;
    };

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }

    const level = readinessLevel || null;

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }

    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO readiness_leads (email, score, readiness_level, risks, answers)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, score || null, level, JSON.stringify(risks || []), JSON.stringify(answers || {})]
      );
    } catch (err: any) {
      console.error("Readiness lead insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });

  app.post("/api/country-interest", async (req: Request, res: Response) => {
    const { email, country_slug } = req.body as {
      email?: string;
      country_slug?: string;
    };

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }

    if (!country_slug || typeof country_slug !== "string") {
      res.status(400).json({ error: "country_slug is required" });
      return;
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(200).json({ ok: true });
      return;
    }

    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl });
      await pool.query(
        `INSERT INTO country_interest (email, country_slug)
         VALUES ($1, $2)`,
        [email, country_slug]
      );
    } catch (err: any) {
      console.error("Country interest insert error:", err);
    } finally {
      if (pool) await pool.end();
    }
    res.status(200).json({ ok: true });
  });

  // ── Bookmarks CRUD ──

  app.get("/api/bookmarks", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.json([]); return; }
    try {
      const result = await pool.query(
        "SELECT id, country_slug, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      res.json(result.rows.map((r: any) => ({ id: r.id, countrySlug: r.country_slug, createdAt: r.created_at })));
    } catch (err: any) {
      console.error("Bookmarks fetch error:", err);
      res.status(500).json({ error: "Failed to fetch bookmarks" });
    } finally {
      await pool.end();
    }
  });

  app.post("/api/bookmarks", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { countrySlug } = req.body as { countrySlug?: string };
    if (!countrySlug) { res.status(400).json({ error: "countrySlug is required" }); return; }
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }
    try {
      const existing = await pool.query(
        "SELECT id FROM bookmarks WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      if (existing.rows.length > 0) {
        res.json({ ok: true, id: existing.rows[0].id });
        return;
      }
      const result = await pool.query(
        "INSERT INTO bookmarks (user_id, country_slug) VALUES ($1, $2) RETURNING id",
        [userId, countrySlug]
      );
      res.json({ ok: true, id: result.rows[0].id });
    } catch (err: any) {
      console.error("Bookmark insert error:", err);
      res.status(500).json({ error: "Failed to save bookmark" });
    } finally {
      await pool.end();
    }
  });

  app.delete("/api/bookmarks/:countrySlug", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { countrySlug } = req.params;
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }
    try {
      await pool.query(
        "DELETE FROM bookmarks WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      await pool.query(
        "DELETE FROM move_notes WHERE user_id = $1 AND country_slug = $2",
        [userId, countrySlug]
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Bookmark delete error:", err);
      res.status(500).json({ error: "Failed to remove bookmark" });
    } finally {
      await pool.end();
    }
  });

  // ── Move Notes CRUD ──

  app.get("/api/notes", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.json([]); return; }
    try {
      const result = await pool.query(
        "SELECT id, country_slug, content, updated_at FROM move_notes WHERE user_id = $1 ORDER BY updated_at DESC",
        [userId]
      );
      res.json(result.rows.map((r: any) => ({ id: r.id, countrySlug: r.country_slug, content: r.content, updatedAt: r.updated_at })));
    } catch (err: any) {
      console.error("Notes fetch error:", err);
      res.status(500).json({ error: "Failed to fetch notes" });
    } finally {
      await pool.end();
    }
  });

  app.put("/api/notes/:countrySlug", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { countrySlug } = req.params;
    const { content } = req.body as { content?: string };
    if (typeof content !== "string") { res.status(400).json({ error: "content is required" }); return; }
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }
    try {
      await pool.query(
        `INSERT INTO move_notes (user_id, country_slug, content, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, country_slug) DO UPDATE SET content = $3, updated_at = NOW()`,
        [userId, countrySlug, content]
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Note save error:", err);
      res.status(500).json({ error: "Failed to save note" });
    } finally {
      await pool.end();
    }
  });

  // ── Planner progress ──

  const GENERIC_PROGRESS_STEP_IDS = GENERIC_PLAN_STEP_IDS;

  async function seedDefaultProgress(
    pool: pg.Pool,
    userId: string,
    country: string,
  ): Promise<void> {
    // Lazy migration — adds created_at to user_progress so freshly seeded
    // rows pick up DEFAULT NOW() (used by /api/admin/planner-analytics as
    // the "plan_focus_started" timestamp). The helper itself is idempotent
    // and process-cached; see plannerAnalytics.ts for the canonical impl.
    await ensureUserProgressCreatedAt(pool);
    for (const stepId of GENERIC_PROGRESS_STEP_IDS) {
      await pool.query(
        `INSERT INTO user_progress
           (user_id, step_id, target_country, completed, completed_at)
         VALUES ($1, $2, $3, FALSE, NULL)
         ON CONFLICT (user_id, step_id, target_country) DO NOTHING`,
        [userId, stepId, country],
      );
    }
  }

  async function getProgressPercentForUser(
    userId: string,
    country: string,
  ): Promise<number> {
    const pool = getPool();
    if (!pool) return 0;
    try {
      const total: number = GENERIC_PROGRESS_STEP_IDS.length;
      const result = await pool.query(
        `SELECT COUNT(*)::int AS done
           FROM user_progress
          WHERE user_id = $1
            AND target_country = $2
            AND completed = TRUE
            AND step_id = ANY($3::text[])`,
        [userId, country, [...GENERIC_PROGRESS_STEP_IDS]],
      );
      const done = Number(result.rows[0]?.done ?? 0);
      return total === 0 ? 0 : Math.round((done / total) * 100);
    } finally {
      await pool.end();
    }
  }

  app.get("/api/progress", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const country = (req.query.country as string | undefined) ?? "";
    if (!country) { res.status(400).json({ error: "country is required" }); return; }
    const pool = getPool();
    if (!pool) { res.json([]); return; }
    try {
      await seedDefaultProgress(pool, userId, country);
      const result = await pool.query(
        `SELECT step_id, completed, completed_at
           FROM user_progress
          WHERE user_id = $1 AND target_country = $2`,
        [userId, country],
      );
      res.json(
        result.rows.map((r: any) => ({
          stepId: r.step_id,
          completed: !!r.completed,
          completedAt: r.completed_at,
        })),
      );
    } catch (err: any) {
      console.error("Progress fetch error:", err);
      res.status(500).json({ error: "Failed to fetch progress" });
    } finally {
      await pool.end();
    }
  });

  app.get("/api/progress/percent", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const country = (req.query.country as string | undefined) ?? "";
    if (!country) { res.status(400).json({ error: "country is required" }); return; }
    const claimedUserId = (req.query.userId as string | undefined) ?? "";
    if (claimedUserId && claimedUserId !== userId) {
      res.status(403).json({ error: "userId does not match authenticated user" });
      return;
    }
    try {
      const percent = await getProgressPercentForUser(userId, country);
      res.json({ country, percent });
    } catch (err: any) {
      console.error("Progress percent error:", err);
      res.status(500).json({ error: "Failed to compute progress" });
    }
  });

  app.post("/api/progress", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { country, stepId, completed } = req.body as {
      country?: string;
      stepId?: string;
      completed?: boolean;
    };
    if (!country || !stepId || typeof completed !== "boolean") {
      res.status(400).json({ error: "country, stepId and completed are required" });
      return;
    }
    if (!(GENERIC_PROGRESS_STEP_IDS as readonly string[]).includes(stepId)) {
      res.status(400).json({ error: "Unknown stepId" });
      return;
    }
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }
    try {
      const completedAt = completed ? new Date() : null;
      await pool.query(
        `INSERT INTO user_progress
           (user_id, step_id, target_country, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, step_id, target_country)
         DO UPDATE SET
           completed = EXCLUDED.completed,
           completed_at = CASE
             WHEN user_progress.completed = TRUE AND EXCLUDED.completed = TRUE
               THEN user_progress.completed_at
             ELSE EXCLUDED.completed_at
           END`,
        [userId, stepId, country, completed, completedAt],
      );
      res.json({ ok: true, stepId, completed });
    } catch (err: any) {
      console.error("Progress save error:", err);
      res.status(500).json({ error: "Failed to save progress" });
    } finally {
      await pool.end();
    }
  });

  // ── Saved-state summary (bookmark + move-note counts) ──

  app.get("/api/saved-summary", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.json({ bookmarkCount: 0, notesCount: 0 }); return; }
    try {
      const bm = await pool.query("SELECT COUNT(*) as count FROM bookmarks WHERE user_id = $1", [userId]);
      const notes = await pool.query("SELECT COUNT(*) as count FROM move_notes WHERE user_id = $1 AND content != ''", [userId]);
      res.json({
        bookmarkCount: parseInt(bm.rows[0].count, 10),
        notesCount: parseInt(notes.rows[0].count, 10),
      });
    } catch (err: any) {
      console.error("Saved summary error:", err);
      res.json({ bookmarkCount: 0, notesCount: 0 });
    } finally {
      await pool.end();
    }
  });

  // ── Worksheets ──
  await registerWorksheetRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

// ── Worksheets implementation ──────────────────────────────────────────────
//
// Lazy-migrated tables (see ab_test_assignments above for the same pattern).
// Definitions are seeded from the canonical TS source on first hit so the
// table is the source of truth at request time without requiring a build
// step or external migration tool.

let worksheetTablesEnsured = false;

async function ensureWorksheetTables(pool: pg.Pool): Promise<void> {
  if (worksheetTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS worksheet_definitions (
      id VARCHAR(100) PRIMARY KEY,
      question_id INTEGER NOT NULL,
      dimension VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      questions JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_worksheet_responses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      worksheet_id VARCHAR(100) NOT NULL,
      answers JSONB NOT NULL,
      dimension_score NUMERIC(4,2) NOT NULL,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_worksheet_responses_user_worksheet_idx
      ON user_worksheet_responses (user_id, worksheet_id)
  `);

  // Seed / refresh definitions from the canonical TS source. Upsert so a
  // content edit ships at server boot without a manual migration.
  for (const w of WORKSHEETS) {
    await pool.query(
      `INSERT INTO worksheet_definitions
         (id, question_id, dimension, title, description, questions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         question_id = EXCLUDED.question_id,
         dimension = EXCLUDED.dimension,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         questions = EXCLUDED.questions,
         updated_at = NOW()`,
      [
        w.id,
        w.questionId,
        w.dimension,
        w.title,
        w.description,
        JSON.stringify(w.questions),
      ],
    );
  }
  worksheetTablesEnsured = true;
}

async function hasActiveEntitlement(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/entitlements`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
    });
    if (upstream.ok) {
      const data = (await upstream.json()) as Record<string, unknown> & {
        subscription?: { status?: string } | null;
        entitlements?: Record<string, { isActive?: boolean }> | null;
      };
      if (data.hasFullAccess === true || data.hasProAccess === true) return true;
      if (data.hasActiveSubscription === true || data.subscriptionActive === true) return true;
      if (data.subscription && typeof data.subscription === "object") {
        const status = (data.subscription as { status?: string }).status;
        if (status === "active" || status === "trialing") return true;
      }
      if (data.entitlements && typeof data.entitlements === "object") {
        const ent = (data.entitlements as Record<string, { isActive?: boolean }>)[
          "full_access_subscription"
        ];
        if (ent && ent.isActive === true) return true;
      }
    }
  } catch {
    // Upstream error — treat as not entitled.
  }

  return false;
}

async function registerWorksheetRoutes(app: Express): Promise<void> {
  // Public list — used by the worksheets index screen, which is visible to
  // free users (paywall fires only on opening an individual worksheet).
  // Returns metadata only; the full `questions` payload is gated behind an
  // active subscription via GET /api/worksheets/:id below.
  app.get("/api/worksheets", async (_req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) { res.json([]); return; }
    try {
      await ensureWorksheetTables(pool);
      const result = await pool.query(
        `SELECT id, question_id, dimension, title, description
           FROM worksheet_definitions
          ORDER BY question_id ASC`,
      );
      res.json(
        result.rows.map((r: any) => ({
          id: r.id,
          questionId: r.question_id,
          dimension: r.dimension,
          title: r.title,
          description: r.description,
        })),
      );
    } catch (err: any) {
      console.error("Worksheets list error:", err);
      res.status(500).json({ error: "Failed to fetch worksheets" });
    } finally {
      await pool.end();
    }
  });

  // Authenticated — returns the user's submitted worksheets keyed by id, so
  // the client can both render completion state on the list and feed
  // dimension scores into calculateQuizResultWithWorksheets. Registered
  // BEFORE the /:worksheetId param route so Express doesn't shadow it.
  app.get("/api/worksheets/responses", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.json([]); return; }
    try {
      await ensureWorksheetTables(pool);
      const result = await pool.query(
        `SELECT r.worksheet_id, r.answers, r.dimension_score, r.submitted_at,
                d.question_id
           FROM user_worksheet_responses r
           JOIN worksheet_definitions d ON d.id = r.worksheet_id
          WHERE r.user_id = $1`,
        [userId],
      );
      res.json(
        result.rows.map((r: any) => ({
          worksheetId: r.worksheet_id,
          questionId: r.question_id,
          answers: r.answers,
          dimensionScore: Number(r.dimension_score),
          submittedAt: r.submitted_at,
        })),
      );
    } catch (err: any) {
      console.error("Worksheet responses error:", err);
      res.status(500).json({ error: "Failed to fetch responses" });
    } finally {
      await pool.end();
    }
  });

  // Authenticated + entitled — returns the full worksheet definition
  // including the questions array. This is the actual paywall enforcement
  // point: even if a non-paid client bypassed the UI redirect, they
  // wouldn't be able to fetch question content. Declared after
  // /api/worksheets/responses so the param route doesn't shadow it.
  app.get("/api/worksheets/:worksheetId", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const worksheetIdParam = String(req.params.worksheetId);
    const def = WORKSHEET_BY_ID[worksheetIdParam];
    if (!def) { res.status(404).json({ error: "Unknown worksheet" }); return; }
    // Free users get one worksheet end-to-end. We allow the detail fetch
    // when:
    //   (a) the user is entitled, OR
    //   (b) the user has no prior responses (their one free worksheet), OR
    //   (c) the user already has a response for THIS worksheet (editing).
    // Anything else returns 402 so the client can route to /subscribe.
    const entitled = await hasActiveEntitlement(req);
    if (!entitled) {
      const pool = getPool();
      if (pool) {
        let blocked = false;
        try {
          await ensureWorksheetTables(pool);
          const r = await pool.query(
            `SELECT worksheet_id FROM user_worksheet_responses WHERE user_id = $1`,
            [userId],
          );
          const ids: string[] = r.rows.map((row: any) => row.worksheet_id);
          const hasThis = ids.includes(worksheetIdParam);
          if (ids.length >= 1 && !hasThis) {
            blocked = true;
          }
        } finally {
          // Close the pool exactly once. `pg.Pool#end` rejects when called
          // twice, so we route all teardown through this finally block.
          await pool.end();
        }
        if (blocked) {
          res.status(402).json({ error: "Subscription required" });
          return;
        }
      }
    }
    res.json({
      id: def.id,
      questionId: def.questionId,
      dimension: def.dimension,
      title: def.title,
      description: def.description,
      questions: def.questions,
    });
  });

  // Submit / replace the response for a worksheet. Auth required. Free
  // users get one worksheet end-to-end — they may insert their first
  // response or update one they previously submitted. Any second-or-later
  // insert from a non-entitled user is rejected with 402 (the open-time
  // UI redirect normally prevents reaching this branch).
  app.post("/api/worksheets/:worksheetId/submit", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const entitled = await hasActiveEntitlement(req);
    const worksheetId = String(req.params.worksheetId);
    if (!entitled) {
      const pool = getPool();
      if (pool) {
        let blocked = false;
        try {
          await ensureWorksheetTables(pool);
          const r = await pool.query(
            `SELECT worksheet_id FROM user_worksheet_responses WHERE user_id = $1`,
            [userId],
          );
          const ids: string[] = r.rows.map((row: any) => row.worksheet_id);
          const hasThis = ids.includes(worksheetId);
          if (ids.length >= 1 && !hasThis) {
            blocked = true;
          }
        } finally {
          // Close the pool exactly once — see matching note on the GET
          // endpoint above.
          await pool.end();
        }
        if (blocked) {
          res.status(402).json({ error: "Subscription required" });
          return;
        }
      }
    }
    const { answers } = (req.body ?? {}) as { answers?: unknown };
    if (!worksheetId || !answers) {
      res.status(400).json({ error: "worksheetId and answers are required" });
      return;
    }

    const def = WORKSHEET_BY_ID[worksheetId];
    if (!def) { res.status(404).json({ error: "Unknown worksheet" }); return; }

    const validated = validateAnswersShape(def, answers);
    if (!validated) { res.status(400).json({ error: "Invalid answers payload" }); return; }
    const score = scoreWorksheet(def, validated);
    if (score === null) { res.status(400).json({ error: "Could not score answers" }); return; }

    const pool = getPool();
    if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }
    try {
      await ensureWorksheetTables(pool);
      await pool.query(
        `INSERT INTO user_worksheet_responses
           (user_id, worksheet_id, answers, dimension_score, submitted_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, worksheet_id) DO UPDATE SET
           answers = EXCLUDED.answers,
           dimension_score = EXCLUDED.dimension_score,
           submitted_at = NOW()`,
        [userId, worksheetId, JSON.stringify(validated), score],
      );
      res.json({
        ok: true,
        worksheetId,
        questionId: def.questionId,
        dimensionScore: score,
      });
    } catch (err: any) {
      console.error("Worksheet submit error:", err);
      res.status(500).json({ error: "Failed to save worksheet" });
    } finally {
      await pool.end();
    }
  });
}
