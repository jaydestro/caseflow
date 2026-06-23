@description('Log Analytics workspace name.')
param name string

@description('Location for the workspace.')
param location string = resourceGroup().location

@description('Tags to apply.')
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

output id string = workspace.id
output name string = workspace.name
output customerId string = workspace.properties.customerId
