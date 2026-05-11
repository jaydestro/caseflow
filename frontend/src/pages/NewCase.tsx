import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTenant } from '../TenantContext';
import { Agent, Customer } from '../types';

export function NewCase() {
  const { current } = useTenant();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantId = current?.id ?? '';

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([api.listAgents(tenantId), api.listCustomers(tenantId)])
      .then(([ag, cs]) => {
        setAgents(ag);
        setCustomers(cs);
        if (cs[0]) setCustomerId(cs[0].id);
        if (ag[0]) setAgentId(ag[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, [tenantId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createCase({
        tenantId,
        customerId,
        assignedAgentId: agentId || null,
        subject,
        description,
        priority,
      });
      navigate(`/cases/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!current) return <div className="empty">Pick a tenant to get started.</div>;

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-header">Open a new case</div>
      <div className="card-body">
        <form className="form" onSubmit={submit}>
          <div>
            <label>Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Assign agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div>
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          {error && <div className="error">{error}</div>}
          <div>
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
