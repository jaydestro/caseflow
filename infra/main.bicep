targetScope = 'subscription'

// ---------------------------------------------------------------------------
// CaseFlow — Azure deployment (azd + Bicep)
// Container Apps (api + web) | Cosmos DB for NoSQL | ACR | user-assigned MI
// All data-plane access is passwordless via Entra ID managed identity.
// ---------------------------------------------------------------------------

@minLength(1)
@maxLength(64)
@description('Name of the azd environment — used to derive resource names and tags.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Object id of the user/principal running the deployment. Granted Cosmos data access for local debugging. Provided automatically by azd.')
param principalId string = ''

@description('Provisioned autoscale max RU/s on the Cosmos container.')
param cosmosMaxThroughput int = 1000

// Stable, unique-ish token for globally-unique resource names.
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    name: 'log-${resourceToken}'
    location: location
    tags: tags
  }
}

module identity './modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: {
    name: 'id-${resourceToken}'
    location: location
    tags: tags
  }
}

module registry './modules/registry.bicep' = {
  name: 'registry'
  scope: rg
  params: {
    name: 'acr${resourceToken}'
    location: location
    tags: tags
  }
}

module cosmos './modules/cosmos.bicep' = {
  name: 'cosmos'
  scope: rg
  params: {
    accountName: 'cosmos-${resourceToken}'
    location: location
    tags: tags
    databaseName: 'caseflow'
    containerName: 'entities'
    maxThroughput: cosmosMaxThroughput
    appPrincipalId: identity.outputs.principalId
    userPrincipalId: principalId
  }
}

module containerEnv './modules/container-apps-env.bicep' = {
  name: 'container-apps-env'
  scope: rg
  params: {
    name: 'cae-${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceName: monitoring.outputs.name
  }
}

// Let the shared identity pull images from ACR (deployed before the apps).
module acrPull './modules/acr-pull-role.bicep' = {
  name: 'acr-pull-role'
  scope: rg
  params: {
    registryName: registry.outputs.name
    principalId: identity.outputs.principalId
  }
}

// Let the shared identity read Azure Monitor / Log Analytics for the
// Diagnostics page (live RU + latency metrics).
module monitorRoles './modules/monitor-roles.bicep' = {
  name: 'monitor-roles'
  scope: rg
  params: {
    principalId: identity.outputs.principalId
    logAnalyticsWorkspaceName: monitoring.outputs.name
  }
}

// --- Backend (internal ingress) -------------------------------------------
module api './modules/container-app.bicep' = {
  name: 'api'
  scope: rg
  params: {
    name: 'ca-api-${resourceToken}'
    location: location
    tags: tags
    serviceName: 'api'
    containerAppsEnvironmentId: containerEnv.outputs.id
    userAssignedIdentityId: identity.outputs.id
    containerRegistryLoginServer: registry.outputs.loginServer
    external: false
    targetPort: 4000
    env: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'PORT', value: '4000' }
      { name: 'COSMOS_ENDPOINT', value: cosmos.outputs.endpoint }
      { name: 'COSMOS_USE_ENTRA', value: 'true' }
      { name: 'COSMOS_DATABASE', value: cosmos.outputs.databaseName }
      { name: 'COSMOS_CONTAINER', value: cosmos.outputs.containerName }
      { name: 'COSMOS_ACCOUNT_NAME', value: cosmos.outputs.accountName }
      { name: 'CONTAINER_RUS', value: string(cosmosMaxThroughput) }
      { name: 'AZURE_CLIENT_ID', value: identity.outputs.clientId }
      { name: 'AZURE_TENANT_ID', value: subscription().tenantId }
      { name: 'AZURE_SUBSCRIPTION_ID', value: subscription().subscriptionId }
      { name: 'AZURE_RESOURCE_GROUP', value: rg.name }
      { name: 'LOG_ANALYTICS_WORKSPACE_ID', value: monitoring.outputs.customerId }
      { name: 'LOG_ANALYTICS_WORKSPACE_NAME', value: monitoring.outputs.name }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

// --- Frontend (external ingress, nginx -> /api proxy) ----------------------
module web './modules/container-app.bicep' = {
  name: 'web'
  scope: rg
  params: {
    name: 'ca-web-${resourceToken}'
    location: location
    tags: tags
    serviceName: 'web'
    containerAppsEnvironmentId: containerEnv.outputs.id
    userAssignedIdentityId: identity.outputs.id
    containerRegistryLoginServer: registry.outputs.loginServer
    external: true
    targetPort: 80
    env: [
      { name: 'BACKEND_URL', value: api.outputs.uri }
      { name: 'BACKEND_HOST', value: api.outputs.fqdn }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

// --- Outputs (consumed by azd) --------------------------------------------
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.name
output AZURE_COSMOS_ENDPOINT string = cosmos.outputs.endpoint
output SERVICE_API_NAME string = api.outputs.name
output SERVICE_WEB_NAME string = web.outputs.name
output SERVICE_WEB_URI string = web.outputs.uri
output WEB_BASE_URL string = web.outputs.uri
