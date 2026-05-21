import { useEffect, useState } from 'react';
import { api } from '../api';
import { AzureCompareResponse, BeforeAfterComparison, DiagnosticsResponse } from '../types';
import { formatDate } from '../ui';

/** Show what % of provisioned RU/s a single operation would consume if sustained 1/s */
function budgetPct(ru: number | null, containerRUs: number): string {
  if (ru === null || ru === 0 || containerRUs === 0) return '—';
  const pct = (ru / containerRUs) * 100;
  if (pct < 0.01) return '<0.01%';
  return pct.toFixed(2) + '%';
}

export function Diagnostics() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hideBackground, setHideBackground] = useState(true);
  const [compare, setCompare] = useState<AzureCompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [snapshot, setSnapshot] = useState<BeforeAfterComparison | null>(null);
  const [snapshotExists, setSnapshotExists] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  async function refresh() {
    try {
      const d = await api.diagnostics();
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshCompare() {
    setCompareLoading(true);
    try {
      const c = await api.azureCompare(windowMinutes);
      setCompare(c);
      setCompareError(null);
    } catch (e) {
      setCompareError((e as Error).message);
    } finally {
      setCompareLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    api.getSnapshot().then((s) => setSnapshotExists(!!s));
    if (!autoRefresh) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  async function takeSnapshot() {
    setSnapshotLoading(true);
    try {
      await api.takeSnapshot('before');
      setSnapshotExists(true);
      setSnapshot(null);
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function refreshComparison() {
    setSnapshotLoading(true);
    try {
      const c = await api.compareSnapshot();
      setSnapshot(c);
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function clearSnapshot() {
    await api.clearSnapshot();
    setSnapshotExists(false);
    setSnapshot(null);
  }

  async function clear() {
    await api.clearDiagnostics();
    await refresh();
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="loading">Loading diagnostics…</div>;

  const { summary, samples, containerRUs } = data;
  const filtered = hideBackground ? samples.filter((s) => s.source !== 'background') : samples;
  const reversed = [...filtered].reverse();

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span>Query telemetry</span>
          <div className="toolbar">
            <label style={{ fontSize: 12, color: '#6b7280' }}>
              <input
                type="checkbox"
                checked={hideBackground}
                onChange={(e) => setHideBackground(e.target.checked)}
              />{' '}
              hide background
            </label>
            <label style={{ fontSize: 12, color: '#6b7280' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />{' '}
              auto-refresh (2s)
            </label>
            <button className="btn secondary" onClick={refresh}>Refresh</button>
            <button className="btn" onClick={clear}>Clear</button>
            <button
              className="btn"
              onClick={takeSnapshot}
              disabled={snapshotLoading || summary.count === 0}
              style={{ background: snapshotExists ? '#d97706' : '#059669' }}
              title={snapshotExists ? 'Replace the saved baseline with current data' : 'Snapshot current state as the "before" baseline'}
            >
              {snapshotLoading ? '…' : snapshotExists ? '📸 Re-snapshot' : '📸 Snapshot baseline'}
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="diag-summary">
            <div className="stat">
              <div className="label">Provisioned</div>
              <div className="value">{containerRUs.toLocaleString()} RU/s</div>
              <div className="sub">container throughput budget</div>
            </div>
            <div className="stat">
              <div className="label">User RU</div>
              <div className="value">{summary.userRu.toFixed(2)}</div>
              <div className="sub">{summary.userCount} ops from HTTP requests</div>
            </div>
            <div className="stat">
              <div className="label">Background RU</div>
              <div className="value" style={{ color: summary.backgroundRu > 0 ? '#d97706' : undefined }}>
                {summary.backgroundRu.toFixed(2)}
              </div>
              <div className="sub">{summary.backgroundCount} ops (cache warmer)</div>
            </div>
            <div className="stat">
              <div className="label">Max RU / op</div>
              <div className="value">{summary.maxRu.toFixed(2)}</div>
              <div className="sub">{budgetPct(summary.maxRu, containerRUs)} of budget per call</div>
            </div>
            <div className="stat">
              <div className="label">Avg duration</div>
              <div className="value">{summary.avgDurationMs.toFixed(1)} ms</div>
              <div className="sub">per op</div>
            </div>
            <div className="stat">
              <div className="label">Cross-partition</div>
              <div className="value" style={{ color: summary.crossPartitionCount > 0 ? '#b91c1c' : undefined }}>
                {summary.crossPartitionCount}
              </div>
              <div className="sub">queries that fanned out</div>
            </div>
          </div>

          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 12px' }}>
            The single <code>entities</code> container is partitioned on <code>/id</code>, so any query
            without a <code>c.id =</code> filter fans out across every logical partition. The
            <strong> % budget</strong> column shows what fraction of your {containerRUs.toLocaleString()} RU/s
            each operation consumes — the higher it is, the fewer concurrent calls your throughput can sustain.
          </p>

          {filtered.length === 0 ? (
            <div className="empty">
              {hideBackground
                ? 'No user operations captured yet. Use the app to generate some.'
                : 'No samples captured yet. Use the app to generate some.'}
            </div>
          ) : (
            <table className="queries">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Op</th>
                  <th>Query</th>
                  <th>Items</th>
                  <th>Duration</th>
                  <th>RU</th>
                  <th>% budget</th>
                  <th>Partition</th>
                  <th>Logs</th>
                </tr>
              </thead>
              <tbody>
                {reversed.map((s) => (
                  <tr
                    key={s.id}
                    style={
                      s.crossPartition
                        ? { background: '#fff7f7' }
                        : s.source === 'background'
                          ? { background: '#fffbeb' }
                          : undefined
                    }
                  >
                    <td>{formatDate(s.at)}</td>
                    <td>
                      {s.source === 'background' ? (
                        <span style={{ color: '#d97706', fontSize: 11 }}>bg</span>
                      ) : (
                        <span style={{ color: '#059669', fontSize: 11 }}>user</span>
                      )}
                    </td>
                    <td>{s.op}</td>
                    <td>
                      <code>{s.query ?? ''}</code>
                      {s.notes ? (
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{s.notes}</div>
                      ) : null}
                    </td>
                    <td>{s.itemCount}</td>
                    <td>{s.durationMs} ms</td>
                    <td>{s.requestCharge === null ? '—' : s.requestCharge.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {budgetPct(s.requestCharge, containerRUs)}
                    </td>
                    <td>
                      {s.crossPartition ? (
                        <span className="tag-cp">cross-partition</span>
                      ) : (
                        <span className="tag-pr">point</span>
                      )}
                    </td>
                    <td>
                      {s.portalLink ? (
                        <a
                          href={s.portalLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Open this request in Azure Log Analytics (±30s window)"
                          style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}
                        >
                          ↗ Azure
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {snapshotExists && (
        <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="card-header">
            <span>Before / After comparison</span>
            <div className="toolbar">
              <button className="btn" onClick={refreshComparison} disabled={snapshotLoading}
                style={{ background: '#8b5cf6' }}>
                {snapshotLoading ? '…' : '🔄 Compare now'}
              </button>
              <button className="btn secondary" onClick={clearSnapshot}>Clear baseline</button>
            </div>
          </div>
          <div className="card-body">
            {!snapshot ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>
                Baseline saved. Apply your fix, generate traffic, then click <strong>Compare now</strong>.
              </p>
            ) : (
              <BeforeAfterPanel comparison={snapshot} />
            )}
          </div>
        </div>
      )}

      <AzureComparePanel
        compare={compare}
        error={compareError}
        loading={compareLoading}
        windowMinutes={windowMinutes}
        onWindowChange={setWindowMinutes}
        onRefresh={refreshCompare}
      />
    </div>
  );
}

function AzureComparePanel({
  compare,
  error,
  loading,
  windowMinutes,
  onWindowChange,
  onRefresh,
}: {
  compare: AzureCompareResponse | null;
  error: string | null;
  loading: boolean;
  windowMinutes: number;
  onWindowChange: (n: number) => void;
  onRefresh: () => void;
}) {
  const ops = mergeOps(compare);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span>Azure-side cross-check (Log Analytics)</span>
        <div className="toolbar">
          <label style={{ fontSize: 12, color: '#6b7280' }}>
            window
            <select
              value={windowMinutes}
              onChange={(e) => onWindowChange(Number(e.target.value))}
              style={{ marginLeft: 6 }}
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>
          <button className="btn secondary" onClick={onRefresh} disabled={loading}>
            {loading ? 'Querying…' : 'Query Azure'}
          </button>
        </div>
      </div>
      <div className="card-body">
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 12px' }}>
          The local <strong>Query telemetry</strong> table above reads the SDK's <code>x-ms-request-charge</code>{' '}
          response header. This panel runs a KQL query against{' '}
          <code>CDBDataPlaneRequests</code> in Log Analytics (resource-specific diagnostic logs from the
          Cosmos account) for the same window and shows the service's own record of those requests. If the two
          columns agree, you can trust the in-app numbers.
        </p>

        {error ? <div className="error" style={{ marginBottom: 12 }}>{error}</div> : null}

        {!compare ? (
          <div className="empty">Click <strong>Query Azure</strong> to pull live aggregates from Log Analytics.</div>
        ) : !compare.enabled ? (
          <div className="empty">{compare.note}</div>
        ) : (
          <>
            <div className="diag-summary">
              <div className="stat">
                <div className="label">Local count</div>
                <div className="value">{compare.local.count}</div>
                <div className="sub">in-process buffer, last {compare.windowMinutes}m</div>
              </div>
              <div className="stat">
                <div className="label">Azure count</div>
                <div className="value">{compare.azure?.count ?? 0}</div>
                <div className="sub">CDBDataPlaneRequests rows</div>
              </div>
              <div className="stat">
                <div className="label">Local RU</div>
                <div className="value">{compare.local.totalRu.toFixed(2)}</div>
                <div className="sub">sum of SDK requestCharge</div>
              </div>
              <div className="stat">
                <div className="label">Azure RU</div>
                <div className="value">{(compare.azure?.totalRu ?? 0).toFixed(2)}</div>
                <div className="sub">sum of service RequestCharge</div>
              </div>
              <div className="stat">
                <div className="label">RU delta</div>
                <div
                  className="value"
                  style={{ color: ruDeltaColor(compare.local.totalRu, compare.azure?.totalRu ?? 0) }}
                >
                  {deltaPct(compare.local.totalRu, compare.azure?.totalRu ?? 0)}
                </div>
                <div className="sub">|local − azure| / azure</div>
              </div>
              <div className="stat">
                <div className="label">Ingestion lag</div>
                <div className="value">{compare.lagSeconds == null ? '—' : `${compare.lagSeconds}s`}</div>
                <div className="sub">now − max(TimeGenerated)</div>
              </div>
            </div>

            <p style={{ color: '#6b7280', fontSize: 12, margin: '8px 0' }}>{compare.note}</p>
            {compare.cosmosAccount ? (
              <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 12px' }}>
                Workspace <code>{compare.workspaceId}</code> · Account <code>{compare.cosmosAccount}</code>
              </p>
            ) : null}

            {compare.portalLinks ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
                <a
                  className="btn"
                  href={compare.portalLinks.insights}
                  target="_blank"
                  rel="noreferrer"
                  title="Cosmos DB Insights — pre-built dashboards with throughput, latency & availability charts (always populated)"
                  style={{ background: '#2563eb' }}
                >
                  📊 Cosmos Insights (charts)
                </a>
                <a
                  className="btn"
                  href={compare.portalLinks.metricsChart}
                  target="_blank"
                  rel="noreferrer"
                  title="Metrics Explorer pre-loaded with Total Request Units + Total Requests over the last hour"
                  style={{ background: '#7c3aed' }}
                >
                  📈 RU Metrics Chart
                </a>
                <a
                  className="btn secondary"
                  href={compare.portalLinks.ruTimechart}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Log Analytics with a RU/s timechart KQL (may be empty if ingestion is lagging)"
                >
                  ↗ KQL timechart
                </a>
                <a
                  className="btn secondary"
                  href={compare.portalLinks.opBreakdown}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Log Analytics with the per-operation breakdown KQL"
                >
                  ↗ Op breakdown KQL
                </a>
                <a
                  className="btn secondary"
                  href={compare.portalLinks.metrics}
                  target="_blank"
                  rel="noreferrer"
                  title="Open the Cosmos account's Metrics blade (all available metrics)"
                >
                  ↗ Metrics blade
                </a>
              </div>
            ) : null}

            {ops.length === 0 ? (
              <div className="empty">No operations in window on either side.</div>
            ) : (
              <table className="queries">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Local count</th>
                    <th>Azure count</th>
                    <th>Local total RU</th>
                    <th>Azure total RU</th>
                    <th>Δ RU</th>
                    <th>Local avg RU</th>
                    <th>Azure avg RU</th>
                    <th>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((row) => (
                    <tr key={row.op}>
                      <td><code>{row.op}</code></td>
                      <td>{row.localCount}</td>
                      <td>{row.azureCount}</td>
                      <td>{row.localTotalRu.toFixed(2)}</td>
                      <td>{row.azureTotalRu.toFixed(2)}</td>
                      <td style={{ color: ruDeltaColor(row.localTotalRu, row.azureTotalRu) }}>
                        {deltaPct(row.localTotalRu, row.azureTotalRu)}
                      </td>
                      <td>{row.localAvgRu.toFixed(2)}</td>
                      <td>{row.azureAvgRu.toFixed(2)}</td>
                      <td>
                        {row.azurePortalLink ? (
                          <a
                            href={row.azurePortalLink}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}
                            title={`Open RU timechart in Azure for ${row.op}`}
                          >
                            ↗ chart
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface MergedOpRow {
  op: string;
  localCount: number;
  azureCount: number;
  localTotalRu: number;
  azureTotalRu: number;
  localAvgRu: number;
  azureAvgRu: number;
  azurePortalLink?: string;
}

/**
 * Local telemetry tags ops as 'point-read' | 'upsert' | 'query'; Azure logs
 * them as 'Read' | 'Upsert' | 'Query' | 'Create' | etc. Normalize both to a
 * canonical lowercase name so the rows line up.
 */
function mergeOps(c: AzureCompareResponse | null): MergedOpRow[] {
  if (!c) return [];
  const norm = (s: string) => s.toLowerCase().replace(/[_-]/g, '');
  const map = new Map<string, MergedOpRow>();
  for (const o of c.local.byOp) {
    const k = norm(o.op);
    map.set(k, {
      op: o.op,
      localCount: o.count,
      azureCount: 0,
      localTotalRu: o.totalRu,
      azureTotalRu: 0,
      localAvgRu: o.avgRu,
      azureAvgRu: 0,
    });
  }
  for (const o of c.azure?.byOp ?? []) {
    const k = norm(o.op);
    const existing = map.get(k);
    if (existing) {
      existing.azureCount = o.count;
      existing.azureTotalRu = o.totalRu;
      existing.azureAvgRu = o.avgRu;
      existing.azurePortalLink = o.portalLink;
    } else {
      map.set(k, {
        op: o.op,
        localCount: 0,
        azureCount: o.count,
        localTotalRu: 0,
        azureTotalRu: o.totalRu,
        localAvgRu: 0,
        azureAvgRu: o.avgRu,
        azurePortalLink: o.portalLink,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.azureTotalRu + b.localTotalRu - (a.azureTotalRu + a.localTotalRu));
}

function deltaPct(local: number, azure: number): string {
  if (azure === 0 && local === 0) return '—';
  if (azure === 0) return '∞';
  const d = ((local - azure) / azure) * 100;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
}

function ruDeltaColor(local: number, azure: number): string | undefined {
  if (azure === 0 && local === 0) return undefined;
  if (azure === 0) return '#b91c1c';
  const d = Math.abs(local - azure) / azure;
  if (d <= 0.05) return '#059669';
  if (d <= 0.2) return '#d97706';
  return '#b91c1c';
}

/* ---------- Before / After comparison panel ---------- */
function BeforeAfterPanel({ comparison }: { comparison: BeforeAfterComparison }) {
  const { before, after, delta } = comparison;
  const rows: Array<{ label: string; field: keyof typeof delta; unit: string; lowerIsBetter: boolean }> = [
    { label: 'Total RU', field: 'totalRu', unit: ' RU', lowerIsBetter: true },
    { label: 'Avg RU/op', field: 'avgRu', unit: ' RU', lowerIsBetter: true },
    { label: 'Max RU', field: 'maxRu', unit: ' RU', lowerIsBetter: true },
    { label: 'Avg duration', field: 'avgDurationMs', unit: ' ms', lowerIsBetter: true },
    { label: 'Cross-partition', field: 'crossPartitionCount', unit: '', lowerIsBetter: true },
    { label: 'Operations', field: 'count', unit: '', lowerIsBetter: false },
  ];

  function changeColor(change: number, lowerIsBetter: boolean): string {
    if (change === 0) return '#6b7280';
    const improved = lowerIsBetter ? change < 0 : change > 0;
    return improved ? '#059669' : '#dc2626';
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
        Baseline: <strong>{before.label || 'before'}</strong> ({before.sampleCount} ops, {new Date(before.takenAt).toLocaleTimeString()})
        &nbsp;→&nbsp;
        Current: <strong>{after.sampleCount} ops</strong>
      </p>
      <table className="data-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Metric</th>
            <th style={{ textAlign: 'right' }}>Before</th>
            <th style={{ textAlign: 'right' }}>After</th>
            <th style={{ textAlign: 'right' }}>Δ</th>
            <th style={{ textAlign: 'right' }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = delta[r.field];
            return (
              <tr key={r.field}>
                <td>{r.label}</td>
                <td style={{ textAlign: 'right' }}>{d.before.toLocaleString()}{r.unit}</td>
                <td style={{ textAlign: 'right' }}>{d.after.toLocaleString()}{r.unit}</td>
                <td style={{ textAlign: 'right', color: changeColor(d.change, r.lowerIsBetter), fontWeight: 600 }}>
                  {d.change > 0 ? '+' : ''}{d.change.toLocaleString()}{r.unit}
                </td>
                <td style={{ textAlign: 'right', color: changeColor(d.change, r.lowerIsBetter), fontWeight: 600 }}>
                  {d.pct !== null ? `${d.pct > 0 ? '+' : ''}${d.pct}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {before.byOp.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Per-operation RU breakdown</h4>
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Operation</th>
                <th style={{ textAlign: 'right' }}>Before avg RU</th>
                <th style={{ textAlign: 'right' }}>After avg RU</th>
                <th style={{ textAlign: 'right' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {before.byOp.map((bOp) => {
                const aOp = after.byOp.find((a) => a.op === bOp.op);
                const afterAvg = aOp?.avgRu ?? 0;
                const change = afterAvg - bOp.avgRu;
                return (
                  <tr key={bOp.op}>
                    <td><code>{bOp.op}</code></td>
                    <td style={{ textAlign: 'right' }}>{bOp.avgRu.toFixed(2)} RU</td>
                    <td style={{ textAlign: 'right' }}>{aOp ? afterAvg.toFixed(2) + ' RU' : '—'}</td>
                    <td style={{ textAlign: 'right', color: changeColor(change, true), fontWeight: 600 }}>
                      {aOp ? `${change > 0 ? '+' : ''}${change.toFixed(2)} RU` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
