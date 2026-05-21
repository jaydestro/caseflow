// Thin wrapper around @azure/monitor-query-logs for the Diagnostics page's
// "Azure-side" cross-check panel. We query the Log Analytics workspace that
// receives the Cosmos account's diagnostic logs (resource-specific schema —
// table is `CDBDataPlaneRequests`) and aggregate by operation so the UI can
// compare what the SDK *told us* about a request vs. what the service
// *actually logged* on its side.

import { DefaultAzureCredential } from '@azure/identity';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query-logs';
import { config } from './config';
import { logger } from './logger';

export interface AzureOpAggregate {
  op: string;
  count: number;
  totalRu: number;
  avgRu: number;
  maxRu: number;
  p95DurationMs: number;
}

export interface AzureSummary {
  count: number;
  totalRu: number;
  avgRu: number;
  maxRu: number;
  latestRecordAt: string | null;
  byOp: AzureOpAggregate[];
}

let client: LogsQueryClient | null = null;
function getClient(): LogsQueryClient {
  if (!client) client = new LogsQueryClient(new DefaultAzureCredential());
  return client;
}

export function isAzureMonitorConfigured(): boolean {
  return Boolean(
    config.azure.logAnalyticsWorkspaceId &&
      config.azure.subscriptionId &&
      config.azure.resourceGroup &&
      config.azure.cosmosAccount,
  );
}

/**
 * Query the LAW for the last N minutes of Cosmos data-plane requests and
 * return aggregates that mirror the in-process telemetry buffer's shape.
 *
 * NOTE: Log Analytics ingestion has 1–5 minutes of lag. The returned
 * `latestRecordAt` lets the UI show users how stale the Azure-side view is.
 */
export async function queryCosmosUsage(windowMinutes: number): Promise<AzureSummary> {
  const dbName = config.cosmos.database;
  const collName = config.cosmos.container;

  const kql = `
    CDBDataPlaneRequests
    | where TimeGenerated > ago(${windowMinutes}m)
    | where DatabaseName == "${dbName}" and CollectionName == "${collName}"
    | summarize
        count_ = count(),
        totalRU = sum(RequestCharge),
        avgRU = avg(RequestCharge),
        maxRU = max(RequestCharge),
        p95DurationMs = percentile(DurationMs, 95),
        latestAt = max(TimeGenerated)
      by OperationName
    | order by totalRU desc
  `;

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - windowMinutes * 60_000);
  const res = await getClient().queryWorkspace(
    config.azure.logAnalyticsWorkspaceId,
    kql,
    { startTime, endTime },
  );

  if (res.status === LogsQueryResultStatus.PartialFailure) {
    logger.warn({ err: res.partialError }, 'azure monitor partial failure');
  }
  const tables = 'tables' in res ? res.tables : res.partialTables;
  if (!tables || tables.length === 0) {
    return { count: 0, totalRu: 0, avgRu: 0, maxRu: 0, latestRecordAt: null, byOp: [] };
  }

  const t = tables[0];
  const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i]));
  const byOp: AzureOpAggregate[] = t.rows.map((r) => ({
    op: String(r[idx.OperationName] ?? ''),
    count: Number(r[idx.count_] ?? 0),
    totalRu: round(Number(r[idx.totalRU] ?? 0)),
    avgRu: round(Number(r[idx.avgRU] ?? 0)),
    maxRu: round(Number(r[idx.maxRU] ?? 0)),
    p95DurationMs: round(Number(r[idx.p95DurationMs] ?? 0)),
  }));

  let count = 0;
  let totalRu = 0;
  let maxRu = 0;
  let latest: Date | null = null;
  for (let i = 0; i < t.rows.length; i++) {
    const r = t.rows[i];
    count += Number(r[idx.count_] ?? 0);
    totalRu += Number(r[idx.totalRU] ?? 0);
    const m = Number(r[idx.maxRU] ?? 0);
    if (m > maxRu) maxRu = m;
    const at = r[idx.latestAt];
    if (at) {
      const d = at instanceof Date ? at : new Date(String(at));
      if (!latest || d > latest) latest = d;
    }
  }

  return {
    count,
    totalRu: round(totalRu),
    avgRu: count ? round(totalRu / count) : 0,
    maxRu: round(maxRu),
    latestRecordAt: latest ? latest.toISOString() : null,
    byOp,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
