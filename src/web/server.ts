import http, { type Server } from 'http';
import path from 'path';
import { readFileSync } from 'fs';
import type { Bot, WebhookReplyEnvelope } from 'grammy';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config';
import { logger } from '../core/logger';
import { db } from '../core/db';
import { BUS_EVENTS, onBus } from '../core/bus';
import type { SsePayload } from '../core/bus';
import { aiEnabled } from '../ai/provider';
import { verifyTelegramSecret } from '../security';
import { mintStreamToken, verifyStreamToken, STREAM_TOKEN_TTL_SEC } from '../security/stream-token';
import { SlidingWindowRateLimiter } from '../security/rate-limiter';
import { getBrand } from '../services/settings.service';
import { createApiRouter } from './routes';

/**
 * Web server: static dashboard, /healthz, Telegram webhook, SSE live stream
 * (key-gated via short-lived tokens) and the /api/v1 REST API (docs/API.md).
 * Boots with bot = null in web-only mode (no BOT_TOKEN) — the dashboard and
 * API keep working.
 */

const HEARTBEAT_MS = 25_000;

/** Read the real version from package.json (never hardcoded). */
const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
})();

/** Per-IP request budget for the whole API surface (read+write). */
const webApiLimiter = new SlidingWindowRateLimiter(240, 60_000);

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function sseHandler(req: Request, res: Response): void {
  res.status(200).set({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'hello', payload: { ts: new Date().toISOString() } })}\n\n`);

  const unsubscribe = onBus<SsePayload>(BUS_EVENTS.SSE, (p) => {
    try {
      res.write(`data: ${JSON.stringify(p)}\n\n`);
    } catch {
      // client gone — the 'close' handler cleans up
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // client gone — the 'close' handler cleans up
    }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
}

export function createWebServer(bot: Bot | null): Express {
  const app = express();

  // Railway/Fly proxies terminate TLS — trust exactly one hop so req.ip is
  // the real client IP (rate limiting keys on it).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // inline theme bootstrap + glass styles
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: config.web.corsOrigins.includes('*') ? true : [...config.web.corsOrigins],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Static dashboard — public/index.html is owned by the dashboard agent (2-d).
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  // ── health probe ───────────────────────────────────────────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    void (async (): Promise<void> => {
      let dbOk = false;
      try {
        await db.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch {
        dbOk = false;
      }
      const brand = await getBrand().catch(() => ({ name: config.brand.name, tagline: config.brand.tagline, footer: config.brand.footer }));
      res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        db: dbOk,
        bot: bot !== null,
        ai: aiEnabled(),
        version: APP_VERSION,
        brand: brand.name,
      });
    })();
  });

  // ── Telegram webhook (fail-closed secret check) ────────────────────────────
  if (bot) {
    app.post('/webhook/telegram', (req: Request, res: Response) => {
      if (!verifyTelegramSecret(req.headers)) {
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      bot
        .handleUpdate(req.body as unknown as Parameters<Bot['handleUpdate']>[0], res as unknown as WebhookReplyEnvelope)
        .then(() => {
          if (!res.headersSent) res.sendStatus(200);
        })
        .catch((err: unknown) => {
          logger.warn({ err }, '📨 webhook update handling failed');
          if (!res.headersSent) res.sendStatus(200);
        });
    });
  }

  // ── SSE live stream — key-gated via short-lived tokens (EventSource cannot
  // send headers: the dashboard exchanges its key for a 5-min token first).
  app.get('/api/v1/stream', (req: Request, res: Response) => {
    if (!verifyStreamToken(req.query.token)) {
      res.status(401).json({ ok: false, error: 'unauthorized', hint: `obtain a token via POST /api/v1/stream-token (valid ${STREAM_TOKEN_TTL_SEC}s)` });
      return;
    }
    sseHandler(req, res);
  });

  // ── REST API (docs/API.md) — per-IP request budget on the whole surface ────
  app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
    const gate = webApiLimiter.hit(`api:${clientIp(req)}`);
    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSec));
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }
    next();
  });
  app.use('/api/v1', createApiRouter());

  // ── 404 + error middleware ────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // express.json body-parse errors carry status 400 — keep them client-facing.
    const status = (err as { status?: number; statusCode?: number }).status === 400 ? 400 : 500;
    const code = status === 400 ? 'invalid_json' : 'internal';
    logger.error({ err, path: req.path, method: req.method }, '💥 web request failed');
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json({ ok: false, error: code });
  });

  return app;
}

export async function startWebServer(app: Express): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', (err) => reject(err));
    server.listen(config.port, '0.0.0.0', () => {
      logger.info({ port: config.port }, `🌐 web server listening on 0.0.0.0:${config.port}`);
      resolve(server);
    });
  });
}
