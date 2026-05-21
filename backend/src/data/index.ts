import { logger } from '../lib/logger';
import { CosmosEntityStore } from './cosmosStore';
import { Repositories } from './repositories';
import { EntityStore } from './store';

let repos: Repositories | null = null;
let store: EntityStore | null = null;
let initPromise: Promise<Repositories> | null = null;

export async function getRepositories(): Promise<Repositories> {
  if (repos) return repos;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    logger.info('using Cosmos DB store');
    const localStore = new CosmosEntityStore();
    await localStore.init();
    store = localStore;
    repos = new Repositories(localStore);
    return repos;
  })();
  try {
    return await initPromise;
  } finally {
    // Keep initPromise set on success (cheap to re-await); only clear on failure
    // so the next call retries instead of getting a rejected promise forever.
    if (!repos) initPromise = null;
  }
}

export function _resetForTests() {
  repos = null;
  store = null;
  initPromise = null;
}

export function _getStoreForTests(): EntityStore | null {
  return store;
}
