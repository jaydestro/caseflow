// Builds Azure Portal deep links to the Log Analytics "Logs" blade with a
// KQL query pre-populated. Format matches the "Share → Link" URL that the
// portal generates: base64(gzip(query)) embedded in the hash fragment.

import { gzipSync } from 'node:zlib';
import { config } from './config';

const PORTAL = 'https://portal.azure.com';

function workspaceArmId(): string {
  const a = config.azure;
  return `/subscriptions/${a.subscriptionId}/resourceGroups/${a.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${a.logAnalyticsWorkspaceName}`;
}

function cosmosArmId(): string {
  const a = config.azure;
  return `/subscriptions/${a.subscriptionId}/resourceGroups/${a.resourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${a.cosmosAccount}`;
}

/** base64(gzip(text)) — the encoding the Logs blade expects for the `q` segment. */
function encodeQuery(kql: string): string {
  return gzipSync(Buffer.from(kql, 'utf8')).toString('base64');
}

/**
 * Build a Logs blade URL scoped to our Log Analytics workspace with the
 * given KQL and an absolute ISO-8601 timespan.
 *
 * URL shape matches the portal's own "Share → Link to query" output:
 *   #@<tenant>/blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView
 *     /resourceId/<encodedWorkspaceArmId>
 *     /source/LogsBlade.AnalyticsShareLinkToQuery
 *     /q/<encodedBase64GzippedKQL>
 *     /timespan/<encodedISO8601Interval>
 *
 * The older `Microsoft_Azure_Monitoring_Logs/LogsBlade` route still resolves
 * but the React Logs view ignores the `q` segment under it, leaving the
 * user on the empty "Logs Hub" pane.
 */
export function buildLogsLink(kql: string, startIso: string, endIso: string): string {
  if (!config.azure.logAnalyticsWorkspaceName || !config.azure.subscriptionId) return '';
  const tenant = config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
  const resource = encodeURIComponent(workspaceArmId());
  const q = encodeURIComponent(encodeQuery(kql));
  const timespan = encodeURIComponent(`${startIso}/${endIso}`);
  return `${PORTAL}/#${tenant}blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView/resourceId/${resource}/source/LogsBlade.AnalyticsShareLinkToQuery/q/${q}/timespan/${timespan}`;
}

/** Metrics blade for the Cosmos account — useful for "Total Request Units" chart. */
export function cosmosMetricsLink(): string {
  if (!config.azure.subscriptionId) return '';
  const tenant = config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
  return `${PORTAL}/#${tenant}resource${cosmosArmId()}/metrics`;
}

/**
 * Cosmos DB Insights blade — pre-built dashboards showing throughput,
 * requests, storage, availability, and latency charts. Near-zero lag
 * (platform metrics), so visuals are always populated even when the
 * CDBDataPlaneRequests KQL returns empty (ingestion lag).
 */
export function cosmosInsightsLink(): string {
  if (!config.azure.subscriptionId) return '';
  const tenant = config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
  return `${PORTAL}/#${tenant}resource${cosmosArmId()}/cosmosDb`;
}

/**
 * Metrics blade pre-configured to show "Total Request Units" and
 * "Total Requests" over the last hour with 1-minute grain.
 * Uses the portal's metric chart JSON encoding.
 */
export function cosmosMetricsChartLink(): string {
  if (!config.azure.subscriptionId) return '';
  const tenant = config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
  const rid = cosmosArmId();
  const chart = JSON.stringify({
    v2charts: [{
      metrics: [
        { resourceMetadata: { id: rid }, name: 'TotalRequestUnits', aggregationType: 1, metricVisualization: { displayName: 'Total Request Units' } },
        { resourceMetadata: { id: rid }, name: 'TotalRequests', aggregationType: 1, metricVisualization: { displayName: 'Total Requests' } },
      ],
      title: 'RU Consumption',
      visualization: { chartType: 2 },
    }],
  });
  return `${PORTAL}/#${tenant}blade/Microsoft_Azure_MonitoringMetrics/Metrics.ReactView/Referer/MetricsExplorer/ResourceId/${encodeURIComponent(rid)}/TimeContext/${encodeURIComponent(JSON.stringify({ relative: { duration: 3600000 } }))}/Charts/${encodeURIComponent(chart)}`;
}

/** Deep link to the LAW resource (for the panel header "open workspace"). */
export function workspaceLink(): string {
  if (!config.azure.logAnalyticsWorkspaceName || !config.azure.subscriptionId) return '';
  const tenant = config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
  return `${PORTAL}/#${tenant}resource${workspaceArmId()}/overview`;
}

// ---- Pre-canned KQL builders ---------------------------------------------

const dbFilter = () =>
  `| where DatabaseName == "${config.cosmos.database}" and CollectionName == "${config.cosmos.container}"`;

/**
 * KQL for one specific request: a tight time window around the SDK-recorded
 * timestamp. The viewer can scan the rows and match RequestCharge / DurationMs
 * to the in-app sample.
 */
export function kqlForSample(opts: { atIso: string; op?: string }): string {
  return [
    'CDBDataPlaneRequests',
    `| where TimeGenerated between (datetime(${opts.atIso}) - 30s .. datetime(${opts.atIso}) + 30s)`,
    dbFilter(),
    '| project TimeGenerated, OperationName, RequestCharge, DurationMs, StatusCode, RequestResourceType, ActivityId',
    '| order by TimeGenerated asc',
  ].join('\n');
}

/** RU/s timechart for the whole window — what the demo audience sees as "the graph". */
export function kqlRuTimechart(windowMinutes: number, op?: string): string {
  const bin = windowMinutes <= 5 ? '10s' : windowMinutes <= 15 ? '30s' : '1m';
  const opFilter = op ? `| where OperationName == "${op}"` : '';
  return [
    'CDBDataPlaneRequests',
    `| where TimeGenerated > ago(${windowMinutes}m)`,
    dbFilter(),
    opFilter,
    `| summarize TotalRU = sum(RequestCharge), Requests = count() by bin(TimeGenerated, ${bin}), OperationName`,
    '| render timechart',
  ].filter(Boolean).join('\n');
}

/** Per-operation breakdown for the window — matches the cross-check table. */
export function kqlOpBreakdown(windowMinutes: number): string {
  return [
    'CDBDataPlaneRequests',
    `| where TimeGenerated > ago(${windowMinutes}m)`,
    dbFilter(),
    '| summarize Requests = count(), TotalRU = sum(RequestCharge), AvgRU = avg(RequestCharge), MaxRU = max(RequestCharge), p95Ms = percentile(DurationMs, 95) by OperationName',
    '| order by TotalRU desc',
  ].join('\n');
}

/** Build start/end ISO strings for a window ending now. */
export function windowIso(windowMinutes: number): { startIso: string; endIso: string } {
  const end = new Date();
  const start = new Date(end.getTime() - windowMinutes * 60_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
