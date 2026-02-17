import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import Stripe from "stripe";

const AUTH_API_URL = process.env.EXPO_PUBLIC_AUTH_API_URL || "https://www.expathub.world";

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
  app.all("/api/auth", async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const authHeader = req.headers.authorization;
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method === "POST" && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const upstream = await fetch(`${AUTH_API_URL}/api/auth`, fetchOptions);
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

  const httpServer = createServer(app);
  return httpServer;
}
