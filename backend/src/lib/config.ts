import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT ?? '',
    key: process.env.COSMOS_KEY ?? '',
    connectionString: process.env.COSMOS_CONNECTION_STRING ?? '',
    database: process.env.COSMOS_DATABASE ?? 'caseflow',
    container: process.env.COSMOS_CONTAINER ?? 'entities',
    /** When true, use DefaultAzureCredential (Entra ID RBAC) instead of key auth */
    useEntra: process.env.COSMOS_USE_ENTRA === 'true',
  },
  /** Provisioned RU/s on the container — used by diagnostics to show budget utilisation */
  containerRUs: Number(process.env.CONTAINER_RUS ?? 10000),
  azure: {
    tenantId: process.env.AZURE_TENANT_ID ?? '',
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ?? '',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? '',
    cosmosAccount: process.env.COSMOS_ACCOUNT_NAME ?? '',
    /** Log Analytics workspace GUID (customerId), not the ARM resource id */
    logAnalyticsWorkspaceId: process.env.LOG_ANALYTICS_WORKSPACE_ID ?? '',
    logAnalyticsWorkspaceName: process.env.LOG_ANALYTICS_WORKSPACE_NAME ?? '',
  },
};

// Cosmos DB Emulator uses a self-signed cert. Trust it for local dev only.
const target = `${config.cosmos.endpoint} ${config.cosmos.connectionString}`;
if (target.includes('localhost') || target.includes('127.0.0.1')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
