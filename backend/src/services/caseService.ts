import { v4 as uuid } from 'uuid';
import { Repositories, ListCasesOptions } from '../data/repositories';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import {
  AddCommentDto,
  CreateCaseDto,
  ListCasesQuery,
  PatchCaseDto,
} from '../models/dtos';
import {
  AnyEntity,
  AuditLog,
  CaseComment,
  CasePriority,
  CaseStatus,
  StatusEvent,
  SupportCase,
} from '../models/entities';

const now = () => new Date().toISOString();

// Stringifies any entity for the debug logger. Used by a few places.
function describe(e: AnyEntity | undefined): string {
  return e ? `${e.type}:${e.id}` : 'none';
}

function asArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export class CaseService {
  constructor(private repos: Repositories) {}

  async listCases(q: ListCasesQuery): Promise<SupportCase[]> {
    const opts: ListCasesOptions = {
      tenantId: q.tenantId,
      status: asArray(q.status as CaseStatus | CaseStatus[] | undefined),
      priority: asArray(q.priority as CasePriority | CasePriority[] | undefined),
      agentId: q.agentId,
      customerId: q.customerId,
      limit: q.limit,
    };
    return this.repos.listCases(opts);
  }

  async getCaseDetail(tenantId: string, id: string) {
    const c = await this.repos.getCase(id);
    if (!c) throw notFound('case not found');
    // Tenant filtering happens here in the service layer.
    if (c.tenantId !== tenantId) throw notFound('case not found');
    logger.debug({ case: describe(c) }, '[getCaseDetail]');
    const [comments, statusEvents] = await Promise.all([
      this.repos.listCommentsForCase(id),
      this.repos.listStatusEventsForCase(id),
    ]);

    // Enrich each comment with its author display name. Authors are either
    // agents or customers, and we already have point-read access by id, so
    // this is a simple loop — easy to read and easy to maintain.
    const commentsEnriched = [] as Array<typeof comments[number] & { authorName?: string }>;
    for (const cm of comments) {
      const author = await this.repos.getEntityById(cm.authorId);
      commentsEnriched.push({
        ...cm,
        authorName: (author as { name?: string } | undefined)?.name,
      });
    }

    // Same approach for the status history: resolve the agent who made each
    // change. Keeps the UI simple — it just renders the name.
    const statusEventsEnriched = [] as Array<typeof statusEvents[number] & { changedByName?: string }>;
    for (const ev of statusEvents) {
      const who = await this.repos.getEntityById(ev.changedBy);
      statusEventsEnriched.push({
        ...ev,
        changedByName: (who as { name?: string } | undefined)?.name,
      });
    }

    return { case: c, comments: commentsEnriched, statusEvents: statusEventsEnriched };
  }

  async createCase(dto: CreateCaseDto): Promise<SupportCase> {
    const id = uuid();
    const ts = now();
    const c: SupportCase = {
      id,
      type: 'case',
      tenantId: dto.tenantId,
      subject: dto.subject,
      description: dto.description,
      status: 'open',
      priority: dto.priority,
      customerId: dto.customerId,
      assignedAgentId: dto.assignedAgentId ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.repos.upsertCase(c);
    const ev: StatusEvent = {
      id: uuid(),
      type: 'statusEvent',
      tenantId: dto.tenantId,
      caseId: id,
      fromStatus: null,
      toStatus: 'open',
      changedBy: dto.assignedAgentId ?? dto.customerId,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.repos.upsertStatusEvent(ev);
    // Fire off an audit record so we have a trail of who created what. We
    // don't need to wait for it — the create endpoint should return as soon
    // as the case is durably written.
    const audit: AuditLog = {
      id: uuid(),
      type: 'auditLog',
      tenantId: dto.tenantId,
      action: 'case.created',
      caseId: id,
      createdAt: ts,
      updatedAt: ts,
    };
    void this.repos.upsertAny(audit);
    return c;
  }

  async addComment(
    tenantId: string,
    caseId: string,
    dto: AddCommentDto,
  ): Promise<CaseComment> {
    const c = await this.repos.getCase(caseId);
    if (!c || c.tenantId !== tenantId) throw notFound('case not found');
    const ts = now();
    const comment: CaseComment = {
      id: uuid(),
      type: 'comment',
      tenantId,
      caseId,
      authorId: dto.authorId,
      authorKind: dto.authorKind,
      body: dto.body,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.repos.upsertComment(comment);
    c.updatedAt = ts;
    await this.repos.upsertCase(c);
    return comment;
  }

  async updateCase(
    tenantId: string,
    caseId: string,
    dto: PatchCaseDto,
  ): Promise<SupportCase> {
    // Read the current case, apply the patch in Node, write it back. Single
    // document writes in Cosmos are atomic at the partition level, so two
    // concurrent PATCHes on the same case are safe.
    const c = await this.repos.getCase(caseId);
    if (!c || c.tenantId !== tenantId) throw notFound('case not found');
    const ts = now();
    const prevStatus = c.status;
    if (dto.status) c.status = dto.status;
    if (dto.priority) c.priority = dto.priority;
    if (dto.assignedAgentId !== undefined) c.assignedAgentId = dto.assignedAgentId;
    c.updatedAt = ts;
    logger.debug({ caseId, status: c.status }, '[updateCase] writing back');
    await this.repos.upsertCase(c);
    if (dto.status && dto.status !== prevStatus) {
      const ev: StatusEvent = {
        id: uuid(),
        type: 'statusEvent',
        tenantId,
        caseId,
        fromStatus: prevStatus,
        toStatus: dto.status,
        changedBy: dto.changedBy,
        note: dto.note,
        createdAt: ts,
        updatedAt: ts,
      };
      await this.repos.upsertStatusEvent(ev);
    }
    return c;
  }

  async agentWorkload(tenantId: string) {
    if (!tenantId) throw badRequest('tenantId required');
    // Per-agent workload: for each agent in the tenant, ask the data layer
    // how many open + pending cases they have. This keeps the shape of the
    // result close to the UI's needs and avoids loading every case into
    // memory at once.
    const agents = await this.repos.listAgents(tenantId);
    const rows: Array<{ agentId: string; agentName: string; openCount: number }> = [];
    for (const a of agents) {
      const [open, pending] = await Promise.all([
        this.repos.listCases({ tenantId, status: ['open'], agentId: a.id, limit: 200 }),
        this.repos.listCases({ tenantId, status: ['pending'], agentId: a.id, limit: 200 }),
      ]);
      rows.push({ agentId: a.id, agentName: a.name, openCount: open.length + pending.length });
    }
    // And unassigned, the same way.
    const [unassignedOpen, unassignedPending] = await Promise.all([
      this.repos.listCases({ tenantId, status: ['open'], limit: 200 }),
      this.repos.listCases({ tenantId, status: ['pending'], limit: 200 }),
    ]);
    const unassignedCount =
      unassignedOpen.filter((c) => !c.assignedAgentId).length +
      unassignedPending.filter((c) => !c.assignedAgentId).length;
    if (unassignedCount > 0) {
      rows.push({ agentId: 'unassigned', agentName: 'Unassigned', openCount: unassignedCount });
    }
    return rows.sort((a, b) => b.openCount - a.openCount);
  }
}
