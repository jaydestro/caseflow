import { Router } from 'express';
import { config } from '../lib/config';
import { telemetry } from '../lib/telemetry';
import { isAzureMonitorConfigured, queryCosmosUsage } from '../lib/azureMonitor';
import {
  buildLogsLink,
  cosmosInsightsLink,
  cosmosMetricsChartLink,
  cosmosMetricsLink,
  kqlForSample,
  kqlOpBreakdown,
  kqlRuTimechart,
  windowIso,
  workspaceLink,
} from '../lib/portalLinks';
import { logger } from '../lib/logger';

export const diagnosticsRouter = Router();

diagnosticsRouter.get('/queries', (_req, res) => {
  const samples = telemetry.list();
  const portalEnabled = isAzureMonitorConfigured() && Boolean(config.azure.logAnalyticsWorkspaceName);
  // Per-sample deep link: open Log Analytics scoped to a ±30s window around
  // the SDK timestamp so a viewer can match RequestCharge/Duration row-for-row.
  const enriched = samples.map((s) => {
    if (!portalEnabled) return s;
    const at = new Date(s.at);
    const start = new Date(at.getTime() - 30_000).toISOString();
    const end = new Date(at.getTime() + 30_000).toISOString();
    return { ...s, portalLink: buildLogsLink(kqlForSample({ atIso: s.at }), start, end) };
  });
  res.json({
    summary: telemetry.summary(),
    samples: enriched,
    containerRUs: config.containerRUs,
    portalEnabled,
  });
});

diagnosticsRouter.post('/clear', (_req, res) => {
  telemetry.clear();
  res.json({ ok: true });
});

// ---- Baseline snapshot for before/after comparison -----------------------

diagnosticsRouter.post('/snapshot', (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label : undefined;
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

    // Build Azure Portal deep links so the viewer can open the exact same
    // KQL in the Logs blade (and see the rendered timechart) for any claim
    // we make in the panel.
    const { startIso, endIso } = windowIso(windowMinutes);
    const portalLinks = {
      workspace: workspaceLink(),
      metrics: cosmosMetricsLink(),
      metricsChart: cosmosMetricsChartLink(),
      insights: cosmosInsightsLink(),
      ruTimechart: buildLogsLink(kqlRuTimechart(windowMinutes), startIso, endIso),
      opBreakdown: buildLogsLink(kqlOpBreakdown(windowMinutes), startIso, endIso),
    };
    const azureByOp = azure.byOp.map((row) => ({
      ...row,
      portalLink: buildLogsLink(kqlRuTimechart(windowMinutes, row.op), startIso, endIso),
    }));

    res.json({
      enabled: true,
      windowMinutes,
      local,
      azure: { ...azure, byOp: azureByOp },
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
