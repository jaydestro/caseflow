@description('Name of the existing Azure Container Registry.')
param registryName string

@description('Principal id to grant AcrPull.')
param principalId string

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}

// AcrPull role definition id.
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, principalId, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
