// In-app traffic generator for the Diagnostics page.
//
// Replays the same weighted mix of operations as scripts/traffic-gen.ps1, but
// runs entirely in-process so students can press a button on the Diagnostics
// page and watch RU charge / cross-partition counts move — no external script
// or shell required. Every operation is tagged as `user` traffic so it shows
// up in the telemetry buffer exactly like a real click would.
//
// Because it runs a representative *sample* of caller sessions, it also
// extrapolates the per-day cost: given a target of N callers/day it projects
// the steady-state and business-hours-peak RU/s and flags whether that would
// blow the container's provisioned budget. That projection is the teaching
// payoff — students see how a cheap-looking per-op cost adds up at scale.

import { Repositories } from '../data/repositories';
import { runWithSource, telemetry } from '../lib/telemetry';
import { CaseService } from './caseService';

const SUBJECTS = [
  'Cannot log in to portal',
  'Billing discrepancy on latest invoice',
  'Feature request: export to CSV',
  'API returning 500 on bulk upload',
  'Password reset email never arrives',
  'Dashboard loads slowly after update',
  'Need to add a seat to our plan',
  'Webhook deliveries are delayed',
  'Mobile app crashes on startup',
  'Data import skipped several rows',
  'SSO login loops back to sign-in',
  'Report totals do not match exports',
  'Rate limit hit during migration',
  'Notification emails going to spam',
  'Timezone shown incorrectly in UI',
] as const;

const COMMENTS = [
  'Thanks for the details — taking a look now.',
  'Could you share a screenshot of the error?',
  'We deployed a fix; please confirm it resolves the issue.',
  'Escalating to engineering for further review.',
  'This is a known issue with a workaround below.',
  'Reproduced on our side — tracking internally.',
  'Closing as resolved; reopen if it recurs.',
  'Adding more logging to capture the next occurrence.',
  'Confirmed the data is now syncing correctly.',
  'Following up — any update on your end?',
] as const;

const STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const ENVIRONMENTS = ['production', 'staging', 'dev'] as const;
const IMPACTS = ['low', 'medium', 'high'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export interface TrafficOptions {
  /** Target daily caller volume to project costs for. */
  callersPerDay: number;
  /** How many caller sessions to actually run as the sample. */
  sampleCallers: number;
  /** Hours/day the callers are concentrated into, for the peak RU/s estimate. */
  businessHours: number;
}

export interface TrafficResult {
  callersPerDay: number;
  sampleCallers: number;
  businessHours: number;
  opsRun: number;
  errors: number;
  durationMs: number;
  byOp: Record<string, number>;
  /** RU measured for the operations this run produced. */
  measuredRu: number;
  avgRuPerOp: number;
  avgRuPerCaller: number;
  crossPartitionOps: number;
  /** Extrapolated cost at the target caller volume. */
  projectedDailyRu: number;
  projectedRuPerSecAvg: number;
  projectedRuPerSecPeak: number;
  containerRUs: number;
  exceedsBudget: boolean;
}

const OP_KINDS = [
  'listCases',
  'getCase',
  'agentWorkload',
  'directory',
  'createCase',
  'updateCase',
  'addComment',
] as const;
type OpKind = (typeof OP_KINDS)[number];

interface TenantPool {
  agentIds: string[];
  customerIds: string[];
  caseIds: string[];
}

/**
 * Run a sample of simulated caller sessions and return both the measured RU
 * cost and a projection to the requested daily caller volume.
 */
export async function generateTraffic(
  repos: Repositories,
  containerRUs: number,
  opts: TrafficOptions,
): Promise<TrafficResult> {
  const svc = new CaseService(repos);

  // Build per-tenant pools of agents / customers / recent cases to act on.
  const tenants = await repos.listTenants();
  const pools = new Map<string, TenantPool>();
  for (const t of tenants) {
    const [agents, customers, cases] = await Promise.all([
      repos.listAgents(t.id),
      repos.listCustomers(t.id),
      repos.listCases({ tenantId: t.id, limit: 50 }),
    ]);
    pools.set(t.id, {
      agentIds: agents.map((a) => a.id),
      customerIds: customers.map((c) => c.id),
      caseIds: cases.map((c) => c.id),
    });
  }
  const tenantIds = tenants.map((t) => t.id).filter((id) => pools.get(id)?.customerIds.length);

  const byOp: Record<string, number> = {};
  let opsRun = 0;
  let errors = 0;

  // Mark the start so we can sum the RU of only the ops this run produced.
  const startMs = Date.now();
  const startIso = new Date(startMs - 1).toISOString();

  for (let i = 0; i < opts.sampleCallers && tenantIds.length > 0; i++) {
    const tenantId = pick(tenantIds);
    const pool = pools.get(tenantId)!;
    // A caller "session" is a short burst of 1–4 operations.
    const sessionOps = randInt(1, 4);
    await runWithSource('user', async () => {
      for (let j = 0; j < sessionOps; j++) {
        const kind = pickWeightedOp();
        try {
          await runOp(svc, repos, tenantId, pool, kind);
          opsRun++;
          byOp[kind] = (byOp[kind] ?? 0) + 1;
        } catch {
          errors++;
        }
      }
    });
  }

  const durationMs = Date.now() - startMs;

  // Sum RU from the telemetry buffer for user ops produced during this run.
  const runSamples = telemetry
    .list()
    .filter((s) => s.source === 'user' && s.at >= startIso);
  const measuredRu = runSamples.reduce((acc, s) => acc + (s.requestCharge ?? 0), 0);
  const crossPartitionOps = runSamples.filter((s) => s.crossPartition).length;

  const avgRuPerOp = opsRun > 0 ? measuredRu / opsRun : 0;
  const avgRuPerCaller = opts.sampleCallers > 0 ? measuredRu / opts.sampleCallers : 0;

  // Project to the requested daily caller volume.
  const projectedDailyRu = avgRuPerCaller * opts.callersPerDay;
  const projectedRuPerSecAvg = projectedDailyRu / 86400;
  const businessHours = Math.max(1, opts.businessHours);
  const projectedRuPerSecPeak = projectedDailyRu / (businessHours * 3600);

  return {
    callersPerDay: opts.callersPerDay,
    sampleCallers: opts.sampleCallers,
    businessHours,
    opsRun,
    errors,
    durationMs,
    byOp,
    measuredRu: round(measuredRu),
    avgRuPerOp: round(avgRuPerOp, 3),
    avgRuPerCaller: round(avgRuPerCaller, 3),
    crossPartitionOps,
    projectedDailyRu: Math.round(projectedDailyRu),
    projectedRuPerSecAvg: round(projectedRuPerSecAvg, 2),
    projectedRuPerSecPeak: round(projectedRuPerSecPeak, 2),
    containerRUs,
    exceedsBudget: projectedRuPerSecPeak > containerRUs,
  };
}

/** Weighted op selection — reads dominate a real support workday. */
function pickWeightedOp(): OpKind {
  const roll = randInt(0, 99);
  if (roll < 30) return 'listCases';
  if (roll < 45) return 'getCase';
  if (roll < 55) return 'agentWorkload';
  if (roll < 65) return 'directory';
  if (roll < 78) return 'createCase';
  if (roll < 88) return 'updateCase';
  return 'addComment';
}

async function runOp(
  svc: CaseService,
  repos: Repositories,
  tenantId: string,
  pool: TenantPool,
  kind: OpKind,
): Promise<void> {
  switch (kind) {
    case 'listCases': {
      const status = Math.random() < 0.34 ? [pick(STATUSES)] : undefined;
      const priority = Math.random() < 0.25 ? [pick(PRIORITIES)] : undefined;
      await svc.listCases({
        tenantId,
        status,
        priority,
        limit: randInt(10, 50),
      });
      return;
    }
    case 'getCase': {
      if (pool.caseIds.length === 0) return;
      await svc.getCaseDetail(tenantId, pick(pool.caseIds));
      return;
    }
    case 'agentWorkload': {
      await svc.agentWorkload(tenantId);
      return;
    }
    case 'directory': {
      const r = randInt(0, 2);
      if (r === 0) await repos.listTenants();
      else if (r === 1) await repos.listAgents(tenantId);
      else await repos.listCustomers(tenantId);
      return;
    }
    case 'createCase': {
      if (pool.customerIds.length === 0) return;
      const created = await svc.createCase({
        tenantId,
        customerId: pick(pool.customerIds),
        assignedAgentId:
          pool.agentIds.length && Math.random() < 0.66 ? pick(pool.agentIds) : null,
        subject: pick(SUBJECTS),
        description: `Reported via support portal. Customer impact: ${pick(
          IMPACTS,
        )}. Environment: ${pick(ENVIRONMENTS)}.`,
        priority: pick(PRIORITIES),
      });
      pool.caseIds.push(created.id);
      if (pool.caseIds.length > 200) pool.caseIds.shift();
      return;
    }
    case 'updateCase': {
      if (pool.caseIds.length === 0 || pool.agentIds.length === 0) return;
      const r = randInt(0, 2);
      await svc.updateCase(tenantId, pick(pool.caseIds), {
        changedBy: pick(pool.agentIds),
        status: r === 0 ? pick(STATUSES) : undefined,
        priority: r === 1 ? pick(PRIORITIES) : undefined,
        assignedAgentId: r === 2 ? pick(pool.agentIds) : undefined,
      });
      return;
    }
    case 'addComment': {
      if (pool.caseIds.length === 0) return;
      const fromAgent = Math.random() < 0.5 && pool.agentIds.length > 0;
      const authorId = fromAgent ? pick(pool.agentIds) : pick(pool.customerIds);
      if (!authorId) return;
      await svc.addComment(tenantId, pick(pool.caseIds), {
        authorId,
        authorKind: fromAgent ? 'agent' : 'customer',
        body: pick(COMMENTS),
      });
      return;
    }
  }
}
