@description('Principal id of the managed identity to grant monitoring read access.')
param principalId string

@description('Name of the existing Log Analytics workspace.')
param logAnalyticsWorkspaceName string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

// Monitoring Reader — read metrics across the resource group (Cosmos RU/latency).
var monitoringReaderRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05')

// Log Analytics Reader — run KQL queries against the workspace.
var logAnalyticsReaderRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '73c42c96-874c-492b-b04d-ab87d138a893')

resource monitoringReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, principalId, monitoringReaderRoleId)
  properties: {
    roleDefinitionId: monitoringReaderRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource logAnalyticsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(logAnalytics.id, principalId, logAnalyticsReaderRoleId)
  scope: logAnalytics
  properties: {
    roleDefinitionId: logAnalyticsReaderRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
