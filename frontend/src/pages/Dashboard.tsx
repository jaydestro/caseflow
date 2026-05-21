import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTenant } from '../TenantContext';
import { Agent, Customer, SupportCase, WorkloadRow } from '../types';
import { PriorityBadge, StatusBadge, formatDate } from '../ui';
import { TenantLogo } from '../tenantLogos';

export function Dashboard() {
  const { current } = useTenant();
  const navigate = useNavigate();
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantId = current?.id ?? '';

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listCases({
        tenantId,
        status: status ? [status] : undefined,
        priority: priority ? [priority] : undefined,
        agentId: agentId || undefined,
        customerId: customerId || undefined,
      }),
      api.listAgents(tenantId),
      api.listCustomers(tenantId),
      api.agentWorkload(tenantId),
    ])
      .then(([cs, ag, cu, wl]) => {
        setCases(cs.items);
        setAgents(ag);
        setCustomers(cu);
        setWorkload(wl);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantId, status, priority, agentId, customerId]);

  const agentName = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : 'Unassigned');
  }, [agents]);
  const customerName = useMemo(() => {
    const m = new Map(customers.map((c) => [c.id, c.company]));
    return (id: string) => m.get(id) ?? '—';
  }, [customers]);

  if (!current) return <div className="empty">Pick a tenant to get started.</div>;

  return (
    <div className="detail-grid">
      <div>
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 12,
          }}
        >
          <TenantLogo tenantId={current?.id} size={40} alt={current?.name} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 16 }}>{current?.name ?? 'No tenant'}</strong>
            {current?.plan && (
              <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                {current.plan} plan
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span>Cases</span>
            <div className="filters">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
              </select>
              <button
                className="btn secondary"
                onClick={() => {
                  setStatus('');
                  setPriority('');
                  setAgentId('');
                  setCustomerId('');
                }}
              >
                Clear
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading">Loading…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : cases.length === 0 ? (
            <div className="empty">No cases match those filters.</div>
          ) : (
            <table className="cases">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Customer</th>
                  <th>Agent</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="row"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <td>{c.subject}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td>{customerName(c.customerId)}</td>
                    <td>{agentName(c.assignedAgentId)}</td>
                    <td>{formatDate(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div>
        <div className="card">
          <div className="card-header">Agent workload</div>
          <div className="card-body">
            {workload.length === 0 ? (
              <div className="empty">No open work.</div>
            ) : (
              workload.map((w) => (
                <div key={w.agentId} className="workload-row">
                  {w.agentId ? (
                    <Link to={`/agents/${w.agentId}`}>{w.agentName}</Link>
                  ) : (
                    <span>{w.agentName}</span>
                  )}
                  <span className="count">{w.openCount}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
