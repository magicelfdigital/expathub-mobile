import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawnSync } from "child_process";
import { startAuthPromptBackfillSchedule } from "./authPromptBackfillScheduler";
import { startQuizSaveBackfillSchedule } from "./quizSaveBackfillScheduler";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

/**
 * Expo manifest middleware. Mobile clients (Expo Go) hit `/` or `/manifest`
 * with the `expo-platform: ios|android` header — those are routed to the
 * Expo manifest. All other requests fall through to the web app.
 */
function configureExpoManifest(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path !== "/" && req.path !== "/manifest") return next();
    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return serveExpoManifest(platform, res);
    }
    return next();
  });

  // Continue to serve legacy Expo Web static assets (so older Expo Go manifest
  // asset URLs keep resolving). `index: false` prevents the legacy
  // static-build/index.html from intercepting `/` — the React web SPA owns
  // every non-/api route now.
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(
    express.static(path.resolve(process.cwd(), "static-build"), {
      index: false,
      fallthrough: true,
    }),
  );
}

const VITE_DEV_TARGET =
  process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";

/**
 * Dev: proxy all non-API requests to the Vite dev server. Vite handles HMR,
 * routing, and serves the React SPA.
 */
function configureWebDevProxy(app: express.Application) {
  const proxy = createProxyMiddleware({
    target: VITE_DEV_TARGET,
    changeOrigin: true,
    ws: true,
    logger: console,
    pathFilter: (pathname) => !pathname.startsWith("/api"),
  });
  app.use(proxy);
  log(`Web dev proxy → ${VITE_DEV_TARGET}`);
}

/**
 * Build the React+Vite web bundle synchronously. Used as a runtime fallback
 * when `web/dist/` is missing in production (e.g. when the Replit Cloud Run
 * deploy build step has not yet been updated to include `vite build`).
 *
 * Adds ~5-10s to first cold start after deploy, then disk-cached for the
 * lifetime of the container.
 */
function buildWebBundle(distDir: string): boolean {
  log(`Building web bundle into ${distDir} (one-time)…`);
  const result = spawnSync(
    "npx",
    ["vite", "build", "--config", "web/vite.config.ts"],
    { cwd: process.cwd(), stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    log(`ERROR: vite build failed with exit code ${result.status}`);
    return false;
  }
  return fs.existsSync(distDir);
}

/**
 * Prod: serve the built Vite bundle from web/dist with an SPA fallback.
 * If the bundle is missing (deploy build did not run vite build), build it
 * once at startup as a fallback so the deployed site always serves.
 */
function configureWebStatic(app: express.Application) {
  const distDir = path.resolve(process.cwd(), "web", "dist");
  if (!fs.existsSync(distDir)) {
    log(
      `web/dist not found at ${distDir} — attempting runtime build fallback.`,
    );
    if (!buildWebBundle(distDir)) {
      log(
        "ERROR: web/dist build failed — SPA routes will not be served. " +
          "Update the Replit deploy build to run " +
          "`npx vite build --config web/vite.config.ts`.",
      );
      return;
    }
  }
  app.use(express.static(distDir, { index: false }));

  const indexPath = path.join(distDir, "index.html");
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    if (!fs.existsSync(indexPath)) return next();
    res.sendFile(indexPath);
  });
  log(`Web SPA serving from ${distDir}`);
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoManifest(app);

  const server = await registerRoutes(app);

  if (process.env.NODE_ENV === "production") {
    configureWebStatic(app);
  } else {
    configureWebDevProxy(app);
  }

  setupErrorHandler(app);

  // Daily PostHog → local `auth_prompt_events` reconciliation. Keeps the
  // local table aligned with PostHog without operator intervention so a
  // transient live-write failure doesn't leave the dashboard stale.
  // Skipped in tests (NODE_ENV=test) and when PostHog credentials are
  // missing — the scheduler logs and exits cleanly in either case.
  if (process.env.NODE_ENV !== "test") {
    startAuthPromptBackfillSchedule({
      getPool: () => {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) return null;
        return new pg.Pool({ connectionString: dbUrl });
      },
    });
    // Same cadence + same shape for the quiz-save prompt backfill (task
    // #116). Persists every run's outcome to `quiz_save_backfill_runs` so
    // the admin dashboard can show "Last backfill: <time> · inserted N /
    // skipped N" without depending on in-process memory across deploys.
    // Gated on PostHog credentials being present so we don't spam the log
    // every 24h with a config error when the env vars are missing (the
    // scheduler itself defends against this at run-time, but skipping the
    // bootstrap entirely keeps the workflow log clean in dev / preview
    // environments where PostHog isn't wired up).
    if (
      process.env.POSTHOG_PROJECT_ID &&
      process.env.POSTHOG_PERSONAL_API_KEY
    ) {
      startQuizSaveBackfillSchedule({
        getPool: () => {
          const dbUrl = process.env.DATABASE_URL;
          if (!dbUrl) return null;
          return new pg.Pool({ connectionString: dbUrl });
        },
      });
    } else {
      log(
        "[quiz-save-backfill] scheduler not started — POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY not set",
      );
    }
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
