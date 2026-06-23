@description('Container app name.')
param name string

@description('Location for the app.')
param location string = resourceGroup().location

@description('Base tags. The azd-service-name tag is added automatically.')
param tags object = {}

@description('azd service name this app maps to (must match azure.yaml).')
param serviceName string

@description('Resource id of the Container Apps managed environment.')
param containerAppsEnvironmentId string

@description('Resource id of the user-assigned managed identity used for ACR pull and data access.')
param userAssignedIdentityId string

@description('ACR login server (e.g. myregistry.azurecr.io).')
param containerRegistryLoginServer string

@description('Whether ingress is external (internet-facing).')
param external bool = true

@description('Container port the app listens on.')
param targetPort int

@description('Container image. Defaults to a public placeholder for first provision; azd replaces it on deploy.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Environment variables for the container.')
param env array = []

@description('CPU cores.')
param cpu string = '0.5'

@description('Memory.')
param memory string = '1.0Gi'

@description('Minimum replicas.')
param minReplicas int = 1

@description('Maximum replicas.')
param maxReplicas int = 2

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, {
    'azd-service-name': serviceName
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: external
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: containerRegistryLoginServer
          identity: userAssignedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: serviceName
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: env
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output id string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
output uri string = 'https://${app.properties.configuration.ingress.fqdn}'
