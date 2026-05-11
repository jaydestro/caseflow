// Lightweight in-process ring buffer of recent data-store operations.
// Used by the Diagnostics page to surface RU charge, latency, and the SQL
// (or in-memory predicate description) that produced them.

export interface QuerySample {
  id: number;
  at: string;
  op: 'point-read' | 'upsert' | 'query';
  store: 'cosmos' | 'memory';
  query?: string;
  parameters?: Array<{ name: string; value: unknown }>;
  itemCount: number;
  durationMs: number;
  requestCharge: number | null; // null for in-memory
  crossPartition: boolean;
  notes?: string;
}

const BUFFER_SIZE = 200;

class Telemetry {
  private buf: QuerySample[] = [];
  private nextId = 1;

  record(sample: Omit<QuerySample, 'id' | 'at'>): void {
    const full: QuerySample = {
      id: this.nextId++,
      at: new Date().toISOString(),
      ...sample,
    };
    this.buf.push(full);
    if (this.buf.length > BUFFER_SIZE) this.buf.shift();
  }

  list(): QuerySample[] {
    return [...this.buf].reverse(); // newest first
  }

  summary() {
    if (this.buf.length === 0) {
      return {
        count: 0,
        totalRu: 0,
        avgRu: 0,
        maxRu: 0,
        avgDurationMs: 0,
        crossPartitionCount: 0,
      };
    }
    let totalRu = 0;
    let maxRu = 0;
    let totalMs = 0;
    let cp = 0;
    for (const s of this.buf) {
      const ru = s.requestCharge ?? 0;
      totalRu += ru;
      if (ru > maxRu) maxRu = ru;
      totalMs += s.durationMs;
      if (s.crossPartition) cp++;
    }
    return {
      count: this.buf.length,
      totalRu: round(totalRu),
      avgRu: round(totalRu / this.buf.length),
      maxRu: round(maxRu),
      avgDurationMs: round(totalMs / this.buf.length),
      crossPartitionCount: cp,
    };
  }

  clear(): void {
    this.buf = [];
    this.nextId = 1;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const telemetry = new Telemetry();
