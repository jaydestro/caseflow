import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useTenant } from '../TenantContext';
import { Agent, SupportCase } from '../types';
import { PriorityBadge, StatusBadge, formatDate } from '../ui';

// Naive "beginner" page: pull every case for the tenant and filter
// client-side by agent + in-progress status. Works fine in dev; will
// haunt the team once tenants get big.
export function AgentWorkload() {
  const { id } = useParams<{ id: string }>();
  const { current } = useTenant();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantId = current?.id ?? '';

  useEffect(() => {
    if (!tenantId || !id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listAgents(tenantId),
      api.listCases({ tenantId }),
    ])
      .then(([agents, all]) => {
        setAgent(agents.find((a) => a.id === id) ?? null);
        setCases(all.items.filter((c) => c.assignedAgentId === id));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantId, id]);

  const inProgress = useMemo(
    () => cases.filter((c) => c.status === 'open' || c.status === 'pending'),
    [cases],
  );

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byPriority = new Map<string, number>();
    for (const c of inProgress) {
      byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      byPriority.set(c.priority, (byPriority.get(c.priority) ?? 0) + 1);
    }
    return { byStatus, byPriority };
  }, [inProgress]);

  if (!current) return <div className="empty">Pick a tenant to get started.</div>;
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!agent) return <div className="empty">Agent not found in this tenant.</div>;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/" className="btn secondary">← Dashboard</Link>
      </div>
      <div
        className="card"
        style={{ padding: '14px 16px', marginBottom: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <strong style={{ fontSize: 18 }}>{agent.name}</strong>
          <span style={{ color: '#6b7280', fontSize: 13 }}>{agent.email}</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Stat label="In progress" value={inProgress.length} />
          <Stat label="Open" value={counts.byStatus.get('open') ?? 0} />
          <Stat label="Pending" value={counts.byStatus.get('pending') ?? 0} />
          <Stat label="Urgent" value={counts.byPriority.get('urgent') ?? 0} />
          <Stat label="High" value={counts.byPriority.get('high') ?? 0} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>In-progress cases</span>
        </div>
        {inProgress.length === 0 ? (
          <div className="empty">Nothing in progress for {agent.name}.</div>
        ) : (
          <table className="cases">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {inProgress.map((c) => (
                <tr key={c.id} className="row">
                  <td>
                    <Link to={`/cases/${c.id}`}>{c.subject}</Link>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td>{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <strong style={{ fontSize: 20 }}>{value}</strong>
    </div>
  );
}
