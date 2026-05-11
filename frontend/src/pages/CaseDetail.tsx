import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useTenant } from '../TenantContext';
import {
  Agent,
  CaseComment,
  Customer,
  StatusEvent,
  SupportCase,
} from '../types';
import { PriorityBadge, StatusBadge, formatDate } from '../ui';

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { current } = useTenant();
  const [supportCase, setCase] = useState<SupportCase | null>(null);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantId = current?.id ?? '';

  async function load() {
    if (!tenantId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, ag] = await Promise.all([
        api.getCase(tenantId, id),
        api.listAgents(tenantId),
      ]);
      setCase(detail.case);
      setComments(detail.comments);
      setEvents(detail.statusEvents);
      setAgents(ag);
      const cs = await api.listCustomers(tenantId);
      setCustomer(cs.find((c) => c.id === detail.case.customerId) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, id]);

  async function postComment() {
    if (!supportCase || !newComment.trim() || !tenantId) return;
    setPosting(true);
    try {
      const authorId = supportCase.assignedAgentId ?? agents[0]?.id ?? '';
      await api.addComment(tenantId, supportCase.id, {
        authorId,
        authorKind: 'agent',
        body: newComment.trim(),
      });
      setNewComment('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function patch(body: { status?: string; priority?: string; assignedAgentId?: string | null }) {
    if (!supportCase || !tenantId) return;
    try {
      const changedBy = supportCase.assignedAgentId ?? agents[0]?.id ?? 'system';
      await api.patchCase(tenantId, supportCase.id, { ...body, changedBy });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading && !supportCase) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!supportCase) return <div className="empty">Case not found.</div>;

  const agentName = (id: string | null) =>
    id ? agents.find((a) => a.id === id)?.name ?? '—' : 'Unassigned';

  return (
    <div className="detail-grid">
      <div>
        <div className="card">
          <div className="card-header">
            <span>{supportCase.subject}</span>
            <span>
              <StatusBadge status={supportCase.status} />{' '}
              <PriorityBadge priority={supportCase.priority} />
            </span>
          </div>
          <div className="card-body">{supportCase.description}</div>
        </div>

        <div className="card">
          <div className="card-header">Conversation</div>
          <div className="card-body">
            {comments.length === 0 ? (
              <div className="empty">No comments yet.</div>
            ) : (
              <div className="timeline">
                {comments.map((c) => (
                  <div key={c.id} className="item">
                    <div className="meta">
                      {c.authorKind === 'agent' ? agentName(c.authorId) : customer?.name ?? 'Customer'} · {formatDate(c.createdAt)}
                    </div>
                    <div>{c.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="comment-box">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Reply as agent…"
              />
              <div>
                <button className="btn" onClick={postComment} disabled={posting || !newComment.trim()}>
                  {posting ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Status history</div>
          <div className="card-body">
            {events.length === 0 ? (
              <div className="empty">No transitions.</div>
            ) : (
              <div className="timeline">
                {events.map((e) => (
                  <div key={e.id} className="item">
                    <div className="meta">{formatDate(e.createdAt)} · {agentName(e.changedBy)}</div>
                    <div>
                      {e.fromStatus ? <StatusBadge status={e.fromStatus} /> : <span className="badge">created</span>}
                      {' → '}
                      <StatusBadge status={e.toStatus} />
                      {e.note ? <div style={{ color: '#6b7280', marginTop: 4 }}>{e.note}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-header">Details</div>
          <div className="card-body">
            <dl className="kvs">
              <dt>Customer</dt>
              <dd>{customer ? `${customer.name} (${customer.company})` : '—'}</dd>
              <dt>Email</dt>
              <dd>{customer?.email ?? '—'}</dd>
              <dt>Created</dt>
              <dd>{formatDate(supportCase.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{formatDate(supportCase.updatedAt)}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Manage</div>
          <div className="card-body">
            <div className="form">
              <div>
                <label>Status</label>
                <select
                  value={supportCase.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label>Priority</label>
                <select
                  value={supportCase.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label>Assigned agent</label>
                <select
                  value={supportCase.assignedAgentId ?? ''}
                  onChange={(e) => patch({ assignedAgentId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
