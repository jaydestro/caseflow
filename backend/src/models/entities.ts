export type EntityType =
  | 'tenant'
  | 'agent'
  | 'customer'
  | 'case'
  | 'comment'
  | 'statusEvent'
  | 'auditLog';

export interface BaseEntity {
  id: string;
  type: EntityType;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant extends BaseEntity {
  type: 'tenant';
  name: string;
  plan: 'starter' | 'growth' | 'enterprise';
}

export interface Agent extends BaseEntity {
  type: 'agent';
  name: string;
  email: string;
  role: 'agent' | 'lead' | 'admin';
}

export interface Customer extends BaseEntity {
  type: 'customer';
  name: string;
  email: string;
  company: string;
}

export type CaseStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportCase extends BaseEntity {
  type: 'case';
  subject: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  customerId: string;
  assignedAgentId: string | null;
}

export interface CaseComment extends BaseEntity {
  type: 'comment';
  caseId: string;
  authorId: string;
  authorKind: 'agent' | 'customer';
  body: string;
}

export interface StatusEvent extends BaseEntity {
  type: 'statusEvent';
  caseId: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  changedBy: string;
  note?: string;
}

export interface AuditLog extends BaseEntity {
  type: 'auditLog';
  action: string;
  caseId: string;
}

export type AnyEntity =
  | Tenant
  | Agent
  | Customer
  | SupportCase
  | CaseComment
  | StatusEvent
  | AuditLog;
