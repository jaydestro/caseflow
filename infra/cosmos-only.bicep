targetScope = 'resourceGroup'

@description('Location for the Cosmos DB account.')
param location string

@description('Globally unique Cosmos DB account name.')
param accountName string

@description('Entra object ID of the developer or managed identity granted Cosmos DB data access.')
@minLength(36)
@maxLength(36)
param principalId string

@description('SQL database name.')
param databaseName string = 'caseflow'

@description('Container name.')
param containerName string = 'entities'

@description('Container autoscale maximum RU/s, in increments of 1000.')
@minValue(1000)
param maxThroughput int = 1000

module cosmos './modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    accountName: accountName
    location: location
    databaseName: databaseName
    containerName: containerName
    maxThroughput: maxThroughput
    appPrincipalId: principalId
  }
}

output endpoint string = cosmos.outputs.endpoint
output databaseName string = cosmos.outputs.databaseName
output containerName string = cosmos.outputs.containerName
