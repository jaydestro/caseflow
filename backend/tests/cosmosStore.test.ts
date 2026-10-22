import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const container = { read: vi.fn() };
  const database = {
    read: vi.fn(),
    container: vi.fn(() => container),
    containers: { createIfNotExists: vi.fn() },
  };
  return {
    container,
    database,
    client: {
      database: vi.fn(() => database),
      databases: { createIfNotExists: vi.fn() },
    },
    config: {
      cosmos: {
        endpoint: 'https://example.documents.azure.com',
        database: 'caseflow',
        container: 'entities',
        useEntra: true,
        connectionString: '',
        key: 'test-key',
      },
    },
  };
});

vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn(function () { return mocks.client; }),
}));
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(function () {}),
}));
vi.mock('../src/lib/config', () => ({ config: mocks.config }));

import { CosmosEntityStore } from '../src/data/cosmosStore';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.cosmos.useEntra = true;
  mocks.database.read.mockResolvedValue({});
  mocks.container.read.mockResolvedValue({});
  mocks.client.databases.createIfNotExists.mockResolvedValue({ database: mocks.database });
  mocks.database.containers.createIfNotExists.mockResolvedValue({ container: mocks.container });
});

describe('Cosmos store initialization', () => {
  it('opens provisioned resources without attempting Entra management operations', async () => {
    await new CosmosEntityStore().init();
    expect(mocks.client.database).toHaveBeenCalledWith('caseflow');
    expect(mocks.database.read).toHaveBeenCalledOnce();
    expect(mocks.database.container).toHaveBeenCalledWith('entities');
    expect(mocks.container.read).toHaveBeenCalledOnce();
    expect(mocks.client.databases.createIfNotExists).not.toHaveBeenCalled();
    expect(mocks.database.containers.createIfNotExists).not.toHaveBeenCalled();
  });

  it('preserves automatic resource creation for emulator/key authentication', async () => {
    mocks.config.cosmos.useEntra = false;
    await new CosmosEntityStore().init();
    expect(mocks.client.databases.createIfNotExists).toHaveBeenCalledWith({ id: 'caseflow' });
    expect(mocks.database.containers.createIfNotExists).toHaveBeenCalledWith({
      id: 'entities',
      partitionKey: { paths: ['/id'] },
    });
    expect(mocks.database.read).not.toHaveBeenCalled();
  });

  it('surfaces missing resources instead of falling back to provisioning', async () => {
    const error = new Error('container not found');
    mocks.container.read.mockRejectedValueOnce(error);
    await expect(new CosmosEntityStore().init()).rejects.toThrow(error);
    expect(mocks.database.containers.createIfNotExists).not.toHaveBeenCalled();
  });
});
