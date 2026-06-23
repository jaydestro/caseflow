// Builds Azure Portal deep links to *graph* blades for the Cosmos account —
// Cosmos DB Insights and pre-loaded Metrics Explorer charts. These use the
// platform metrics pipeline (near-zero ingestion lag), so the charts are
// always populated and visually expose the problem the moment they open —
// unlike Log Analytics KQL deep links, which depend on CDBDataPlaneRequests
// diagnostic-log ingestion (1–5 min lag) and frequently render empty.

import { config } from './config';

const PORTAL = 'https://portal.azure.com';

/**
 * Metric chart aggregation enum used by the Metrics ReactView `Charts` JSON.
 *   Sum = 1, Min = 2, Max = 3, Avg = 4
 */
const AGG = { sum: 1, min: 2, max: 3, avg: 4 } as const;

/** Line chart = 2 (the visualization the demo wants for time series). */
const LINE_CHART = 2;

function cosmosArmId(): string {
  const a = config.azure;
  return `/subscriptions/${a.subscriptionId}/resourceGroups/${a.resourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${a.cosmosAccount}`;
}

function tenantPrefix(): string {
  return config.azure.tenantId ? `@${config.azure.tenantId}/` : '';
}

interface ChartMetric {
  /** Cosmos DB platform metric name, e.g. 'TotalRequestUnits'. */
  name: string;
  /** Aggregation enum — see AGG. */
  aggregationType: number;
  /** Friendly series label shown in the chart legend. */
  displayName: string;
}

interface ChartSpec {
  title: string;
  metrics: ChartMetric[];
  /** Optional dimension split (e.g. 'OperationType') so the chart segments by it. */
  grouping?: { dimension: string; top?: number };
}

/**
 * Build a Metrics Explorer deep link pre-loaded with one or more charts.
 * Mirrors the portal's own "Share → Copy link to chart" serialization:
 * a `v2charts` JSON document URL-encoded into the Metrics.ReactView route.
 */
function metricsChartLink(charts: ChartSpec[], durationMs = 3_600_000): string {
  if (!config.azure.subscriptionId) return '';
  const rid = cosmosArmId();
  const v2charts = charts.map((c) => ({
    metrics: c.metrics.map((m) => ({
      resourceMetadata: { id: rid },
      name: m.name,
      aggregationType: m.aggregationType,
      metricVisualization: { displayName: m.displayName },
    })),
    title: c.title,
    visualization: { chartType: LINE_CHART },
    ...(c.grouping
      ? { grouping: { dimension: c.grouping.dimension, sort: 2, top: c.grouping.top ?? 10 } }
      : {}),
  }));
  const chart = JSON.stringify({ v2charts });
  const timeContext = JSON.stringify({ relative: { duration: durationMs } });
  return (
    `${PORTAL}/#${tenantPrefix()}blade/Microsoft_Azure_MonitoringMetrics/Metrics.ReactView` +
    `/Referer/MetricsExplorer/ResourceId/${encodeURIComponent(rid)}` +
    `/TimeContext/${encodeURIComponent(timeContext)}` +
    `/Charts/${encodeURIComponent(chart)}`
  );
}

/**
 * Cosmos DB Insights blade — curated, pre-built dashboards (throughput,
 * requests, throttling, storage, latency, availability). Platform metrics,
 * always populated. The best single "show me everything" graph link.
 */
export function cosmosInsightsLink(): string {
  if (!config.azure.subscriptionId) return '';
  return `${PORTAL}/#${tenantPrefix()}resource${cosmosArmId()}/cosmosDb`;
}

/**
 * RU consumption over the last hour — Total Request Units + Total Requests.
 * The headline "how much am I spending" graph.
 */
export function cosmosMetricsChartLink(): string {
  return metricsChartLink([
    {
      title: 'RU consumption (last hour)',
      metrics: [
        { name: 'TotalRequestUnits', aggregationType: AGG.sum, displayName: 'Total Request Units' },
        { name: 'TotalRequests', aggregationType: AGG.sum, displayName: 'Total Requests' },
      ],
    },
  ]);
}

/**
 * RU split by operation type — exposes which operations burn the RU budget.
 * A cross-partition `Query` series towering over `Read`/`Upsert` is the visual
 * proof that the expensive queries are the problem.
 */
export function cosmosRuByOperationChartLink(): string {
  return metricsChartLink([
    {
      title: 'Request Units by operation type',
      metrics: [{ name: 'TotalRequestUnits', aggregationType: AGG.sum, displayName: 'Total Request Units' }],
      grouping: { dimension: 'OperationType' },
    },
  ]);
}

/**
 * Normalized RU consumption (max) split by partition key range — exposes hot
 * partitions. One partition pinned near 100% while others idle is the classic
 * hot-partition / throttling signature.
 */
export function cosmosHotPartitionChartLink(): string {
  return metricsChartLink([
    {
      title: 'Normalized RU consumption by partition (max %)',
      metrics: [
        { name: 'NormalizedRUConsumption', aggregationType: AGG.max, displayName: 'Normalized RU Consumption (max %)' },
      ],
      grouping: { dimension: 'PartitionKeyRangeId' },
    },
  ]);
}

/**
 * Total requests split by HTTP status code — exposes throttling. A rising
 * `429` series means the workload is exceeding provisioned throughput.
 */
export function cosmosThrottledRequestsChartLink(): string {
  return metricsChartLink([
    {
      title: 'Requests by status code (429 = throttled)',
      metrics: [{ name: 'TotalRequests', aggregationType: AGG.sum, displayName: 'Total Requests' }],
      grouping: { dimension: 'StatusCode' },
    },
  ]);
}
