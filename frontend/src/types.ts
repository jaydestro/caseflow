export type CaseStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Tenant {
  id: string;
  name: string;
  plan: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
}

export interface SupportCase {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  customerId: string;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseComment {
  id: string;
  caseId: string;
  authorId: string;
  authorKind: 'agent' | 'customer';
  body: string;
  createdAt: string;
}

export interface StatusEvent {
  id: string;
  caseId: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  changedBy: string;
  note?: string;
  createdAt: string;
}

export interface WorkloadRow {
  agentId: string;
  agentName: string;
  openCount: number;
}

export interface QuerySample {
  id: number;
  at: string;
  op: 'point-read' | 'upsert' | 'query';
  store: 'cosmos' | 'memory';
  query?: string;
  parameters?: Array<{ name: string; value: unknown }>;
  itemCount: number;
  durationMs: number;
  requestCharge: number | null;
  crossPartition: boolean;
  notes?: string;
}

export interface DiagnosticsResponse {
  summary: {
    count: number;
    totalRu: number;
    avgRu: number;
    maxRu: number;
    avgDurationMs: number;
    crossPartitionCount: number;
  };
  samples: QuerySample[];
}
