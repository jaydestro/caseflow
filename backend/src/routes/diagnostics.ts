import { Router } from 'express';
import { getRepositories } from '../data';
import { config } from '../lib/config';
import { telemetry } from '../lib/telemetry';
import { isAzureMonitorConfigured, queryCosmosUsage } from '../lib/azureMonitor';
import { generateTraffic } from '../services/trafficGenerator';
import {
  cosmosHotPartitionChartLink,
  cosmosInsightsLink,
  cosmosMetricsChartLink,
  cosmosRuByOperationChartLink,
  cosmosThrottledRequestsChartLink,
} from '../lib/portalLinks';
import { logger } from '../lib/logger';

export const diagnosticsRouter = Router();

diagnosticsRouter.get('/queries', (_req, res) => {
  res.json({
    summary: telemetry.summary(),
    samples: telemetry.list(),
    containerRUs: config.containerRUs,
    portalEnabled: isAzureMonitorConfigured(),
  });
});

diagnosticsRouter.post('/clear', (_req, res) => {
  telemetry.clear();
  res.json({ ok: true });
});

// ---- Simulated traffic generator -----------------------------------------
//
// Runs a representative sample of caller sessions in-process (tagged as `user`
// traffic) so the Diagnostics page fills with real RU/latency data on demand,
// then projects the cost to a target daily caller volume. Intended as a
// teaching aid — clearly labelled in the UI as simulated load.
diagnosticsRouter.post('/traffic', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const callersPerDay = clampInt(body.callersPerDay, 10000, 1, 1_000_000);
    // Keep the sample well under the telemetry ring buffer (200) so the RU
    // measurement stays accurate, and bounded so the emulator isn't hammered.
    const sampleCallers = clampInt(body.sampleCallers, 40, 1, 60);
    const businessHours = clampInt(body.businessHours, 8, 1, 24);

    const repos = await getRepositories();
    const result = await generateTraffic(repos, config.containerRUs, {
      callersPerDay,
      sampleCallers,
      businessHours,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// ---- Baseline snapshot for before/after comparison -----------------------

diagnosticsRouter.post('/snapshot', (req, res) => {
  const body = req.body as { label?: unknown };
  const label = typeof body.label === 'string' ? body.label : undefined;
  const snap = telemetry.takeSnapshot(label);
  res.json(snap);
});

diagnosticsRouter.get('/snapshot', (_req, res) => {
  const snap = telemetry.getSnapshot();
  if (!snap) return res.json(null);
  res.json(snap);
});

diagnosticsRouter.delete('/snapshot', (_req, res) => {
  telemetry.clearSnapshot();
  res.json({ ok: true });
});

diagnosticsRouter.get('/snapshot/compare', (_req, res) => {
  const comparison = telemetry.compareToSnapshot();
  if (!comparison) return res.json(null);
  res.json(comparison);
});

/**
 * Cross-check: same window viewed by (a) the in-process telemetry buffer and
 * (b) Azure Monitor / Log Analytics on the Cosmos account. Lets a viewer
 * trust the in-app RU/latency numbers by comparing them against what the
 * service itself recorded.
 */
diagnosticsRouter.get('/azure-compare', async (req, res, next) => {
  try {
    const windowMinutes = Math.min(60, Math.max(1, Number(req.query.windowMinutes ?? 15)));
    const local = telemetry.summarizeWindow(windowMinutes);

    if (!isAzureMonitorConfigured()) {
      return res.json({
        enabled: false,
        windowMinutes,
        local,
        azure: null,
        note: 'Azure Monitor not configured. Set AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, COSMOS_ACCOUNT_NAME, and LOG_ANALYTICS_WORKSPACE_ID in backend/.env.',
      });
    }

    const azure = await queryCosmosUsage(windowMinutes);
    const lagSeconds = azure.latestRecordAt
      ? Math.max(0, Math.round((Date.now() - Date.parse(azure.latestRecordAt)) / 1000))
      : null;

    // Azure Portal *graph* deep links. These open Metrics Explorer / Cosmos
    // Insights charts that render immediately from platform metrics (no log
    // ingestion lag) and visually expose the problem — RU spend, which
    // operation type burns it, hot partitions, and throttling (429s).
    const portalLinks = {
      insights: cosmosInsightsLink(),
      ruConsumption: cosmosMetricsChartLink(),
      ruByOperation: cosmosRuByOperationChartLink(),
      hotPartition: cosmosHotPartitionChartLink(),
      throttled: cosmosThrottledRequestsChartLink(),
    };

    res.json({
      enabled: true,
      windowMinutes,
      local,
      azure,
      lagSeconds,
      workspaceId: config.azure.logAnalyticsWorkspaceId,
      cosmosAccount: config.azure.cosmosAccount,
      portalLinks,
      note:
        azure.count === 0
          ? 'No CDBDataPlaneRequests records in window yet. Log Analytics ingestion typically lags 1–5 minutes after the request occurs.'
          : 'Azure-side aggregates come from the CDBDataPlaneRequests table in Log Analytics (resource-specific diagnostic logs).',
    });
  } catch (e) {
    logger.warn({ err: e }, 'azure-compare failed');
    next(e);
  }
});

/** Parse a numeric request field, falling back to a default and clamping to a range. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
