<#
.SYNOPSIS
  One-time setup for the CaseFlow GitHub Actions CI/CD pipeline.

.DESCRIPTION
  Wires GitHub Actions to Azure using OIDC federated credentials (no stored
  secrets). It runs `azd pipeline config`, which:
    - creates a deploy identity (user-assigned managed identity / app registration),
    - registers the OIDC federated credentials for this repo,
    - assigns the subscription RBAC azd needs to provision, and
    - populates the GitHub Actions *variables* the deploy job reads
      (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
       AZURE_ENV_NAME, AZURE_LOCATION).

  After this runs, every push to `main` provisions and deploys automatically
  via .github/workflows/ci-cd.yml.

.PARAMETER EnvName
  azd environment name to configure (default: caseflow).

.PARAMETER Location
  Azure region for the azd environment (default: eastus2).

.PARAMETER SubscriptionId
  Azure subscription id to target. Optional; if omitted azd uses the current
  default subscription / prompts.

.EXAMPLE
  .\setup-cicd.ps1

.EXAMPLE
  .\setup-cicd.ps1 -EnvName caseflow -Location eastus2 -SubscriptionId 220fc532-...

.NOTES
  Prerequisites (run from the repo root):
    - Azure Developer CLI (azd)  -> azd auth login
    - Azure CLI (az)             -> az login
    - GitHub CLI (gh)            -> gh auth login
  You must have permission to create role assignments in the subscription.
#>
param(
    [string]$EnvName = "caseflow",
    [string]$Location = "eastus2",
    [string]$SubscriptionId
)

$ErrorActionPreference = "Stop"

function Assert-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool '$name' not found on PATH. $hint"
    }
}

Write-Host "==> Checking prerequisites..."
Assert-Command "azd" "Install the Azure Developer CLI: https://aka.ms/azd-install"
Assert-Command "az"  "Install the Azure CLI: https://aka.ms/install-azure-cli"
Assert-Command "gh"  "Install the GitHub CLI: https://cli.github.com/"

# Confirm we're inside a git repo with a GitHub remote.
$remote = (git remote get-url origin 2>$null)
if (-not $remote) { throw "No 'origin' git remote found. Run this from the repo root." }
Write-Host "    Repo remote   : $remote"
Write-Host "    Environment   : $EnvName"
Write-Host "    Location      : $Location"
Write-Host ""

# Select / create the azd environment so pipeline config targets the right one.
Write-Host "==> Selecting azd environment '$EnvName'..."
$envList = (azd env list --output json 2>$null | ConvertFrom-Json)
if (-not ($envList | Where-Object { $_.Name -eq $EnvName })) {
    azd env new $EnvName --location $Location | Out-Null
    if ($SubscriptionId) { azd env set AZURE_SUBSCRIPTION_ID $SubscriptionId --environment $EnvName | Out-Null }
} else {
    azd env select $EnvName
}

Write-Host ""
Write-Host "==> Running 'azd pipeline config' (federated / OIDC, GitHub provider)..."
Write-Host "    This creates the deploy identity, federated credentials, RBAC, and repo variables."
Write-Host ""
azd pipeline config --provider github --auth-type federated
if ($LASTEXITCODE -ne 0) { throw "azd pipeline config failed (exit $LASTEXITCODE)." }

Write-Host ""
Write-Host "==> Verifying GitHub Actions variables..."
try {
    gh variable list
} catch {
    Write-Host "    Could not list variables automatically: $_"
    Write-Host "    Check them under: Settings > Secrets and variables > Actions > Variables"
}

Write-Host ""
Write-Host "==> Done. Push to 'main' to trigger a provision + deploy."
Write-Host "    Pipeline: .github/workflows/ci-cd.yml"
