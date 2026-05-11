import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined) return def;
  return /^(1|true|yes|on)$/i.test(v);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  useInMemoryStore: bool(process.env.USE_IN_MEMORY_STORE, true),
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT ?? '',
    key: process.env.COSMOS_KEY ?? '',
    connectionString: process.env.COSMOS_CONNECTION_STRING ?? '',
    database: process.env.COSMOS_DATABASE ?? 'caseflow',
    container: process.env.COSMOS_CONTAINER ?? 'entities',
  },
};

// Cosmos DB Emulator uses a self-signed cert. Trust it for local dev only.
const target = `${config.cosmos.endpoint} ${config.cosmos.connectionString}`;
if (target.includes('localhost') || target.includes('127.0.0.1')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
