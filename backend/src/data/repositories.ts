import {
  Agent,
  AnyEntity,
  CaseComment,
  CasePriority,
  CaseStatus,
  Customer,
  StatusEvent,
  SupportCase,
  Tenant,
} from '../models/entities';
import { EntityStore, SqlQuerySpec } from './store';

export interface ListCasesOptions {
  tenantId: string;
  status?: CaseStatus[];
  priority?: CasePriority[];
  agentId?: string;
  customerId?: string;
  limit: number;
}

export class Repositories {
  constructor(private store: EntityStore) {}

  async listTenants(): Promise<Tenant[]> {
    return this.store.query<Tenant>({
      query: 'SELECT * FROM c WHERE c.type = @t',
      parameters: [{ name: '@t', value: 'tenant' }],
    });
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const t = await this.store.get<Tenant>(id);
    return t?.type === 'tenant' ? t : undefined;
  }

  async listAgents(tenantId: string): Promise<Agent[]> {
    return this.store.query<Agent>({
      query: 'SELECT * FROM c WHERE c.type = @t AND c.tenantId = @tid',
      parameters: [
        { name: '@t', value: 'agent' },
        { name: '@tid', value: tenantId },
      ],
    });
  }

  async listCustomers(tenantId: string): Promise<Customer[]> {
    return this.store.query<Customer>({
      query: 'SELECT * FROM c WHERE c.type = @t AND c.tenantId = @tid',
      parameters: [
        { name: '@t', value: 'customer' },
        { name: '@tid', value: tenantId },
      ],
    });
  }

  async listCases(opts: ListCasesOptions): Promise<SupportCase[]> {
    const params: Array<{ name: string; value: unknown }> = [
      { name: '@t', value: 'case' },
      { name: '@tid', value: opts.tenantId },
    ];
    let where = 'c.type = @t AND c.tenantId = @tid';
    if (opts.status?.length) {
      where += ' AND ARRAY_CONTAINS(@statuses, c.status)';
      params.push({ name: '@statuses', value: opts.status });
    }
    if (opts.priority?.length) {
      where += ' AND ARRAY_CONTAINS(@priorities, c.priority)';
      params.push({ name: '@priorities', value: opts.priority });
    }
    if (opts.agentId) {
      where += ' AND c.assignedAgentId = @aid';
      params.push({ name: '@aid', value: opts.agentId });
    }
    if (opts.customerId) {
      where += ' AND c.customerId = @cid';
      params.push({ name: '@cid', value: opts.customerId });
    }
    const sql = `SELECT * FROM c WHERE ${where}`;
    return this.store.query<SupportCase>({ query: sql, parameters: params });
  }

  async getCase(id: string): Promise<SupportCase | undefined> {
    const c = await this.store.get<SupportCase>(id);
    return c?.type === 'case' ? c : undefined;
  }

  async upsertCase(c: SupportCase): Promise<SupportCase> {
    return this.store.upsert(c);
  }

  async listCommentsForCase(caseId: string): Promise<CaseComment[]> {
    return this.store.query<CaseComment>({
      query:
        'SELECT * FROM c WHERE c.type = @t AND c.caseId = @cid',
      parameters: [
        { name: '@t', value: 'comment' },
        { name: '@cid', value: caseId },
      ],
    });
  }

  async listStatusEventsForCase(caseId: string): Promise<StatusEvent[]> {
    return this.store.query<StatusEvent>({
      query:
        'SELECT * FROM c WHERE c.type = @t AND c.caseId = @cid',
      parameters: [
        { name: '@t', value: 'statusEvent' },
        { name: '@cid', value: caseId },
      ],
    });
  }

  async upsertComment(c: CaseComment): Promise<CaseComment> {
    return this.store.upsert(c);
  }

  async upsertStatusEvent(e: StatusEvent): Promise<StatusEvent> {
    return this.store.upsert(e);
  }

  async upsertAny<T extends AnyEntity>(doc: T): Promise<T> {
    return this.store.upsert(doc);
  }

  // Generic id lookup used by the case detail view to enrich comment authors
  // and status-event actors. Backed by a single point read on the partition
  // key, so it is cheap to call in a loop.
  async getEntityById(id: string): Promise<AnyEntity | undefined> {
    return this.store.get<AnyEntity>(id);
  }
}
