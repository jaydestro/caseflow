import { AnyEntity } from '../models/entities';

export interface SqlQuerySpec {
  query: string;
  parameters: Array<{ name: string; value: unknown }>;
}

export interface EntityStore {
  init(): Promise<void>;
  get<T extends AnyEntity>(id: string): Promise<T | undefined>;
  upsert<T extends AnyEntity>(doc: T): Promise<T>;
  query<T extends AnyEntity>(spec: SqlQuerySpec): Promise<T[]>;
}
