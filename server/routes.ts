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
  recordAuthPromptEvent,
  registerAuthPromptAnalyticsRoutes,
} from "./authPromptAnalytics";
import {
  WORKSHEETS,
  WORKSHEET_BY_ID,
  scoreWorksheet,
  validateAnswersShape,
} from "../src/data/worksheets";

// ── A/B test config ─────────────────────────────────────────────────────
//
// Two independent tests, each toggled by an env flag. Per the backlog the
// two tests must NOT run simultaneously so we can isolate variables — if
// both flags are set we honour the paid-intro test and force everyone into
// the annual control bucket.
const PRICING_VARIANT_COOKIE = "eh_sid";
const TEST_PAID_INTRO = "paid_intro_test";
const TEST_ANNUAL_PRICE = "annual_price_test";
type PaidIntroVariant = "free_trial" | "paid_intro";
type AnnualVariant = "annual_89" | "annual_99";

function paidIntroEnabled(): boolean {
  return process.env.ENABLE_PAID_INTRO_TEST === "1" ||
    process.env.ENABLE_PAID_INTRO_TEST === "true";
}
function annualPriceEnabled(): boolean {
  // If paid-intro is on, force the annual test off so they don't run together.
  if (paidIntroEnabled()) return false;
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

function pickPaidIntroVariant(): PaidIntroVariant {
  if (!paidIntroEnabled()) return "free_trial"; // control
  return Math.random() < 0.5 ? "free_trial" : "paid_intro";
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

async function getOrAssignVariants(
  req: Request,
  res: Response,
): Promise<{
  sessionId: string;
  paidIntroVariant: PaidIntroVariant;
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
  let paidIntroVariant: PaidIntroVariant = "free_trial";
  let annualVariant: AnnualVariant = "annual_89";

  const pool = getPool();
  if (!pool) {
    return {
      sessionId,
      paidIntroVariant: pickPaidIntroVariant(),
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
    // the test is currently enabled. When a test is disabled (or forced off
    // because the other test is on), force the visitor into the control arm
    // even if a treatment variant was previously persisted — this prevents
    // a stale `paid_intro` or `annual_99` bucket from leaking across into a
    // period where we expect everyone in control.
    if (paidIntroEnabled()) {
      if (map.has(TEST_PAID_INTRO)) {
        paidIntroVariant = map.get(TEST_PAID_INTRO) as PaidIntroVariant;
      } else {
        paidIntroVariant = pickPaidIntroVariant();
        await pool.query(
          `INSERT INTO ab_test_assignments (session_id, test_name, variant)
           VALUES ($1, $2, $3)
           ON CONFLICT (session_id, test_name) DO NOTHING`,
          [sessionId, TEST_PAID_INTRO, paidIntroVariant],
        );
      }
    } else {
      paidIntroVariant = "free_trial"; // forced control while test is off
    }

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

  return { sessionId, paidIntroVariant, annualVariant, isNew };
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

let identifyMissingAnonIdCount = 0;

export function getIdentifyMissingAnonIdCount(): number {
  return identifyMissingAnonIdCount;
}

export function resetIdentifyMissingAnonIdCount(): void {
  identifyMissingAnonIdCount = 0;
}

function inspectIdentifyPayload(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const event = (body as { event?: unknown }).event;
  if (event !== "$identify") return;
  const properties = (body as { properties?: unknown }).properties;
  const anonId =
    properties && typeof properties === "object"
      ? (properties as { $anon_distinct_id?: unknown }).$anon_distinct_id
      : undefined;
  if (typeof anonId !== "string" || anonId.length === 0) {
    identifyMissingAnonIdCount += 1;
    const distinctId = (body as { distinct_id?: unknown }).distinct_id;
    console.warn(
      "[analytics] $identify event missing $anon_distinct_id; PostHog cannot stitch pre-account events",
      {
        distinct_id: typeof distinctId === "string" ? distinctId : undefined,
        missing_count: identifyMissingAnonIdCount,
      },
    );
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Internal admin tooling — Basic-Auth-protected dashboards aggregating
  // planner usage. Registered before the SPA fallback so /admin and
  // /api/admin/planner-analytics resolve to these handlers, not the React
  // app.
  registerPlannerAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });
  registerQuizSaveAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });
  registerAuthPromptAnalyticsRoutes(app, { requireAdminBasicAuth, getPool });

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
    // Persist quiz-save modal events locally (in addition to forwarding
    // upstream) so /admin/quiz-save-analytics can compute the recovery
    // rate without depending on PostHog's API. Failures are swallowed —
    // forwarding upstream is the source of truth for everything else.
    const persistPool = getPool();
    if (persistPool) {
      // Persist both quiz-save and auth-prompt events from the same pool.
      // Wait for both to settle before ending the pool so we don't tear
      // down a connection mid-INSERT for the slower of the two.
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
    const { sessionId, paidIntroVariant, annualVariant } =
      await getOrAssignVariants(req, res);
    res.json({
      sessionId,
      tests: {
        paid_intro: {
          enabled: paidIntroEnabled(),
          variant: paidIntroVariant,
        },
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
    // bump the active test's conversion rate. The set of active tests for
    // each plan is fixed:
    //   - monthly  → paid_intro_test
    //   - annual   → annual_price_test
    const activeTests: string[] = [];
    if (plan === "monthly" && paidIntroEnabled()) activeTests.push(TEST_PAID_INTRO);
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

  app.get("/api/admin/ab-results", async (req: Request, res: Response) => {
    if (!requireAdminBasicAuth(req, res)) return;
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    try {
      await ensureAbTables(pool);
      const result = await pool.query(`
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

      const tests: Record<
        string,
        Array<{
          variant: string;
          visitors: number;
          conversions: number;
          conversion_rate: number;
          revenue_day_0: number;
          revenue_day_60: number;
          arpu_day_60: number;
        }>
      > = {};
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
      res.json({
        flags: {
          paid_intro_enabled: paidIntroEnabled(),
          annual_price_enabled: annualPriceEnabled(),
        },
        tests,
        // Cross-link to other internal tools so anyone who lands on this
        // JSON endpoint can find the full admin index and the planner
        // analytics dashboard without grep-hunting through routes.ts.
        links: {
          admin_index: "/admin",
          planner_analytics_html: "/admin/planner-analytics",
          planner_analytics_json: "/api/admin/planner-analytics",
        },
      });
    } catch (err: any) {
      console.error("AB results error:", err?.message);
      res.status(500).json({ error: "Failed to compute results" });
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

    // Resolve variants for this session — drives both the Stripe price and
    // the trial structure passed to Checkout.
    const { sessionId, paidIntroVariant, annualVariant } =
      await getOrAssignVariants(req, res);

    // Variant-specific Stripe prices MUST be configured separately —
    // never silently fall back to the control SKU because that would
    // charge the treatment user the wrong amount on day 0 (e.g. a
    // paid-intro user expects to pay $0.99 today but the recurring
    // STRIPE_MONTHLY_PRICE_ID would charge $14.99).
    const monthlyId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const monthlyPaidIntroId = process.env.STRIPE_MONTHLY_PAID_INTRO_PRICE_ID;
    const annualId = process.env.STRIPE_ANNUAL_PRICE_ID;
    const annual99Id = process.env.STRIPE_ANNUAL_99_PRICE_ID;

    let priceId: string | undefined;
    let trialDays = 14;
    let dueToday = 0;
    let missingEnv: string | null = null;

    if (plan === "monthly") {
      if (paidIntroVariant === "paid_intro") {
        priceId = monthlyPaidIntroId;
        trialDays = 0;
        dueToday = 0.99;
        if (!priceId) missingEnv = "STRIPE_MONTHLY_PAID_INTRO_PRICE_ID";
      } else {
        priceId = monthlyId;
        trialDays = 14;
        dueToday = 0;
        if (!priceId) missingEnv = "STRIPE_MONTHLY_PRICE_ID";
      }
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
      trialDays = 14;
      dueToday = 0;
    }

    if (!priceId || missingEnv) {
      res.status(503).json({
        error: `Stripe ${plan} price ID is not configured for variant "${
          plan === "monthly" ? paidIntroVariant : annualVariant
        }". Set ${missingEnv}.`,
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
        pv: paidIntroVariant,
        av: annualVariant,
      }).toString();

      const checkoutPayload: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/account?${successQuery}`,
        cancel_url: `${baseUrl}/pricing?checkout=cancel`,
        metadata: {
          eh_session_id: sessionId,
          paid_intro_variant: paidIntroVariant,
          annual_variant: annualVariant,
          plan,
        },
      };
      if (trialDays > 0) {
        checkoutPayload.subscription_data = { trial_period_days: trialDays };
      }

      const session = await stripe.checkout.sessions.create(checkoutPayload);

      res.json({
        url: session.url,
        variant: { paid_intro: paidIntroVariant, annual: annualVariant },
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

  // ----- Exit-offer (50% off, 3 months, repeating) -----
  const EXIT_OFFER_COUPON_LOOKUP = "expathub_exit_50off_3mo";
  let cachedExitCouponId: string | null = null;

  async function ensureExitCoupon(stripe: Stripe): Promise<string> {
    if (cachedExitCouponId) return cachedExitCouponId;
    try {
      const list = await stripe.coupons.list({ limit: 100 });
      const found = list.data.find(
        (c) => c.metadata?.lookup_key === EXIT_OFFER_COUPON_LOOKUP,
      );
      if (found) {
        cachedExitCouponId = found.id;
        return found.id;
      }
    } catch {}
    const created = await stripe.coupons.create({
      percent_off: 50,
      duration: "repeating",
      duration_in_months: 3,
      name: "ExpatHub — 50% off for 3 months",
      metadata: { lookup_key: EXIT_OFFER_COUPON_LOOKUP },
    });
    cachedExitCouponId = created.id;
    return created.id;
  }

  let exitOffersTableEnsured = false;
  async function ensureExitOffersTable(pool: pg.Pool): Promise<void> {
    if (exitOffersTableEnsured) return;
    // Base table (kept compatible with any pre-existing rows).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exit_offers (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        subscription_id VARCHAR(255) NOT NULL,
        coupon_id VARCHAR(100),
        shown_at TIMESTAMP DEFAULT NOW(),
        accepted_at TIMESTAMP,
        declined_at TIMESTAMP
      )
    `);
    // Per-period tracking column + index.
    await pool.query(
      `ALTER TABLE exit_offers ADD COLUMN IF NOT EXISTS period_start TIMESTAMP`,
    );
    // Drop the legacy "one row per (user, subscription)" constraint if present
    // so we can record one row per billing period instead.
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'exit_offers_user_id_subscription_id_key'
        ) THEN
          ALTER TABLE exit_offers
            DROP CONSTRAINT exit_offers_user_id_subscription_id_key;
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS exit_offers_user_sub_period_idx
        ON exit_offers (user_id, subscription_id, period_start)
    `);
    exitOffersTableEnsured = true;
  }

  // Returns the Stripe subscription's current period start (Date) and
  // associated customer id. Used to enforce "exit offer once per
  // subscription period". Returns null on any failure so callers can
  // fail closed and avoid showing the exit offer when we cannot
  // determine the billing period.
  //
  // In recent Stripe API versions (2024-12+) `current_period_start` was
  // removed from the top-level Subscription object and now lives on each
  // SubscriptionItem. We read from `items.data[0]` first and fall back
  // to the legacy top-level field for older API versions.
  async function getStripeSubscriptionPeriod(
    stripe: ReturnType<typeof getStripe>,
    subscriptionId: string,
  ): Promise<{ periodStart: Date | null; customerId: string | null }> {
    if (!stripe) return { periodStart: null, customerId: null };
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId =
        typeof sub.customer === "string"
          ? sub.customer
          : sub.customer?.id ?? null;
      const item = sub.items?.data?.[0] as
        | { current_period_start?: number | null }
        | undefined;
      const legacyStart = (sub as unknown as { current_period_start?: number })
        .current_period_start;
      const startSec = item?.current_period_start ?? legacyStart ?? null;
      const periodStart =
        typeof startSec === "number" ? new Date(startSec * 1000) : null;
      return { periodStart, customerId };
    } catch (err: any) {
      console.error(
        "Stripe subscription retrieve failed:",
        err?.message ?? err,
      );
      return { periodStart: null, customerId: null };
    }
  }

  app.get("/api/subscription/exit-offer/eligibility", async (req: Request, res: Response) => {
    const user = await getUserFromToken(req);
    if (!user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userId = user.id.toString();
    const { subscriptionId } = req.query as { subscriptionId?: string };
    if (!subscriptionId) {
      res.status(400).json({ error: "subscriptionId is required" });
      return;
    }
    // Authz: subscriptionId on the request must match the authenticated user's subscription.
    if (!user.stripeSubscriptionId || user.stripeSubscriptionId !== subscriptionId) {
      res.status(403).json({ error: "Subscription does not belong to this user" });
      return;
    }
    const stripe = getStripe();
    // Resolve current billing period from Stripe (single source of truth).
    // If we cannot determine it, fail closed (do not offer).
    const { periodStart, customerId } = await getStripeSubscriptionPeriod(
      stripe,
      subscriptionId,
    );
    if (!periodStart) {
      res.json({ eligible: false, alreadyShown: false, reason: "no_period" });
      return;
    }
    if (
      user.stripeCustomerId &&
      customerId &&
      customerId !== user.stripeCustomerId
    ) {
      res
        .status(403)
        .json({ error: "Subscription customer mismatch" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      // No DB to enforce per-period dedupe; treat as eligible so the offer
      // can still be shown in dev/local environments without DATABASE_URL.
      res.json({
        eligible: true,
        alreadyShown: false,
        periodStart: periodStart.toISOString(),
      });
      return;
    }
    try {
      await ensureExitOffersTable(pool);
      // Once-per-period: any row for this (user, subscription, period_start)
      // — regardless of accept/decline — locks the offer for that period.
      const result = await pool.query(
        `SELECT id, accepted_at, declined_at FROM exit_offers
         WHERE user_id = $1 AND subscription_id = $2 AND period_start = $3
         LIMIT 1`,
        [userId, subscriptionId, periodStart],
      );
      const row = result.rows[0];
      if (!row) {
        res.json({
          eligible: true,
          alreadyShown: false,
          periodStart: periodStart.toISOString(),
        });
        return;
      }
      res.json({
        eligible: false,
        alreadyShown: true,
        accepted: !!row.accepted_at,
        declined: !!row.declined_at,
        periodStart: periodStart.toISOString(),
      });
    } catch (err: any) {
      console.error("Exit offer eligibility error:", err);
      // Fail closed on DB errors as well — better to under-show than to
      // re-show inside the same period.
      res.json({ eligible: false, alreadyShown: false });
    } finally {
      await pool.end();
    }
  });

  app.post("/api/subscription/exit-offer", async (req: Request, res: Response) => {
    const user = await getUserFromToken(req);
    if (!user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userId = user.id.toString();
    const { subscriptionId, action } = req.body as {
      subscriptionId?: string;
      action?: "accept" | "decline" | "shown";
    };
    if (!subscriptionId || !action) {
      res.status(400).json({ error: "subscriptionId and action are required" });
      return;
    }
    // Authz: subscriptionId on the request must match the authenticated user's subscription.
    if (!user.stripeSubscriptionId || user.stripeSubscriptionId !== subscriptionId) {
      res.status(403).json({ error: "Subscription does not belong to this user" });
      return;
    }

    const stripe = getStripe();
    const pool = getPool();

    // Resolve the Stripe subscription period (and verify customer) up-front
    // so every action is bound to a specific billing period.
    const { periodStart, customerId } = await getStripeSubscriptionPeriod(
      stripe,
      subscriptionId,
    );
    if (!periodStart) {
      res
        .status(503)
        .json({ error: "Could not resolve subscription period from Stripe" });
      return;
    }
    if (
      user.stripeCustomerId &&
      customerId &&
      customerId !== user.stripeCustomerId
    ) {
      res
        .status(403)
        .json({ error: "Subscription customer mismatch" });
      return;
    }

    let couponId: string | null = null;

    if (action === "accept") {
      if (!stripe) {
        res.status(503).json({ error: "Stripe is not configured." });
        return;
      }
      try {
        couponId = await ensureExitCoupon(stripe);
        await stripe.subscriptions.update(subscriptionId, {
          discounts: [{ coupon: couponId }],
        });
      } catch (err: any) {
        console.error("Stripe exit-offer apply failed:", err?.message);
        res.status(500).json({ error: err?.message ?? "Failed to apply offer" });
        return;
      }
    }

    if (pool) {
      try {
        await ensureExitOffersTable(pool);
        const now = new Date();
        const acceptedAt = action === "accept" ? now : null;
        const declinedAt = action === "decline" ? now : null;
        // One row per (user, subscription, period_start). Subsequent
        // updates (e.g. shown → accept) stamp the action timestamps.
        await pool.query(
          `INSERT INTO exit_offers
             (user_id, subscription_id, period_start, coupon_id,
              shown_at, accepted_at, declined_at)
           VALUES ($1, $2, $3, $4, NOW(), $5, $6)
           ON CONFLICT (user_id, subscription_id, period_start) DO UPDATE SET
             coupon_id   = COALESCE(EXCLUDED.coupon_id,   exit_offers.coupon_id),
             accepted_at = COALESCE(EXCLUDED.accepted_at, exit_offers.accepted_at),
             declined_at = COALESCE(EXCLUDED.declined_at, exit_offers.declined_at)`,
          [
            userId,
            subscriptionId,
            periodStart,
            couponId,
            acceptedAt,
            declinedAt,
          ],
        );
      } catch (err: any) {
        console.error("Exit offer insert error:", err?.message);
      } finally {
        await pool.end();
      }
    }

    res.json({
      ok: true,
      action,
      couponId,
      periodStart: periodStart.toISOString(),
    });
  });

  app.post("/api/auth/quiz-lead", async (req: Request, res: Response) => {
    const { email, tier, topRegion, regionPreference, score, risks, source } = req.body as {
      email?: string;
      tier?: string;
      topRegion?: string;
      regionPreference?: string;
      score?: number;
      risks?: string[];
      source?: string;
    };

    if (!email || !tier) {
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
        `INSERT INTO quiz_leads (email, tier, top_region, region_preference, score, risks, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [email, tier, topRegion || null, regionPreference || null, score || null, JSON.stringify(risks || []), source || "ios_onboarding"]
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
    const { email, score, tier, risks, answers } = req.body as {
      email?: string;
      score?: number;
      tier?: string;
      risks?: string[];
      answers?: Record<string, string>;
    };

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
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
        `INSERT INTO readiness_leads (email, score, tier, risks, answers)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, score || null, tier || null, JSON.stringify(risks || []), JSON.stringify(answers || {})]
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

  // ── Saved-state summary (for cancellation modal) ──

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

  // ── Reverse trial ──
  // Records the 48h reverse trial server-side so its start time can't be
  // forged. Idempotent: returns the existing trial if one was already
  // recorded. Used by `hasActiveEntitlement` as a fallback when the user
  // has no paid subscription upstream.
  app.post("/api/reverse-trial/start", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.status(500).json({ error: "Database unavailable" }); return; }
    try {
      await ensureReverseTrialTable(pool);
      const r = await pool.query<{ started_at: Date }>(
        `INSERT INTO user_reverse_trials (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING started_at`,
        [userId],
      );
      let startedAt: Date;
      if (r.rows[0]) {
        startedAt = r.rows[0].started_at;
      } else {
        const existing = await pool.query<{ started_at: Date }>(
          `SELECT started_at FROM user_reverse_trials WHERE user_id = $1`,
          [userId],
        );
        startedAt = existing.rows[0].started_at;
      }
      const startedMs = new Date(startedAt).getTime();
      const expiresAt = startedMs + REVERSE_TRIAL_DURATION_MS;
      res.json({
        startedAt: new Date(startedMs).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        active: expiresAt > Date.now(),
      });
    } catch (err) {
      console.error("[reverse-trial] start failed", err);
      res.status(500).json({ error: "Failed to record trial" });
    } finally {
      await pool.end().catch(() => {});
    }
  });

  app.get("/api/reverse-trial", async (req: Request, res: Response) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const pool = getPool();
    if (!pool) { res.json({ active: false }); return; }
    try {
      await ensureReverseTrialTable(pool);
      const r = await pool.query<{ started_at: Date }>(
        `SELECT started_at FROM user_reverse_trials WHERE user_id = $1`,
        [userId],
      );
      if (!r.rows[0]) { res.json({ active: false }); return; }
      const startedMs = new Date(r.rows[0].started_at).getTime();
      const expiresAt = startedMs + REVERSE_TRIAL_DURATION_MS;
      res.json({
        startedAt: new Date(startedMs).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        active: expiresAt > Date.now(),
      });
    } catch {
      res.json({ active: false });
    } finally {
      await pool.end().catch(() => {});
    }
  });

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

const REVERSE_TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;

let reverseTrialTableEnsured = false;
async function ensureReverseTrialTable(pool: pg.Pool): Promise<void> {
  if (reverseTrialTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_reverse_trials (
      user_id VARCHAR(255) PRIMARY KEY,
      started_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  reverseTrialTableEnsured = true;
}

async function hasActiveReverseTrial(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    await ensureReverseTrialTable(pool);
    const r = await pool.query<{ started_at: Date }>(
      `SELECT started_at FROM user_reverse_trials WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return false;
    const startedMs = new Date(row.started_at).getTime();
    return startedMs + REVERSE_TRIAL_DURATION_MS > Date.now();
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
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
    // fall through to reverse-trial check
  }

  // Reverse-trial fallback: a paying subscription was not found upstream,
  // but the user may be inside the 48h reverse-trial window granted on
  // paywall dismissal. The trial is recorded server-side via
  // POST /api/reverse-trial/start so the start time can't be forged.
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) return false;
    return await hasActiveReverseTrial(userId);
  } catch {
    return false;
  }
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
    const def = WORKSHEET_BY_ID[req.params.worksheetId];
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
          const hasThis = ids.includes(req.params.worksheetId);
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
    const { worksheetId } = req.params;
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
