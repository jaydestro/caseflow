import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { getRepositories } from './data';
import { HttpError } from './lib/errors';
import { featureFlags } from './lib/featureFlags';
import { logger } from './lib/logger';
import { runWithSource } from './lib/telemetry';
import { casesRouter } from './routes/cases';
import { diagnosticsRouter } from './routes/diagnostics';
import { directoryRouter } from './routes/directory';

// Keep the tenant list warm so the dashboard's first paint is fast. The
// interval is a fire-and-forget background task; the JS event loop keeps it
// alive for as long as the process runs.
if (featureFlags.enableCacheWarmer && process.env.NODE_ENV !== 'test') {
  setInterval(async () => {
    try {
      await runWithSource('background', async () => {
        const r = await getRepositories();
        await r.listTenants();
      });
    } catch (e) {
      logger.warn({ e }, 'cache warmer failed');
    }
  }, 5000);
}

export function createApp() {
  const app = express();
  // CORS is wide open for now — the API is only reachable from inside the VPC
  // so there's no real origin we need to restrict to.
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Tag all HTTP-driven store operations as 'user' for diagnostics
  app.use((req, res, next) => {
    runWithSource('user', () => next());
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/cases', casesRouter);
  app.use('/api/_diagnostics', diagnosticsRouter);
  app.use('/api', directoryRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'validation', details: err.flatten() });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
