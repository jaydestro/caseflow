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
  source?: 'user' | 'background';
  /** Azure Portal Logs blade deep link, ±30s around `at`. */
  portalLink?: string;
}

export interface DiagnosticsResponse {
  summary: {
    count: number;
    totalRu: number;
    avgRu: number;
    maxRu: number;
    avgDurationMs: number;
    crossPartitionCount: number;
    userRu: number;
    backgroundRu: number;
    userCount: number;
    backgroundCount: number;
  };
  samples: QuerySample[];
  containerRUs: number;
  portalEnabled?: boolean;
}

export interface OpAggregate {
  op: string;
  count: number;
  totalRu: number;
  avgRu: number;
  maxRu: number;
  avgDurationMs?: number;
  p95DurationMs?: number;
  /** Pre-built Logs blade URL — KQL filtered to this op + window. */
  portalLink?: string;
}

export interface AzureCompareResponse {
  enabled: boolean;
  windowMinutes: number;
  local: { count: number; totalRu: number; avgRu: number; maxRu: number; byOp: OpAggregate[] };
  azure: {
    count: number;
    totalRu: number;
    avgRu: number;
    maxRu: number;
    latestRecordAt: string | null;
    byOp: OpAggregate[];
  } | null;
  lagSeconds?: number | null;
  workspaceId?: string;
  cosmosAccount?: string;
  portalLinks?: {
    workspace: string;
    metrics: string;
    metricsChart: string;
    insights: string;
    ruTimechart: string;
    opBreakdown: string;
  };
  note: string;
}

export interface DeltaField {
  before: number;
  after: number;
  change: number;
  pct: number | null;
}

export interface TelemetrySnapshot {
  label: string;
  takenAt: string;
  sampleCount: number;
  summary: {
    count: number;
    totalRu: number;
    avgRu: number;
    maxRu: number;
    avgDurationMs: number;
    crossPartitionCount: number;
    userRu: number;
    backgroundRu: number;
    userCount: number;
    backgroundCount: number;
  };
  byOp: Array<{ op: string; count: number; totalRu: number; avgRu: number; maxRu: number; avgDurationMs: number }>;
}

export interface BeforeAfterComparison {
  before: TelemetrySnapshot;
  after: TelemetrySnapshot;
  delta: {
    totalRu: DeltaField;
    avgRu: DeltaField;
    maxRu: DeltaField;
    avgDurationMs: DeltaField;
    crossPartitionCount: DeltaField;
    count: DeltaField;
  };
}
