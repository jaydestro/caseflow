import {
  Container,
  CosmosClient,
  SqlQuerySpec as CosmosSqlQuerySpec,
} from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { telemetry } from '../lib/telemetry';
import { AnyEntity } from '../models/entities';
import { EntityStore, SqlQuerySpec } from './store';

// Well-known Cosmos DB Emulator key. Safe to commit because the emulator only
// accepts this key by design — it's documented on learn.microsoft.com.
// We fall back to it so local dev "just works" even if .env is missing.
const EMULATOR_KEY =
  'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';

export class CosmosEntityStore implements EntityStore {
  private client: CosmosClient;
  private container!: Container;

  constructor() {
    // Read the package version off disk so the User-Agent string shows up
    // nicely in Cosmos diagnostics. Done once at construction, so the cost is
    // paid up front and never again.
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };

    if (config.cosmos.useEntra) {
      // Entra ID RBAC auth — uses DefaultAzureCredential which chains through
      // managed identity, az CLI, VS Code, etc. The identity must be assigned
      // the Cosmos DB Built-in Data Contributor role on the account.
      const credential = new DefaultAzureCredential();
      this.client = new CosmosClient({
        endpoint: config.cosmos.endpoint,
        aadCredentials: credential,
        userAgentSuffix: `caseflow/${pkg.version}`,
        consistencyLevel: 'Session',
        connectionPolicy: { requestTimeout: 60000 },
      });
      logger.info('Cosmos client using Entra ID (DefaultAzureCredential)');
    } else if (config.cosmos.connectionString) {
      this.client = new CosmosClient(config.cosmos.connectionString);
    } else {
      const key = config.cosmos.key || EMULATOR_KEY;
      this.client = new CosmosClient({
        endpoint: config.cosmos.endpoint,
        key,
        userAgentSuffix: `caseflow/${pkg.version}`,
        consistencyLevel: 'Session',
        connectionPolicy: { requestTimeout: 60000 },
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
    } catch (err) {
      const e = err as { code?: number; requestCharge?: number };
      if (e.code === 404) {
        telemetry.record({
          op: 'point-read',
          store: 'cosmos',
          query: `point read id=${id}`,
          itemCount: 0,
          durationMs: Date.now() - start,
          requestCharge: e.requestCharge ?? 0,
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

    const iter = this.container.items.query<T>(
      spec as CosmosSqlQuerySpec,
      { maxItemCount: -1 },
    );
    const out: T[] = [];
    let charge = 0;
    while (iter.hasMoreResults()) {
      const page = await iter.fetchNext();
      if (page.resources?.length) out.push(...page.resources);
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
