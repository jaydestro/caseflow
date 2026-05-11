import {
  Agent,
  CaseComment,
  Customer,
  DiagnosticsResponse,
  StatusEvent,
  SupportCase,
  Tenant,
  WorkloadRow,
} from './types';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  listTenants: () => http<Tenant[]>('/api/tenants'),
  listAgents: (tenantId: string) =>
    http<Agent[]>(`/api/agents${qs({ tenantId })}`),
  listCustomers: (tenantId: string) =>
    http<Customer[]>(`/api/customers${qs({ tenantId })}`),

  listCases: (q: {
    tenantId: string;
    status?: string[];
    priority?: string[];
    agentId?: string;
    customerId?: string;
  }) => http<{ items: SupportCase[] }>(`/api/cases${qs(q)}`),

  getCase: (tenantId: string, id: string) =>
    http<{ case: SupportCase; comments: CaseComment[]; statusEvents: StatusEvent[] }>(
      `/api/cases/${id}${qs({ tenantId })}`,
    ),

  createCase: (body: {
    tenantId: string;
    customerId: string;
    assignedAgentId?: string | null;
    subject: string;
    description: string;
    priority: string;
  }) => http<SupportCase>('/api/cases', { method: 'POST', body: JSON.stringify(body) }),

  patchCase: (
    tenantId: string,
    id: string,
    body: { status?: string; priority?: string; assignedAgentId?: string | null; changedBy: string; note?: string },
  ) =>
    http<SupportCase>(`/api/cases/${id}${qs({ tenantId })}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  addComment: (
    tenantId: string,
    id: string,
    body: { authorId: string; authorKind: 'agent' | 'customer'; body: string },
  ) =>
    http<CaseComment>(`/api/cases/${id}/comments${qs({ tenantId })}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  agentWorkload: (tenantId: string) =>
    http<WorkloadRow[]>(`/api/cases/_/agent-workload${qs({ tenantId })}`),

  diagnostics: () => http<DiagnosticsResponse>('/api/_diagnostics/queries'),
  clearDiagnostics: () =>
    http<{ ok: boolean }>('/api/_diagnostics/clear', { method: 'POST' }),
};
