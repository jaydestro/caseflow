// Lightweight in-process ring buffer of recent data-store operations.
// Used by the Diagnostics page to surface RU charge, latency, and the SQL
// (or in-memory predicate description) that produced them.

import { AsyncLocalStorage } from 'node:async_hooks';

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
  source?: 'user' | 'background';
}

type TelemetryContext = { source: 'user' | 'background' };
const als = new AsyncLocalStorage<TelemetryContext>();

/** Run a function with a telemetry source tag. All store ops inside inherit it. */
export function runWithSource<T>(source: 'user' | 'background', fn: () => T): T {
  return als.run({ source }, fn);
}

const BUFFER_SIZE = 200;

class Telemetry {
  private buf: QuerySample[] = [];
  private nextId = 1;

  record(sample: Omit<QuerySample, 'id' | 'at' | 'source'>): void {
    const ctx = als.getStore();
    const full: QuerySample = {
      id: this.nextId++,
      at: new Date().toISOString(),
      ...sample,
      source: ctx?.source,
    };
    this.buf.push(full);
    if (this.buf.length > BUFFER_SIZE) this.buf.shift();
  }

  list(): QuerySample[] {
    return [...this.buf].reverse(); // newest first
  }

  summary() {
    return this.summarizeSamples(this.buf);
  }

  private summarizeSamples(samples: QuerySample[]) {
    if (samples.length === 0) {
      return {
        count: 0,
        totalRu: 0,
        avgRu: 0,
        maxRu: 0,
        avgDurationMs: 0,
        crossPartitionCount: 0,
        userRu: 0,
        backgroundRu: 0,
        userCount: 0,
        backgroundCount: 0,
      };
    }
    let totalRu = 0;
    let maxRu = 0;
    let totalMs = 0;
    let cp = 0;
    let userRu = 0;
    let backgroundRu = 0;
    let userCount = 0;
    let backgroundCount = 0;
    for (const s of samples) {
      const ru = s.requestCharge ?? 0;
      totalRu += ru;
      if (ru > maxRu) maxRu = ru;
      totalMs += s.durationMs;
      if (s.crossPartition) cp++;
      if (s.source === 'background') {
        backgroundRu += ru;
        backgroundCount++;
      } else {
        userRu += ru;
        userCount++;
      }
    }
    return {
      count: samples.length,
      totalRu: round(totalRu),
      avgRu: round(totalRu / samples.length),
      maxRu: round(maxRu),
      avgDurationMs: round(totalMs / samples.length),
      crossPartitionCount: cp,
      userRu: round(userRu),
      backgroundRu: round(backgroundRu),
      userCount,
      backgroundCount,
    };
  }

  clear(): void {
    this.buf = [];
    this.nextId = 1;
  }

  // ---- Baseline snapshot for before/after comparison ----------------------

  private _snapshot: TelemetrySnapshot | null = null;
  // Wall-clock mark (epoch ms) of when the baseline was taken. Everything
  // recorded AFTER this is the "after" window, so re-sampling post-change is
  // compared cleanly instead of being diluted by the before-traffic still in
  // the ring buffer.
  private _snapshotAt: number | null = null;

  /** Freeze the current summary + byOp breakdown as the "before" baseline. */
  takeSnapshot(label?: string): TelemetrySnapshot {
    const summary = this.summary();
    const byOp = this.summarizeWindowByOp(this.buf);
    this._snapshotAt = Date.now();
    this._snapshot = {
      label: label ?? 'baseline',
      takenAt: new Date(this._snapshotAt).toISOString(),
      sampleCount: this.buf.length,
      summary,
      byOp,
    };
    return this._snapshot;
  }

  getSnapshot(): TelemetrySnapshot | null {
    return this._snapshot;
  }

  clearSnapshot(): void {
    this._snapshot = null;
    this._snapshotAt = null;
  }

  /**
   * Build a before/after delta from the saved snapshot vs the operations
   * recorded SINCE the snapshot was taken (the "after" window). This makes
   * "capture before → change code → re-sample → compare" an apples-to-apples
   * comparison instead of mixing the before-traffic into the after numbers.
   */
  compareToSnapshot(): BeforeAfterComparison | null {
    if (!this._snapshot) return null;
    const cutoff = this._snapshotAt ?? 0;
    const afterSamples = this.buf.filter((s) => Date.parse(s.at) > cutoff);
    const after = this.summarizeSamples(afterSamples);
    const afterByOp = this.summarizeWindowByOp(afterSamples);
    return {
      before: this._snapshot,
      after: {
        label: 'after (since baseline)',
        takenAt: new Date().toISOString(),
        sampleCount: afterSamples.length,
        summary: after,
        byOp: afterByOp,
      },
      delta: {
        totalRu: delta(this._snapshot.summary.totalRu, after.totalRu),
        avgRu: delta(this._snapshot.summary.avgRu, after.avgRu),
        maxRu: delta(this._snapshot.summary.maxRu, after.maxRu),
        avgDurationMs: delta(this._snapshot.summary.avgDurationMs, after.avgDurationMs),
        crossPartitionCount: delta(this._snapshot.summary.crossPartitionCount, after.crossPartitionCount),
        count: delta(this._snapshot.summary.count, after.count),
      },
    };
  }

  private summarizeWindowByOp(samples: QuerySample[]) {
    const byOpMap = new Map<string, { count: number; totalRu: number; maxRu: number; totalMs: number }>();
    for (const s of samples) {
      const ru = s.requestCharge ?? 0;
      const k = s.op;
      const a = byOpMap.get(k) ?? { count: 0, totalRu: 0, maxRu: 0, totalMs: 0 };
      a.count++;
      a.totalRu += ru;
      if (ru > a.maxRu) a.maxRu = ru;
      a.totalMs += s.durationMs;
      byOpMap.set(k, a);
    }
    return Array.from(byOpMap.entries())
      .map(([op, a]) => ({
        op,
        count: a.count,
        totalRu: round(a.totalRu),
        avgRu: a.count ? round(a.totalRu / a.count) : 0,
        maxRu: round(a.maxRu),
        avgDurationMs: a.count ? round(a.totalMs / a.count) : 0,
      }))
      .sort((x, y) => y.totalRu - x.totalRu);
  }

  /**
   * Aggregate samples whose timestamp falls in the last `windowMinutes`,
   * bucketed by `op`. Used by the Azure-side comparison route.
   */
  summarizeWindow(windowMinutes: number) {
    const cutoff = Date.now() - windowMinutes * 60_000;
    const inWindow = this.buf.filter((s) => Date.parse(s.at) >= cutoff);
    const byOpMap = new Map<string, { count: number; totalRu: number; maxRu: number; totalMs: number }>();
    let count = 0;
    let totalRu = 0;
    let maxRu = 0;
    for (const s of inWindow) {
      const ru = s.requestCharge ?? 0;
      count++;
      totalRu += ru;
      if (ru > maxRu) maxRu = ru;
      const k = s.op;
      const a = byOpMap.get(k) ?? { count: 0, totalRu: 0, maxRu: 0, totalMs: 0 };
      a.count++;
      a.totalRu += ru;
      if (ru > a.maxRu) a.maxRu = ru;
      a.totalMs += s.durationMs;
      byOpMap.set(k, a);
    }
    const byOp = Array.from(byOpMap.entries())
      .map(([op, a]) => ({
        op,
        count: a.count,
        totalRu: round(a.totalRu),
        avgRu: a.count ? round(a.totalRu / a.count) : 0,
        maxRu: round(a.maxRu),
        avgDurationMs: a.count ? round(a.totalMs / a.count) : 0,
      }))
      .sort((x, y) => y.totalRu - x.totalRu);
    return {
      count,
      totalRu: round(totalRu),
      avgRu: count ? round(totalRu / count) : 0,
      maxRu: round(maxRu),
      byOp,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function delta(before: number, after: number): { before: number; after: number; change: number; pct: number | null } {
  return {
    before: round(before),
    after: round(after),
    change: round(after - before),
    pct: before !== 0 ? round(((after - before) / before) * 100) : null,
  };
}

export interface TelemetrySnapshot {
  label: string;
  takenAt: string;
  sampleCount: number;
  summary: ReturnType<Telemetry['summary']>;
  byOp: Array<{ op: string; count: number; totalRu: number; avgRu: number; maxRu: number; avgDurationMs: number }>;
}

export interface DeltaField {
  before: number;
  after: number;
  change: number;
  pct: number | null;
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

export const telemetry = new Telemetry();
