import { telemetry } from '../lib/telemetry';
import { AnyEntity } from '../models/entities';
import { EntityStore, SqlQuerySpec } from './store';

export interface InMemoryQuerySpec extends SqlQuerySpec {
  predicate?: (doc: AnyEntity) => boolean;
  sort?: (a: AnyEntity, b: AnyEntity) => number;
  limit?: number;
}

// Tuning knobs for the simulated Cosmos cost model.
// These give a "feels real" experience: a single cross-partition list query
// against the seeded dataset (~5000 docs across 3 tenants) lands around
// 150-300ms and 150-300 RU, and a point read is ~1 RU and a few ms. The
// intent is that the dashboard load is noticeably sluggish — and the agent
// workload widget (which fires one query per agent) is painfully slow — so
// the audience can SEE the cost of the design choices.
const MS_PER_SCANNED_DOC = 0.02;
const RU_PER_SCANNED_DOC = 0.02;
const CROSS_PARTITION_FANOUT = 1.6;
const POINT_READ_MS = 2;
const POINT_READ_RU = 1;
const UPSERT_MS = 0; // seed inserts thousands of docs; don't pay latency on writes
const UPSERT_RU = 7;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

export class InMemoryEntityStore implements EntityStore {
  private docs = new Map<string, AnyEntity>();

  async init(): Promise<void> {
    /* no-op */
  }

  async get<T extends AnyEntity>(id: string): Promise<T | undefined> {
    const start = Date.now();
    await sleep(POINT_READ_MS);
    const item = this.docs.get(id) as T | undefined;
    telemetry.record({
      op: 'point-read',
      store: 'memory',
      query: `point read id=${id}`,
      itemCount: item ? 1 : 0,
      durationMs: Date.now() - start,
      requestCharge: POINT_READ_RU,
      crossPartition: false,
    });
    return item;
  }

  async upsert<T extends AnyEntity>(doc: T): Promise<T> {
    const start = Date.now();
    await sleep(UPSERT_MS);
    this.docs.set(doc.id, doc);
    telemetry.record({
      op: 'upsert',
      store: 'memory',
      query: `upsert id=${doc.id} type=${doc.type}`,
      itemCount: 1,
      durationMs: Date.now() - start,
      requestCharge: UPSERT_RU,
      crossPartition: false,
    });
    return doc;
  }

  async query<T extends AnyEntity>(spec: SqlQuerySpec): Promise<T[]> {
    const start = Date.now();
    const s = spec as InMemoryQuerySpec;
    const all = Array.from(this.docs.values());
    const scanned = all.length;
    let results: AnyEntity[] = all;
    if (s.predicate) results = results.filter(s.predicate);
    if (s.sort) results = [...results].sort(s.sort);
    if (s.limit) results = results.slice(0, s.limit);
    const sql = spec.query ?? '';
    const crossPartition = !/\bc\.id\s*=/.test(sql);

    // Simulate Cosmos cost: pay per scanned doc, not per returned doc.
    // Cross-partition queries fan out across logical partitions, so they
    // pay an extra multiplier on top.
    const fanout = crossPartition ? CROSS_PARTITION_FANOUT : 1;
    const simulatedMs = scanned * MS_PER_SCANNED_DOC * fanout;
    const simulatedRu = Math.round(scanned * RU_PER_SCANNED_DOC * fanout * 100) / 100;
    await sleep(simulatedMs);

    telemetry.record({
      op: 'query',
      store: 'memory',
      query: sql,
      parameters: spec.parameters,
      itemCount: results.length,
      durationMs: Date.now() - start,
      requestCharge: simulatedRu,
      crossPartition,
      notes: `scanned ${scanned} docs${crossPartition ? '; cross-partition fan-out' : ''}`,
    });
    return results as T[];
  }

  _reset() {
    this.docs.clear();
  }
}
