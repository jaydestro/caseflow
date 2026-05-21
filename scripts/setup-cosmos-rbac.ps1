<#
.SYNOPSIS
  Assign Cosmos DB RBAC roles for Entra ID auth.

.DESCRIPTION
  Creates a Cosmos DB for NoSQL account (optionally) and assigns the built-in
  "Data Contributor" role to a principal so the app can authenticate with
  DefaultAzureCredential instead of master keys.

.PARAMETER ResourceGroup
  Azure resource group name.

.PARAMETER AccountName
  Cosmos DB account name.

.PARAMETER PrincipalId
  Entra object ID of the user, service principal, or managed identity.

.PARAMETER Location
  Azure region (default: eastus).

.PARAMETER CreateAccount
  If set, creates the Cosmos DB account if it doesn't exist.

.EXAMPLE
  .\setup-cosmos-rbac.ps1 -ResourceGroup myRg -AccountName myCosmosAcct -PrincipalId "00000000-..."
#>
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [Parameter(Mandatory)][string]$AccountName,
    [Parameter(Mandatory)][string]$PrincipalId,
    [string]$Location = "eastus",
    [switch]$CreateAccount
)

$ErrorActionPreference = "Stop"

# Cosmos DB Built-in Role IDs (NoSQL API) — fixed, well-known GUIDs
$DATA_READER      = "00000000-0000-0000-0000-000000000001"
$DATA_CONTRIBUTOR = "00000000-0000-0000-0000-000000000002"

Write-Host "==> Resource Group : $ResourceGroup"
Write-Host "==> Account        : $AccountName"
Write-Host "==> Principal ID   : $PrincipalId"
Write-Host "==> Location       : $Location"
Write-Host ""

# Ensure resource group exists
Write-Host "==> Ensuring resource group exists..."
az group create --name $ResourceGroup --location $Location --output none 2>$null

# Optionally create the Cosmos DB account
if ($CreateAccount) {
    Write-Host "==> Creating Cosmos DB account (serverless, Session consistency, local auth disabled)..."
    az cosmosdb create `
        --name $AccountName `
        --resource-group $ResourceGroup `
        --locations regionName=$Location failoverPriority=0 `
        --capabilities EnableServerless `
        --default-consistency-level Session `
        --kind GlobalDocumentDB `
        --disable-local-auth true `
        --output none
    if ($LASTEXITCODE -ne 0) { throw "Cosmos DB account create failed (exit $LASTEXITCODE)." }
    Write-Host "    Account created."
}

# Get the account resource ID
$AccountId = az cosmosdb show `
    --name $AccountName `
    --resource-group $ResourceGroup `
    --query id --output tsv

Write-Host "==> Account ID: $AccountId"

# Ensure database and container exist
Write-Host "==> Ensuring database 'caseflow' and container 'entities' exist..."
az cosmosdb sql database create `
    --account-name $AccountName `
    --resource-group $ResourceGroup `
    --name caseflow `
    --output none 2>$null

az cosmosdb sql container create `
    --account-name $AccountName `
    --resource-group $ResourceGroup `
    --database-name caseflow `
    --name entities `
    --partition-key-path "/id" `
    --output none 2>$null

# Assign the Data Contributor role
Write-Host "==> Assigning Cosmos DB Built-in Data Contributor role..."
try {
    az cosmosdb sql role assignment create `
        --account-name $AccountName `
        --resource-group $ResourceGroup `
        --role-definition-id $DATA_CONTRIBUTOR `
        --principal-id $PrincipalId `
        --scope $AccountId `
        --output none
    Write-Host "    Role assigned."
} catch {
    Write-Host "    Role assignment may already exist: $_"
}

# Print the endpoint for .env
$Endpoint = az cosmosdb show `
    --name $AccountName `
    --resource-group $ResourceGroup `
    --query documentEndpoint --output tsv

Write-Host ""
Write-Host "==> Done! Add these to your backend/.env to use Entra auth:"
Write-Host ""
Write-Host "COSMOS_ENDPOINT=$Endpoint"
Write-Host "COSMOS_KEY="
Write-Host "COSMOS_USE_ENTRA=true"
Write-Host "COSMOS_DATABASE=caseflow"
Write-Host "COSMOS_CONTAINER=entities"
