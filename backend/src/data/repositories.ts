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
import { InMemoryEntityStore, InMemoryQuerySpec } from './memoryStore';

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

  private isInMemory(): this is { store: InMemoryEntityStore } {
    return this.store instanceof InMemoryEntityStore;
  }

  private buildSpec(
    sql: SqlQuerySpec,
    predicate: (d: AnyEntity) => boolean,
    sort?: (a: AnyEntity, b: AnyEntity) => number,
    limit?: number,
  ): SqlQuerySpec {
    if (this.isInMemory()) {
      const ext: InMemoryQuerySpec = { ...sql, predicate, sort, limit };
      return ext;
    }
    return sql;
  }

  async listTenants(): Promise<Tenant[]> {
    const spec = this.buildSpec(
      {
        query: 'SELECT * FROM c WHERE c.type = @t',
        parameters: [{ name: '@t', value: 'tenant' }],
      },
      (d) => d.type === 'tenant',
      (a, b) => (a as Tenant).name.localeCompare((b as Tenant).name),
    );
    return this.store.query<Tenant>(spec);
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const t = await this.store.get<Tenant>(id);
    return t?.type === 'tenant' ? t : undefined;
  }

  async listAgents(tenantId: string): Promise<Agent[]> {
    const spec = this.buildSpec(
      {
        query: 'SELECT * FROM c WHERE c.type = @t AND c.tenantId = @tid',
        parameters: [
          { name: '@t', value: 'agent' },
          { name: '@tid', value: tenantId },
        ],
      },
      (d) => d.type === 'agent' && d.tenantId === tenantId,
      (a, b) => (a as Agent).name.localeCompare((b as Agent).name),
    );
    return this.store.query<Agent>(spec);
  }

  async listCustomers(tenantId: string): Promise<Customer[]> {
    const spec = this.buildSpec(
      {
        query: 'SELECT * FROM c WHERE c.type = @t AND c.tenantId = @tid',
        parameters: [
          { name: '@t', value: 'customer' },
          { name: '@tid', value: tenantId },
        ],
      },
      (d) => d.type === 'customer' && d.tenantId === tenantId,
      (a, b) => (a as Customer).name.localeCompare((b as Customer).name),
    );
    return this.store.query<Customer>(spec);
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
    const sql = `SELECT * FROM c WHERE ${where} ORDER BY c.updatedAt DESC`;
    const spec = this.buildSpec(
      { query: sql, parameters: params },
      (d) => {
        if (d.type !== 'case' || d.tenantId !== opts.tenantId) return false;
        const c = d as SupportCase;
        if (opts.status?.length && !opts.status.includes(c.status)) return false;
        if (opts.priority?.length && !opts.priority.includes(c.priority)) return false;
        if (opts.agentId && c.assignedAgentId !== opts.agentId) return false;
        if (opts.customerId && c.customerId !== opts.customerId) return false;
        return true;
      },
      (a, b) => ((b as SupportCase).updatedAt).localeCompare((a as SupportCase).updatedAt),
      opts.limit,
    );
    return this.store.query<SupportCase>(spec);
  }

  async getCase(id: string): Promise<SupportCase | undefined> {
    const c = await this.store.get<SupportCase>(id);
    return c?.type === 'case' ? c : undefined;
  }

  async upsertCase(c: SupportCase): Promise<SupportCase> {
    return this.store.upsert(c);
  }

  async listCommentsForCase(caseId: string): Promise<CaseComment[]> {
    const spec = this.buildSpec(
      {
        query:
          'SELECT * FROM c WHERE c.type = @t AND c.caseId = @cid ORDER BY c.createdAt ASC',
        parameters: [
          { name: '@t', value: 'comment' },
          { name: '@cid', value: caseId },
        ],
      },
      (d) => d.type === 'comment' && (d as CaseComment).caseId === caseId,
      (a, b) => (a as CaseComment).createdAt.localeCompare((b as CaseComment).createdAt),
    );
    return this.store.query<CaseComment>(spec);
  }

  async listStatusEventsForCase(caseId: string): Promise<StatusEvent[]> {
    const spec = this.buildSpec(
      {
        query:
          'SELECT * FROM c WHERE c.type = @t AND c.caseId = @cid ORDER BY c.createdAt ASC',
        parameters: [
          { name: '@t', value: 'statusEvent' },
          { name: '@cid', value: caseId },
        ],
      },
      (d) => d.type === 'statusEvent' && (d as StatusEvent).caseId === caseId,
      (a, b) => (a as StatusEvent).createdAt.localeCompare((b as StatusEvent).createdAt),
    );
    return this.store.query<StatusEvent>(spec);
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
