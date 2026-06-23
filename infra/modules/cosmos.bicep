@description('Cosmos DB account name (globally unique, lowercase).')
param accountName string

@description('Location for the account.')
param location string = resourceGroup().location

@description('Tags to apply.')
param tags object = {}

@description('SQL database name.')
param databaseName string = 'caseflow'

@description('Container name.')
param containerName string = 'entities'

@description('Autoscale max RU/s on the container.')
param maxThroughput int = 1000

@description('Principal id of the app managed identity (granted data-plane Data Contributor).')
param appPrincipalId string

@description('Optional principal id of the deploying user (granted data-plane Data Contributor for local debugging).')
param userPrincipalId string = ''

// Cosmos DB built-in data-plane role: "Cosmos DB Built-in Data Contributor".
var dataContributorRoleDefId = '00000000-0000-0000-0000-000000000002'

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Enforce Entra-only auth — no account keys are usable.
    disableLocalAuth: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: []
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: account
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// NOTE: partition key is intentionally /id for the CaseFlow demo (a deliberate
// anti-pattern used to tell the "diagnose & fix with an AI agent" story).
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
    options: {
      autoscaleSettings: {
        maxThroughput: maxThroughput
      }
    }
  }
}

resource appDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: account
  name: guid(account.id, appPrincipalId, dataContributorRoleDefId)
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefId}'
    principalId: appPrincipalId
    scope: account.id
  }
}

resource userDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = if (!empty(userPrincipalId)) {
  parent: account
  name: guid(account.id, userPrincipalId, dataContributorRoleDefId)
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefId}'
    principalId: userPrincipalId
    scope: account.id
  }
}

output endpoint string = account.properties.documentEndpoint
output accountName string = account.name
output databaseName string = databaseName
output containerName string = containerName
