import { Container, CosmosClient } from '@azure/cosmos';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { telemetry } from '../lib/telemetry';
import { AnyEntity } from '../models/entities';
import { EntityStore, SqlQuerySpec } from './store';

export class CosmosEntityStore implements EntityStore {
  private client: CosmosClient;
  private container!: Container;

  constructor() {
    if (config.cosmos.connectionString) {
      this.client = new CosmosClient(config.cosmos.connectionString);
    } else {
      this.client = new CosmosClient({
        endpoint: config.cosmos.endpoint,
        key: config.cosmos.key,
      });
    }
  }

  async init(): Promise<void> {
    const { database } = await this.client.databases.createIfNotExists({
      id: config.cosmos.database,
    });
    const { container } = await database.containers.createIfNotExists({
      id: config.cosmos.container,
      partitionKey: { paths: ['/id'] },
    });
    this.container = container;
    logger.info(
      { database: config.cosmos.database, container: config.cosmos.container },
      'Cosmos container ready',
    );
  }

  async get<T extends AnyEntity>(id: string): Promise<T | undefined> {
    const start = Date.now();
    try {
      const resp = await this.container.item(id, id).read<T>();
      const item = resp.resource ?? undefined;
      telemetry.record({
        op: 'point-read',
        store: 'cosmos',
        query: `point read id=${id}`,
        itemCount: item ? 1 : 0,
        durationMs: Date.now() - start,
        requestCharge: resp.requestCharge ?? 0,
        crossPartition: false,
      });
      return item;
    } catch (err: any) {
      if (err?.code === 404) {
        telemetry.record({
          op: 'point-read',
          store: 'cosmos',
          query: `point read id=${id}`,
          itemCount: 0,
          durationMs: Date.now() - start,
          requestCharge: err?.requestCharge ?? 0,
          crossPartition: false,
          notes: '404',
        });
        return undefined;
      }
      throw err;
    }
  }

  async upsert<T extends AnyEntity>(doc: T): Promise<T> {
    const start = Date.now();
    const resp = await this.container.items.upsert<T>(doc);
    telemetry.record({
      op: 'upsert',
      store: 'cosmos',
      query: `upsert id=${doc.id} type=${doc.type}`,
      itemCount: 1,
      durationMs: Date.now() - start,
      requestCharge: resp.requestCharge ?? 0,
      crossPartition: false,
    });
    return (resp.resource as T) ?? doc;
  }

  async query<T extends AnyEntity>(spec: SqlQuerySpec): Promise<T[]> {
    const start = Date.now();
    // Container is partitioned on /id. Any query that doesn't filter by c.id
    // fans out across every logical partition.
    const sql = spec.query ?? '';
    const crossPartition = !/\bc\.id\s*=/.test(sql);

    const iter = this.container.items.query<T>(spec as any, { maxItemCount: -1 });
    const out: T[] = [];
    let charge = 0;
    while (iter.hasMoreResults()) {
      const page = await iter.fetchNext();
      if (page.resources) out.push(...page.resources);
      charge += page.requestCharge ?? 0;
    }
    telemetry.record({
      op: 'query',
      store: 'cosmos',
      query: sql,
      parameters: spec.parameters,
      itemCount: out.length,
      durationMs: Date.now() - start,
      requestCharge: charge,
      crossPartition,
      notes: crossPartition ? 'cross-partition (no c.id filter)' : undefined,
    });
    return out;
  }
}
