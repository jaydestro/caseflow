import { useEffect, useState } from 'react';
import { api } from '../api';
import { DiagnosticsResponse } from '../types';
import { formatDate } from '../ui';

export function Diagnostics() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function refresh() {
    try {
      const d = await api.diagnostics();
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    if (!autoRefresh) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  async function clear() {
    await api.clearDiagnostics();
    await refresh();
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="loading">Loading diagnostics…</div>;

  const { summary, samples } = data;
  const reversed = [...samples].reverse();
  const usingMemory = samples.some((s) => s.store === 'memory');

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span>Query telemetry</span>
          <div className="toolbar">
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
              <div className="label">Operations</div>
              <div className="value">{summary.count}</div>
              <div className="sub">last {samples.length} samples</div>
            </div>
            <div className="stat">
              <div className="label">Total RU</div>
              <div className="value">{summary.totalRu.toFixed(2)}</div>
              <div className="sub">{usingMemory ? 'in-memory store (no RUs)' : 'across captured ops'}</div>
            </div>
            <div className="stat">
              <div className="label">Avg RU / op</div>
              <div className="value">{summary.avgRu.toFixed(2)}</div>
              <div className="sub">max {summary.maxRu.toFixed(2)}</div>
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
            without a <code>c.id =</code> filter fans out across every logical partition. Each row below
            is one SDK call. Watch the RU charges climb as you click around.
          </p>

          {samples.length === 0 ? (
            <div className="empty">No samples captured yet. Use the app to generate some.</div>
          ) : (
            <table className="queries">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Op</th>
                  <th>Query</th>
                  <th>Items</th>
                  <th>Duration</th>
                  <th>RU</th>
                  <th>Partition</th>
                </tr>
              </thead>
              <tbody>
                {reversed.map((s) => (
                  <tr key={s.id} style={s.crossPartition ? { background: '#fff7f7' } : undefined}>
                    <td>{formatDate(s.at)}</td>
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
    </div>
  );
}
