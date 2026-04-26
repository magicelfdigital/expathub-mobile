import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import Stripe from "stripe";
import pg from "pg";
import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";

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

export async function registerRoutes(app: Express): Promise<Server> {
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
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-type") res.setHeader(key, value);
      });
      res.send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Entitlements service unavailable" });
    }
  });

  app.post("/api/analytics", async (req: Request, res: Response) => {
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

    const monthlyId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const annualId = process.env.STRIPE_ANNUAL_PRICE_ID;
    const priceId = plan === "monthly" ? monthlyId : annualId;
    if (!priceId) {
      res.status(503).json({
        error: `Stripe ${plan} price ID is not configured. Set ${plan === "monthly" ? "STRIPE_MONTHLY_PRICE_ID" : "STRIPE_ANNUAL_PRICE_ID"}.`,
      });
      return;
    }

    try {
      const baseUrl = getBaseUrl(req);
      const value = plan === "monthly" ? 14.99 : 89;

      const successQuery = new URLSearchParams({
        subscribed: "true",
        plan,
        value: String(value),
        currency: "USD",
      }).toString();

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: 14,
        },
        success_url: `${baseUrl}/account?${successQuery}`,
        cancel_url: `${baseUrl}/pricing?checkout=cancel`,
      });

      res.json({ url: session.url });
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

  const httpServer = createServer(app);
  return httpServer;
}
