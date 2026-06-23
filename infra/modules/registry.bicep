@description('Azure Container Registry name (alphanumeric, globally unique).')
param name string

@description('Location for the registry.')
param location string = resourceGroup().location

@description('Tags to apply.')
param tags object = {}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    // Passwordless: pulls happen via managed identity (AcrPull), never admin keys.
    adminUserEnabled: false
    anonymousPullEnabled: false
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
