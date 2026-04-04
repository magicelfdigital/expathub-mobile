import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import Stripe from "stripe";
import pg from "pg";

const AUTH_API_URL = "https://www.expathub.website";
const PASSWORD_API_URL = "https://www.expathub.website";

async function getUserIdFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const upstream = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
    });
    if (!upstream.ok) return null;
    const data = await upstream.json() as { user?: { id?: string | number } };
    return data?.user?.id?.toString() ?? null;
  } catch {
    return null;
  }
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

    const { priceId } = req.body as { priceId?: string };
    if (!priceId) {
      res.status(400).json({ error: "priceId is required" });
      return;
    }

    try {
      const baseUrl = getBaseUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/?checkout=success`,
        cancel_url: `${baseUrl}/?checkout=cancel`,
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

    const { customerId } = req.body as { customerId?: string };
    if (!customerId) {
      res.status(400).json({ error: "customerId is required" });
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
