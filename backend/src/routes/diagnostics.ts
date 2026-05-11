import { Router } from 'express';
import { telemetry } from '../lib/telemetry';

export const diagnosticsRouter = Router();

diagnosticsRouter.get('/queries', (_req, res) => {
  res.json({
    summary: telemetry.summary(),
    samples: telemetry.list(),
  });
});

diagnosticsRouter.post('/clear', (_req, res) => {
  telemetry.clear();
  res.json({ ok: true });
});
