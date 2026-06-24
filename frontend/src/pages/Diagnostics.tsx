import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { AzureCompareResponse, BeforeAfterComparison, DiagnosticsResponse, QuerySample, TelemetrySnapshot, TrafficResult } from '../types';
import { formatDate } from '../ui';

/** Microsoft Learn references shown next to each metric so students can dig deeper. */
const DOCS = {
  requestUnits: 'https://learn.microsoft.com/azure/cosmos-db/request-units',
  throughput: 'https://learn.microsoft.com/azure/cosmos-db/set-throughput',
  optimizeCost: 'https://learn.microsoft.com/azure/cosmos-db/optimize-cost-reads-writes',
  pointReads: 'https://learn.microsoft.com/azure/cosmos-db/optimize-cost-reads-writes#point-reads',
  partitioning: 'https://learn.microsoft.com/azure/cosmos-db/partitioning-overview',
  query: 'https://learn.microsoft.com/azure/cosmos-db/nosql/how-to-query-container',
  crossPartition:
    'https://learn.microsoft.com/azure/cosmos-db/nosql/how-to-query-container#avoid-cross-partition-queries',
} as const;

/** A small "Learn more ↗" link to Microsoft Learn that opens in a new tab. */
function DocLink({ href, children = 'Learn more' }: { href: string; children?: ReactNode }) {
  return (
    <a className="doc-link" href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}

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
  const [showAzure, setShowAzure] = useState(false);
  const [compare, setCompare] = useState<AzureCompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [snapshot, setSnapshot] = useState<BeforeAfterComparison | null>(null);
  const [baseline, setBaseline] = useState<TelemetrySnapshot | null>(null);
  const [snapshotExists, setSnapshotExists] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [callersPerDay, setCallersPerDay] = useState(10000);
  const [trafficRunning, setTrafficRunning] = useState(false);
  const [traffic, setTraffic] = useState<TrafficResult | null>(null);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState<QuerySample | null>(null);
  const [throughputMode, setThroughputMode] = useState<'provisioned' | 'autoscale'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('caseflow.throughputMode') : null;
    return saved === 'autoscale' ? 'autoscale' : 'provisioned';
  });

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
    api.getSnapshot().then((s) => {
      setSnapshotExists(!!s);
      setBaseline(s);
    });
    if (!autoRefresh) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  async function takeSnapshot() {
    setSnapshotLoading(true);
    try {
      const snap = await api.takeSnapshot('before');
      setBaseline(snap);
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
    setBaseline(null);
  }

  async function clear() {
    await api.clearDiagnostics();
    await refresh();
  }

  async function runTraffic() {
    setTrafficRunning(true);
    setTrafficError(null);
    try {
      const r = await api.generateTraffic({ callersPerDay });
      setTraffic(r);
      await refresh();
    } catch (e) {
      setTrafficError((e as Error).message);
    } finally {
      setTrafficRunning(false);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="loading">Loading diagnostics…</div>;

  const { summary, samples, containerRUs } = data;
  const portalEnabled = Boolean(data.portalEnabled);
  const isAutoscale = throughputMode === 'autoscale';
  const autoscaleMin = Math.max(1, Math.round(containerRUs * 0.1));
  const filtered = hideBackground ? samples.filter((s) => s.source !== 'background') : samples;
  const reversed = [...filtered].reverse();

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            Throughput mode
            <select
              value={throughputMode}
              onChange={(e) => {
                const v = e.target.value === 'autoscale' ? 'autoscale' : 'provisioned';
                setThroughputMode(v);
                try {
                  localStorage.setItem('caseflow.throughputMode', v);
                } catch {
                  /* localStorage unavailable — non-fatal */
                }
              }}
              style={{ fontWeight: 500 }}
            >
              <option value="provisioned">Provisioned (manual)</option>
              <option value="autoscale">Autoscale</option>
            </select>
          </label>
          <span className="hint" style={{ margin: 0, flex: '1 1 320px' }}>
            {isAutoscale
              ? `Cosmos DB scales between ${autoscaleMin.toLocaleString()} and ${containerRUs.toLocaleString()} RU/s automatically and bills each hour on the busiest second (floor 10% of max, at 1.5\u00d7 the provisioned rate). Best for spiky or unpredictable traffic.`
              : `You reserve a fixed ${containerRUs.toLocaleString()} RU/s and pay for all of it every hour, 24/7. Cheapest when utilization is steady and high. Requests above the budget get HTTP 429.`}{' '}
            <DocLink href={DOCS.throughput}>Provisioned vs autoscale</DocLink>
          </span>
        </div>
      </div>

      <div className="card explainer">
        <div className="card-body">
          <h2>How to read this page</h2>
          <p>
            Every time CaseFlow talks to Azure Cosmos DB, this page records what it cost. It's a
            magnifying glass for spotting the <strong>deliberate anti-patterns</strong> baked into
            this sample app — and for proving a fix actually worked.
          </p>
          <p>
            <strong>RU</strong> (Request Unit) is Cosmos DB's unit of work — every read, write, and
            query has an RU price. This container is configured for{' '}
            <strong>{isAutoscale ? 'autoscale' : 'provisioned (manual)'}</strong> throughput
            {isAutoscale ? (
              <>
                {' '}— it scales between <strong>{autoscaleMin.toLocaleString()}</strong> and{' '}
                <strong>{containerRUs.toLocaleString()} RU/s</strong> on demand
              </>
            ) : (
              <>
                {' '}with a fixed budget of <strong>{containerRUs.toLocaleString()} RU/s</strong>
              </>
            )}
            ; cheaper operations let you do more within it.{' '}
            <strong>Lower RU and lower latency are better.</strong>
          </p>
          <p>
            A <strong>point read</strong> (fetch one item by its id + partition key) is the cheapest
            possible operation. A <strong>cross-partition query</strong> fans out to every physical
            partition and costs far more — those are highlighted in red below because they're usually
            the thing worth fixing.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Try it:</strong>
          </p>
          <ol className="steps">
            <li>Click around the app (dashboard, a case, agent workload) to generate traffic.</li>
            <li>Watch the rows appear here — note the RU charge and which ones go cross-partition.</li>
            <li>
              Press <strong>📸 Snapshot baseline</strong>, ask the coding agent to fix an
              anti-pattern, regenerate traffic, then <strong>Compare now</strong> to see the
              before/after.
            </li>
          </ol>
        </div>
      </div>

      <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div className="card-header">
          <span>Before / After comparison</span>
          <div className="toolbar">
            {snapshotExists ? (
              <>
                <button className="btn" onClick={refreshComparison} disabled={snapshotLoading}
                  style={{ background: '#8b5cf6' }}>
                  {snapshotLoading ? '…' : '🔄 Compare now'}
                </button>
                <button className="btn secondary" onClick={takeSnapshot}
                  disabled={snapshotLoading || summary.count === 0}
                  title="Replace the saved baseline with current data">
                  📸 Re-snapshot
                </button>
                <button className="btn secondary" onClick={clearSnapshot}>Clear baseline</button>
              </>
            ) : (
              <button className="btn" onClick={takeSnapshot}
                disabled={snapshotLoading || summary.count === 0}
                style={{ background: '#059669' }}>
                {snapshotLoading ? '…' : '📸 Take baseline'}
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          {!snapshotExists ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Capture the current telemetry as a <strong>“before”</strong> baseline, then apply a fix,
              regenerate traffic, and <strong>Compare now</strong> to see the RU and latency delta.
              {summary.count === 0 && ' Generate some traffic first so there is something to snapshot.'}
            </p>
          ) : !snapshot ? (
            <>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
                Baseline captured. This is your <strong>“before”</strong> starting point. Apply your fix,
                generate traffic, then click <strong>Compare now</strong> to see the delta.
              </p>
              {baseline ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      margin: '0 0 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#7c3aed',
                    }}
                  >
                    <span>⏱ Measuring…</span>
                    <span style={{ fontSize: 18 }}>
                      <ElapsedTimer since={baseline.takenAt} live />
                    </span>
                    <span style={{ fontWeight: 400, color: '#9ca3af' }}>
                      measuring new traffic since baseline — re-run the same load, then{' '}
                      <strong>Compare now</strong> freezes the window
                    </span>
                  </div>
                  <BaselineSummary baseline={baseline} />
                </>
              ) : null}
            </>
          ) : (
            <BeforeAfterPanel comparison={snapshot} />
          )}
        </div>
      </div>

      <div className="advanced-toggle">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showAzure}
            onChange={(e) => setShowAzure(e.target.checked)}
          />
          <span>
            <strong>Advanced: Azure-side verification</strong> — cross-check these numbers against
            the Cosmos account's own Log Analytics logs and open Azure Portal deep links.
          </span>
        </label>
        <span style={{ fontSize: 12 }}>
          {showAzure
            ? portalEnabled
              ? 'These links open the demo deployment\u2019s own Azure resources — you need access to that subscription for them to load.'
              : 'Azure Monitor isn\u2019t configured for this instance, so there\u2019s nothing to cross-check against. The panels below already work on their own.'
            : 'Off by default. Leave this off unless you are presenting and have access to the deployed demo\u2019s Azure subscription.'}
        </span>
      </div>

      {showAzure && (
        <AzureComparePanel
          compare={compare}
          error={compareError}
          loading={compareLoading}
          windowMinutes={windowMinutes}
          onWindowChange={setWindowMinutes}
          onRefresh={refreshCompare}
        />
      )}

      <div className="card">
        <div className="card-header">
          <span>🚦 Simulate traffic</span>
          <div className="toolbar">
            <label style={{ fontSize: 12, color: '#6b7280' }}>
              callers/day{' '}
              <input
                type="number"
                min={1}
                max={1000000}
                step={1000}
                value={callersPerDay}
                onChange={(e) => setCallersPerDay(Number(e.target.value) || 0)}
                style={{ width: 96 }}
              />
            </label>
            <button className="btn" onClick={runTraffic} disabled={trafficRunning}>
              {trafficRunning ? 'Generating…' : 'Generate traffic'}
            </button>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginTop: 0, color: '#6b7280', fontSize: 13 }}>
            Runs a small sample of <strong>simulated</strong> caller sessions in-process (the same
            read-heavy mix a real support desk produces), tags them as user traffic, and{' '}
            <strong>projects the cost</strong> to your target of{' '}
            {callersPerDay.toLocaleString()} callers/day. Watch the telemetry table and stat cards
            below fill in, then check whether the projected RU/s would exceed your throughput budget.
          </p>
          {trafficError && <div className="error">{trafficError}</div>}
          {traffic && (
            <>
              <div className="diag-summary" style={{ marginBottom: 12 }}>
                <div className="stat">
                  <div className="label">Sample run</div>
                  <div className="value">{traffic.opsRun.toLocaleString()} ops</div>
                  <div className="sub">
                    {traffic.sampleCallers} caller sessions · {traffic.crossPartitionOps}{' '}
                    cross-partition · {traffic.errors} errors
                  </div>
                </div>
                <div className="stat">
                  <div className="label">Measured cost</div>
                  <div className="value">{traffic.measuredRu.toLocaleString()} RU</div>
                  <div className="sub">
                    {traffic.avgRuPerOp} RU/op · {traffic.avgRuPerCaller} RU/caller
                  </div>
                </div>
                <div className="stat">
                  <div className="label">Projected at {traffic.callersPerDay.toLocaleString()}/day</div>
                  <div
                    className="value"
                    style={{ color: traffic.exceedsBudget ? '#b91c1c' : '#065f46' }}
                  >
                    {traffic.projectedRuPerSecPeak.toLocaleString()} RU/s peak
                  </div>
                  <div className="sub">
                    ~{traffic.projectedRuPerSecAvg.toLocaleString()} RU/s avg over 24h ·{' '}
                    {traffic.projectedDailyRu.toLocaleString()} RU/day
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>
                {traffic.exceedsBudget ? (
                  <span style={{ color: '#b91c1c' }}>
                    ⚠️ At {traffic.callersPerDay.toLocaleString()} callers/day concentrated into a{' '}
                    {traffic.businessHours}-hour workday, the projected peak of{' '}
                    <strong>{traffic.projectedRuPerSecPeak.toLocaleString()} RU/s</strong> exceeds the{' '}
                    {isAutoscale ? 'autoscale max' : 'provisioned'}{' '}
                    <strong>{traffic.containerRUs.toLocaleString()} RU/s</strong> — callers would hit
                    HTTP 429 throttling.{' '}
                    {isAutoscale
                      ? 'Raise the autoscale max or fix the cross-partition anti-patterns to lower RU/op.'
                      : 'Fixing the cross-partition anti-patterns lowers RU/op and pulls this back under budget.'}
                  </span>
                ) : (
                  <span style={{ color: '#065f46' }}>
                    ✅ The projected peak of{' '}
                    <strong>{traffic.projectedRuPerSecPeak.toLocaleString()} RU/s</strong> fits within
                    the {isAutoscale ? 'autoscale max' : 'provisioned'}{' '}
                    <strong>{traffic.containerRUs.toLocaleString()} RU/s</strong>.{' '}
                    {isAutoscale
                      ? `Because autoscale falls to ${autoscaleMin.toLocaleString()} RU/s when idle, you only pay for the busy hours — a good fit for spiky ${traffic.callersPerDay.toLocaleString()}/day traffic.`
                      : 'Cheaper operations leave even more headroom.'}
                  </span>
                )}{' '}
                <DocLink href={DOCS.optimizeCost}>Optimize request cost</DocLink>
              </p>
            </>
          )}
        </div>
      </div>

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
          </div>
        </div>
        <div className="card-body">
          <div className="diag-summary">
            <div className="stat">
              <div className="label">{isAutoscale ? 'Autoscale max' : 'Provisioned'}</div>
              <div className="value">{containerRUs.toLocaleString()} RU/s</div>
              <div className="sub">
                {isAutoscale
                  ? `scales ${autoscaleMin.toLocaleString()}\u2013${containerRUs.toLocaleString()} RU/s`
                  : 'container throughput budget'}
              </div>
              <p className="hint">
                {isAutoscale ? (
                  <>
                    The ceiling Cosmos DB scales up to. It falls to {autoscaleMin.toLocaleString()} RU/s
                    (10% of max) when idle and bills each hour on the busiest second; exceed the max and
                    you still get HTTP 429s.{' '}
                  </>
                ) : (
                  <>
                    The fixed per-second budget reserved for this container. Every operation draws from
                    it; go over and Cosmos DB rate-limits you with HTTP 429s.{' '}
                  </>
                )}
                <DocLink href={DOCS.throughput}>{isAutoscale ? 'Autoscale throughput' : 'Provisioned throughput'}</DocLink>
              </p>
            </div>
            <div className="stat">
              <div className="label">User RU</div>
              <div className="value">{summary.userRu.toFixed(2)}</div>
              <div className="sub">{summary.userCount} ops from HTTP requests</div>
              <p className="hint">
                Request Units spent on operations <em>you</em> triggered by clicking around the app.
                This is the number a good fix should drive down.{' '}
                <DocLink href={DOCS.requestUnits}>What is an RU?</DocLink>
              </p>
            </div>
            <div className="stat">
              <div className="label">Background RU</div>
              <div className="value" style={{ color: summary.backgroundRu > 0 ? '#d97706' : undefined }}>
                {summary.backgroundRu.toFixed(2)}
              </div>
              <div className="sub">{summary.backgroundCount} ops (cache warmer)</div>
              <p className="hint">
                RU burned by CaseFlow's own cache-warmer loop running on a timer — <em>not</em> your
                clicks. Lots of background RU competing with real traffic is itself an anti-pattern
                worth questioning.{' '}
                <DocLink href={DOCS.requestUnits}>RU considerations</DocLink>
              </p>
            </div>
            <div className="stat">
              <div className="label">Max RU / op</div>
              <div className="value">{summary.maxRu.toFixed(2)}</div>
              <div className="sub">{budgetPct(summary.maxRu, containerRUs)} of budget per call</div>
              <p className="hint">
                The single most expensive operation captured, shown as a share of the provisioned
                budget. A high value here flags one query worth optimizing first.{' '}
                <DocLink href={DOCS.optimizeCost}>Optimize request cost</DocLink>
              </p>
            </div>
            <div className="stat">
              <div className="label">Avg duration</div>
              <div className="value">{summary.avgDurationMs.toFixed(1)} ms</div>
              <div className="sub">per op</div>
              <p className="hint">
                Average wall-clock time per operation. Point reads are usually a few ms;
                cross-partition queries climb as the container grows and fans out wider.{' '}
                <DocLink href={DOCS.query}>How queries run</DocLink>
              </p>
            </div>
            <div className="stat">
              <div className="label">Cross-partition</div>
              <div className="value" style={{ color: summary.crossPartitionCount > 0 ? '#b91c1c' : undefined }}>
                {summary.crossPartitionCount}
              </div>
              <div className="sub">queries that fanned out</div>
              <p className="hint">
                Queries with no partition-key filter, so Cosmos DB had to check every physical
                partition (~2.5+ RU each). The classic cost driver — and the usual thing to fix.{' '}
                <DocLink href={DOCS.crossPartition}>Avoid cross-partition queries</DocLink>
              </p>
            </div>
          </div>

          <div className="legend">
            <div className="legend-group">
              <span className="legend-title">Source — who triggered it</span>
              <span className="item">
                <span className="legend-token">
                  <span className="badge-src user">user</span>
                </span>
                <span>
                  <strong>user request</strong> — caused by something you did in the UI (a click or
                  page load).
                </span>
              </span>
              <span className="item">
                <span className="legend-token">
                  <span className="badge-src bg">bg</span>
                </span>
                <span>
                  <strong>background</strong> — the cache-warmer timer loop running on its own, not
                  from your click.
                </span>
              </span>
            </div>
            <div className="legend-group">
              <span className="legend-title">Operation — how it read Cosmos DB</span>
              <span className="item">
                <span className="legend-token">
                  <span className="tag-pr">point</span>
                </span>
                <span>
                  <strong>point read</strong> — a single-item lookup by id + partition key, the
                  cheapest read Cosmos DB offers (~1 RU).{' '}
                  <DocLink href={DOCS.pointReads}>docs</DocLink>
                </span>
              </span>
              <span className="item">
                <span className="legend-token">
                  <span className="tag-cp">cross-partition</span>
                </span>
                <span>
                  <strong>cross-partition</strong> — a query with no partition-key filter that fanned
                  out to every partition (expensive — the usual fix candidate).{' '}
                  <DocLink href={DOCS.crossPartition}>docs</DocLink>
                </span>
              </span>
            </div>
          </div>

          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 12px' }}>
            Each row is one Cosmos DB operation.{' '}
            <strong>RU</strong> (<a className="doc-link" href={DOCS.requestUnits} target="_blank" rel="noreferrer">Request Unit ↗</a>)
            is what it cost; <strong>% budget</strong> is that cost as a share of the container's
            provisioned throughput if you ran it once per second.{' '}
            <a className="doc-link" href={DOCS.optimizeCost} target="_blank" rel="noreferrer">
              Point reads vs. queries ↗
            </a>
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
                </tr>
              </thead>
              <tbody>
                {reversed.map((s) => (
                  <tr
                    key={s.id}
                    className="query-row"
                    onClick={() => setSelectedSample(s)}
                    title="Click to see what this operation does"
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedSample && (
        <QueryModal
          sample={selectedSample}
          containerRUs={containerRUs}
          onClose={() => setSelectedSample(null)}
        />
      )}
    </div>
  );
}

function opLabel(op: string): string {
  switch (op) {
    case 'point-read':
      return 'Point read';
    case 'upsert':
      return 'Upsert (write)';
    case 'query':
      return 'SQL query';
    default:
      return op;
  }
}

/** Plain-English explanation of what a captured operation does and why it costs what it does. */
function explainQuery(s: QuerySample): { summary: string; why: string; doc: string } {
  if (s.op === 'point-read') {
    return {
      summary: 'Fetches a single item directly by its id and partition key — the query engine is never involved.',
      why: 'This is the cheapest and fastest read Cosmos DB offers (about 1 RU). Always prefer a point read when you already know the id and partition key.',
      doc: DOCS.pointReads,
    };
  }
  if (s.op === 'upsert') {
    return {
      summary: 'Inserts the item if it does not exist yet, or replaces it if it does.',
      why: 'Write cost scales with the item size and how many properties are indexed. Keeping documents lean and trimming the indexing policy lowers the RU charge.',
      doc: DOCS.optimizeCost,
    };
  }
  if (s.crossPartition) {
    return {
      summary: 'Runs a SQL query with no partition-key filter, so Cosmos DB fans the query out to every physical partition.',
      why: 'Cross-partition queries are the classic RU cost driver — every partition is charged and the total grows as the container scales out. Add the partition key to the WHERE clause to turn this into a single-partition query.',
      doc: DOCS.crossPartition,
    };
  }
  return {
    summary: 'Runs a SQL query scoped to a single partition key, so Cosmos DB only reads one partition.',
    why: 'Single-partition queries are far cheaper than cross-partition ones because the query engine only touches one partition\u2019s index.',
    doc: DOCS.query,
  };
}

/** Modal that explains what a single captured Cosmos DB operation does. */
function QueryModal({
  sample,
  containerRUs,
  onClose,
}: {
  sample: QuerySample;
  containerRUs: number;
  onClose: () => void;
}) {
  const info = explainQuery(sample);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className={`op-badge op-${sample.op}`}>{opLabel(sample.op)}</span>
          {sample.crossPartition ? (
            <span className="tag-cp">cross-partition</span>
          ) : (
            <span className="tag-pr">single-partition</span>
          )}
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-summary">{info.summary}</p>

          {sample.query ? (
            <>
              <div className="modal-label">Query sent to Cosmos DB</div>
              <pre className="modal-code">{sample.query}</pre>
            </>
          ) : (
            <>
              <div className="modal-label">SDK call</div>
              <pre className="modal-code">
                {sample.op === 'point-read'
                  ? 'container.item(id, partitionKey).read()'
                  : 'container.items.upsert(item)'}
              </pre>
            </>
          )}

          {sample.parameters && sample.parameters.length > 0 ? (
            <>
              <div className="modal-label">Parameters</div>
              <pre className="modal-code">
                {sample.parameters.map((p) => `${p.name} = ${JSON.stringify(p.value)}`).join('\n')}
              </pre>
            </>
          ) : null}

          {sample.notes ? <p className="modal-note">{sample.notes}</p> : null}

          <div className="modal-stats">
            <div>
              <span className="k">RU charge</span>
              <span className="v">{sample.requestCharge === null ? '\u2014' : sample.requestCharge.toFixed(2)}</span>
            </div>
            <div>
              <span className="k">% of budget</span>
              <span className="v">{budgetPct(sample.requestCharge, containerRUs)}</span>
            </div>
            <div>
              <span className="k">Duration</span>
              <span className="v">{sample.durationMs} ms</span>
            </div>
            <div>
              <span className="k">Items returned</span>
              <span className="v">{sample.itemCount}</span>
            </div>
          </div>

          <div className="modal-why">
            <strong>Why it costs what it does</strong>
            <p>{info.why}</p>
            <DocLink href={info.doc}>Microsoft Learn</DocLink>
          </div>
        </div>
      </div>
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
              <div style={{ margin: '0 0 12px' }}>
                <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 6px' }}>
                  Open the live Azure graphs — these render straight from platform metrics (no log
                  ingestion lag), so the chart is populated the moment it opens and visually exposes the
                  problem:
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    className="btn"
                    href={compare.portalLinks.insights}
                    target="_blank"
                    rel="noreferrer"
                    title="Cosmos DB Insights — curated dashboards: throughput, requests, throttling, latency & availability"
                    style={{ background: '#2563eb' }}
                  >
                    📊 Cosmos Insights
                  </a>
                  <a
                    className="btn"
                    href={compare.portalLinks.ruConsumption}
                    target="_blank"
                    rel="noreferrer"
                    title="Metrics Explorer: Total Request Units + Total Requests over the last hour"
                    style={{ background: '#7c3aed' }}
                  >
                    📈 RU consumption
                  </a>
                  <a
                    className="btn"
                    href={compare.portalLinks.ruByOperation}
                    target="_blank"
                    rel="noreferrer"
                    title="RU split by operation type — the cross-partition Query series towering over Read/Upsert is the proof"
                    style={{ background: '#7c3aed' }}
                  >
                    🔍 RU by operation
                  </a>
                  <a
                    className="btn"
                    href={compare.portalLinks.hotPartition}
                    target="_blank"
                    rel="noreferrer"
                    title="Normalized RU consumption (max %) per partition key range — one partition pinned near 100% reveals a hot partition"
                    style={{ background: '#b45309' }}
                  >
                    🔥 Hot partitions
                  </a>
                  <a
                    className="btn"
                    href={compare.portalLinks.throttled}
                    target="_blank"
                    rel="noreferrer"
                    title="Requests by status code — a rising 429 series means the workload is being throttled"
                    style={{ background: '#b91c1c' }}
                  >
                    🚦 Throttled (429s)
                  </a>
                </div>
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
    } else {
      map.set(k, {
        op: o.op,
        localCount: 0,
        azureCount: o.count,
        localTotalRu: 0,
        azureTotalRu: o.totalRu,
        localAvgRu: 0,
        azureAvgRu: o.avgRu,
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

/* ---------- Captured baseline summary (shown before you click Compare) ---------- */
/** Format a millisecond duration as M:SS (or H:MM:SS past an hour). */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Shows elapsed time from `since`. When `live` is set it ticks every second;
 * otherwise (a frozen window) it shows `until - since`.
 */
function ElapsedTimer({ since, until, live }: { since: string; until?: string; live?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const start = new Date(since).getTime();
  const end = until ? new Date(until).getTime() : now;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(end - start)}</span>;
}

function BaselineSummary({ baseline }: { baseline: TelemetrySnapshot }) {
  const s = baseline.summary;
  return (
    <div>
      <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
        Baseline <strong>“{baseline.label}”</strong> · {baseline.sampleCount} operations · captured{' '}
        {formatDate(baseline.takenAt)}
      </p>
      <div className="diag-summary">
        <div className="stat">
          <div className="label">Operations</div>
          <div className="value">{s.count}</div>
          <div className="sub">in the baseline window</div>
        </div>
        <div className="stat">
          <div className="label">Total RU</div>
          <div className="value">{s.totalRu.toFixed(2)}</div>
          <div className="sub">sum of request charge</div>
        </div>
        <div className="stat">
          <div className="label">Avg RU/op</div>
          <div className="value">{s.avgRu.toFixed(2)}</div>
          <div className="sub">mean cost per operation</div>
        </div>
        <div className="stat">
          <div className="label">Max RU</div>
          <div className="value">{s.maxRu.toFixed(2)}</div>
          <div className="sub">most expensive single op</div>
        </div>
        <div className="stat">
          <div className="label">Cross-partition</div>
          <div className="value" style={{ color: s.crossPartitionCount > 0 ? '#b91c1c' : undefined }}>
            {s.crossPartitionCount}
          </div>
          <div className="sub">fan-out queries</div>
        </div>
        <div className="stat">
          <div className="label">Avg latency</div>
          <div className="value">{s.avgDurationMs.toFixed(0)} ms</div>
          <div className="sub">mean duration</div>
        </div>
      </div>
      {baseline.byOp.length > 0 ? (
        <table className="queries" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Count</th>
              <th>Total RU</th>
              <th>Avg RU</th>
              <th>Max RU</th>
              <th>Avg ms</th>
            </tr>
          </thead>
          <tbody>
            {baseline.byOp.map((o) => (
              <tr key={o.op}>
                <td><code>{o.op}</code></td>
                <td>{o.count}</td>
                <td>{o.totalRu.toFixed(2)}</td>
                <td>{o.avgRu.toFixed(2)}</td>
                <td>{o.maxRu.toFixed(2)}</td>
                <td>{o.avgDurationMs.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
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
        After: <strong>{after.sampleCount} ops since baseline</strong>
        &nbsp;·&nbsp;
        <span style={{ color: '#7c3aed', fontWeight: 600 }}>
          ⏱ window <ElapsedTimer since={before.takenAt} until={after.takenAt} />
        </span>
      </p>
      <table className="data-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Metric</th>
            <th style={{ textAlign: 'right' }}>Before</th>
            <th style={{ textAlign: 'right' }}>After</th>
            <th style={{ textAlign: 'right' }} title="Δ (delta) = After − Before, the absolute change">Δ change</th>
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

      <p className="table-caption">
        <span><span className="key">Before</span> / <span className="key">After</span> — the metric before vs. after your fix.</span>
        <span><span className="key">Δ change</span> = After − Before (the raw difference).</span>
        <span><span className="key">%</span> — the same change as a percentage.</span>
        <span><span className="down">Green</span> means it got better (lower RU, fewer cross-partition queries); <span className="up">red</span> means it got worse.</span>
      </p>

      {before.byOp.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Per-operation RU breakdown</h4>
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Operation</th>
                <th style={{ textAlign: 'right' }}>Before avg RU</th>
                <th style={{ textAlign: 'right' }}>After avg RU</th>
                <th style={{ textAlign: 'right' }} title="Δ (delta) = After − Before, the absolute change">Δ change</th>
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
