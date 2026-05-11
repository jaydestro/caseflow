import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { CosmosEntityStore } from './cosmosStore';
import { InMemoryEntityStore } from './memoryStore';
import { Repositories } from './repositories';
import { EntityStore } from './store';

let repos: Repositories | null = null;
let store: EntityStore | null = null;

export async function getRepositories(): Promise<Repositories> {
  if (repos) return repos;
  if (config.useInMemoryStore) {
    logger.info('using in-memory store');
    store = new InMemoryEntityStore();
  } else {
    logger.info('using Cosmos DB store');
    store = new CosmosEntityStore();
  }
  await store.init();
  repos = new Repositories(store);
  return repos;
}

export function _resetForTests() {
  repos = null;
  store = null;
}

export function _getStoreForTests(): EntityStore | null {
  return store;
}
