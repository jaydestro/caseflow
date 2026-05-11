import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { HttpError } from './lib/errors';
import { logger } from './lib/logger';
import { casesRouter } from './routes/cases';
import { diagnosticsRouter } from './routes/diagnostics';
import { directoryRouter } from './routes/directory';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

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
