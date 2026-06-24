#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-cicd.sh — One-time setup for the CaseFlow GitHub Actions CI/CD pipeline
#
# Wires GitHub Actions to Azure using OIDC federated credentials (no stored
# secrets). It runs `azd pipeline config`, which:
#   - creates a deploy identity (user-assigned managed identity / app registration),
#   - registers the OIDC federated credentials for this repo,
#   - assigns the subscription RBAC azd needs to provision, and
#   - populates the GitHub Actions *variables* the deploy job reads
#     (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
#      AZURE_ENV_NAME, AZURE_LOCATION).
#
# After this runs, every push to `main` provisions and deploys automatically
# via .github/workflows/ci-cd.yml.
#
# Usage (from the repo root):
#   ./scripts/setup-cicd.sh
#
# Optional:
#   --env-name        <name>     azd environment name      (default: caseflow)
#   --location        <region>   Azure region              (default: eastus2)
#   --subscription-id <sub-id>   target subscription       (default: azd default)
#
# Prerequisites:
#   - Azure Developer CLI (azd)  -> azd auth login
#   - Azure CLI (az)             -> az login
#   - GitHub CLI (gh)            -> gh auth login
#   You must have permission to create role assignments in the subscription.
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- defaults ----
ENV_NAME="caseflow"
LOCATION="eastus2"
SUBSCRIPTION_ID=""

# ---- parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-name)        ENV_NAME="$2";        shift 2 ;;
    --location)        LOCATION="$2";        shift 2 ;;
    --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ---- check prerequisites ----
require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Error: required tool '$1' not found. $2"; exit 1; }
}

echo "==> Checking prerequisites..."
require azd "Install the Azure Developer CLI: https://aka.ms/azd-install"
require az  "Install the Azure CLI: https://aka.ms/install-azure-cli"
require gh  "Install the GitHub CLI: https://cli.github.com/"

REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$REMOTE" ]]; then
  echo "Error: no 'origin' git remote found. Run this from the repo root."
  exit 1
fi
OWNER="$(sed -nE 's#^.*github\.com[:/]([^/]+)/[^/]+(\.git)?$#\1#p' <<<"$REMOTE")"
OWNER_TYPE=""
if [[ -n "$OWNER" ]]; then
  OWNER_TYPE="$(gh api "users/$OWNER" --jq .type 2>/dev/null || true)"
fi
CURRENT_TENANT_ID="$(az account show --query tenantId -o tsv 2>/dev/null || true)"
echo "    Repo remote   : $REMOTE"
echo "    Environment   : $ENV_NAME"
echo "    Location      : $LOCATION"
echo ""

if [[ "$CURRENT_TENANT_ID" == "72f988bf-86f1-41af-91ab-2d7cd011db47" && "$OWNER_TYPE" == "User" ]]; then
  echo "Error: Azure tenant '$CURRENT_TENANT_ID' requires a non-empty GitHub enterprise OIDC claim."
  echo "       Personal-account repositories like '$OWNER' emit an empty enterprise claim, so deploys fail"
  echo "       with AADSTS7002381. Re-run this script while logged into a personal or otherwise"
  echo "       non-restricted Azure tenant, then refresh AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_SUBSCRIPTION_ID."
  exit 1
fi

# ---- select / create the azd environment ----
echo "==> Selecting azd environment '$ENV_NAME'..."
if azd env list --output json 2>/dev/null | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"$ENV_NAME\""; then
  azd env select "$ENV_NAME"
else
  azd env new "$ENV_NAME" --location "$LOCATION" >/dev/null
  if [[ -n "$SUBSCRIPTION_ID" ]]; then
    azd env set AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID" --environment "$ENV_NAME" >/dev/null
  fi
fi
echo ""

# ---- run pipeline config ----
echo "==> Running 'azd pipeline config' (federated / OIDC, GitHub provider)..."
echo "    This creates the deploy identity, federated credentials, RBAC, and repo variables."
echo ""
azd pipeline config --provider github --auth-type federated

# ---- verify variables ----
echo ""
echo "==> Verifying GitHub Actions variables..."
gh variable list || {
  echo "    Could not list variables automatically."
  echo "    Check them under: Settings > Secrets and variables > Actions > Variables"
}

echo ""
echo "==> Done. Push to 'main' to trigger a provision + deploy."
echo "    Pipeline: .github/workflows/ci-cd.yml"
