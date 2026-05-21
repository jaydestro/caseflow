#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-cosmos-rbac.sh — Assign Cosmos DB RBAC roles for Entra ID auth
#
# Creates a Cosmos DB for NoSQL account (if it doesn't exist) and assigns
# the built-in "Data Contributor" role to a principal so the app can
# authenticate with DefaultAzureCredential instead of master keys.
#
# Usage:
#   ./scripts/setup-cosmos-rbac.sh \
#     --resource-group  <rg>            \
#     --account-name    <cosmos-acct>   \
#     --principal-id    <object-id>     (Entra object ID of user/SP/MI)
#
# Optional:
#     --location        <region>        (default: eastus)
#     --create-account                  (create the Cosmos DB account if missing)
#
# Prerequisites:
#   - az CLI logged in (az login)
#   - The caller must have Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments/write
#     permission on the Cosmos DB account (typically "Cosmos DB Account Reader Role" or
#     a custom role, NOT the data-plane contributor role itself).
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- defaults ----
LOCATION="eastus"
CREATE_ACCOUNT=false

# ---- parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)  RESOURCE_GROUP="$2";  shift 2 ;;
    --account-name)    ACCOUNT_NAME="$2";    shift 2 ;;
    --principal-id)    PRINCIPAL_ID="$2";    shift 2 ;;
    --location)        LOCATION="$2";       shift 2 ;;
    --create-account)  CREATE_ACCOUNT=true;  shift   ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "${RESOURCE_GROUP:-}" || -z "${ACCOUNT_NAME:-}" || -z "${PRINCIPAL_ID:-}" ]]; then
  echo "Error: --resource-group, --account-name, and --principal-id are required."
  exit 1
fi

# ---- Cosmos DB Built-in Role IDs (NoSQL API) ----
# These are fixed, well-known GUIDs defined by the service.
DATA_READER="00000000-0000-0000-0000-000000000001"
DATA_CONTRIBUTOR="00000000-0000-0000-0000-000000000002"

echo "==> Resource Group : $RESOURCE_GROUP"
echo "==> Account        : $ACCOUNT_NAME"
echo "==> Principal ID   : $PRINCIPAL_ID"
echo "==> Location        : $LOCATION"
echo ""

# ---- Ensure resource group exists ----
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none 2>/dev/null || true

# ---- Optionally create the Cosmos DB account ----
if $CREATE_ACCOUNT; then
  echo "==> Creating Cosmos DB account (serverless, Session consistency, local auth disabled)..."
  az cosmosdb create \
    --name "$ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --locations regionName="$LOCATION" failoverPriority=0 \
    --capabilities EnableServerless \
    --default-consistency-level Session \
    --kind GlobalDocumentDB \
    --disable-local-auth true \
    --output none
  echo "    Account created."
fi

# ---- Get the Cosmos DB account scope ----
ACCOUNT_ID=$(az cosmosdb show \
  --name "$ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query id --output tsv)

echo "==> Account ID: $ACCOUNT_ID"

# ---- Create the database and container (idempotent) ----
echo "==> Ensuring database 'caseflow' and container 'entities' exist..."
az cosmosdb sql database create \
  --account-name "$ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name caseflow \
  --output none 2>/dev/null || true

az cosmosdb sql container create \
  --account-name "$ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name caseflow \
  --name entities \
  --partition-key-path "/id" \
  --output none 2>/dev/null || true

# ---- Assign the Data Contributor role ----
# Uses a deterministic assignment ID based on the principal so re-runs are idempotent.
ROLE_ASSIGNMENT_ID=$(python3 -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, '${PRINCIPAL_ID}-${DATA_CONTRIBUTOR}'))" 2>/dev/null \
  || powershell -Command "[guid]::NewGuid().ToString()" )

echo "==> Assigning Cosmos DB Built-in Data Contributor role..."
az cosmosdb sql role assignment create \
  --account-name "$ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --role-definition-id "$DATA_CONTRIBUTOR" \
  --principal-id "$PRINCIPAL_ID" \
  --scope "$ACCOUNT_ID" \
  --output none 2>/dev/null && echo "    Role assigned." || echo "    Role assignment already exists (or insufficient permissions)."

# ---- Print the endpoint for .env ----
ENDPOINT=$(az cosmosdb show \
  --name "$ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query documentEndpoint --output tsv)

echo ""
echo "==> Done! Add these to your backend/.env to use Entra auth:"
echo ""
echo "COSMOS_ENDPOINT=$ENDPOINT"
echo "COSMOS_KEY="
echo "COSMOS_USE_ENTRA=true"
echo "COSMOS_DATABASE=caseflow"
echo "COSMOS_CONTAINER=entities"
