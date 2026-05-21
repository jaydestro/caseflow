<#
.SYNOPSIS
  Simulate 10 minutes of realistic CaseFlow workday traffic.
  Mix of reads (heavy), case creation, updates, comments, and dashboard views.
#>
param(
  [int]$DurationMinutes = 10,
  [string]$BaseUrl = "http://localhost:4000"
)

$ErrorActionPreference = "Continue"
$end = (Get-Date).AddMinutes($DurationMinutes)

# --- tenant / agent / customer pools ------------------------------------------
$tenants = @("tenant-contoso", "tenant-northwind", "tenant-fabrikam")

# Pre-fetch agents & customers per tenant
$agentMap = @{}
$customerMap = @{}
foreach ($t in $tenants) {
  $agentMap[$t] = @((Invoke-RestMethod "$BaseUrl/api/agents?tenantId=$t") | ForEach-Object { $_.id })
  $customerMap[$t] = @((Invoke-RestMethod "$BaseUrl/api/customers?tenantId=$t") | ForEach-Object { $_.id })
}

# Track created case IDs for updates/comments
$caseIds = @{}
foreach ($t in $tenants) { $caseIds[$t] = [System.Collections.Generic.List[string]]::new() }

# Pre-seed with existing cases
foreach ($t in $tenants) {
  $existing = Invoke-RestMethod "$BaseUrl/api/cases?tenantId=$t&limit=50"
  foreach ($c in $existing.items) { $caseIds[$t].Add($c.id) }
}

$subjects = @(
  "Login page returns 500 after password reset",
  "Cannot export CSV from reports dashboard",
  "Two-factor auth SMS not arriving",
  "Dark mode toggle breaks sidebar layout",
  "API rate limiting too aggressive for batch imports",
  "Calendar widget shows wrong timezone",
  "PDF invoices missing tax line items",
  "Search results not matching exact phrases",
  "Mobile app crashes on image upload",
  "Webhook delivery delayed by 30+ minutes",
  "SSO integration failing for Okta tenants",
  "Bulk delete not removing all selected items",
  "Email notifications contain broken links",
  "Dashboard charts blank on Safari",
  "File attachment size limit not enforced"
)

$commentBodies = @(
  "I've reproduced this on my end. Looking into the root cause now.",
  "Can you share the exact steps to reproduce? I'm seeing different behavior.",
  "Escalating to the backend team - this looks like a data layer issue.",
  "Applied a hotfix in staging. Could you verify when you get a chance?",
  "This is related to the migration we did last sprint. Checking the rollback plan.",
  "Customer confirmed the workaround is acceptable for now.",
  "Closing - root cause was an expired API key in the config.",
  "Reopening - customer reports the issue returned after the deploy.",
  "Attached the debug logs from the affected environment.",
  "This might be a duplicate of case #4421. Linking for reference."
)

$statuses = @("open", "pending", "resolved", "closed")
$priorities = @("low", "normal", "high", "urgent")

function Pick($arr) { $arr | Get-Random }
function PickTenant { Pick $tenants }

$ops = 0
$errCount = 0
$startTime = Get-Date

Write-Host "=== CaseFlow Traffic Generator ===" -ForegroundColor Cyan
Write-Host "Duration: $DurationMinutes minutes | End: $($end.ToString('HH:mm:ss'))"
Write-Host ""

while ((Get-Date) -lt $end) {
  $tenant = PickTenant
  $agents = $agentMap[$tenant]
  $customers = $customerMap[$tenant]

  # Weighted action selection — reads dominate a real workday
  $roll = Get-Random -Minimum 0 -Maximum 100
  try {
    if ($roll -lt 30) {
      # --- List cases (most common: dashboard refresh) ---
      $filter = ""
      if ((Get-Random -Max 3) -eq 0) { $filter = "&status=$(Pick $statuses)" }
      if ((Get-Random -Max 4) -eq 0) { $filter += "&priority=$(Pick $priorities)" }
      $null = Invoke-RestMethod "$BaseUrl/api/cases?tenantId=$tenant&limit=$(Get-Random -Min 10 -Max 50)$filter"
      $ops++
    }
    elseif ($roll -lt 45) {
      # --- Get case detail ---
      if ($caseIds[$tenant].Count -gt 0) {
        $cid = Pick $caseIds[$tenant]
        $null = Invoke-RestMethod "$BaseUrl/api/cases/$cid`?tenantId=$tenant"
        $ops++
      }
    }
    elseif ($roll -lt 55) {
      # --- Agent workload view ---
      $null = Invoke-RestMethod "$BaseUrl/api/cases/_/agent-workload?tenantId=$tenant"
      $ops++
    }
    elseif ($roll -lt 65) {
      # --- List tenants / agents / customers (directory lookups) ---
      $dirRoll = Get-Random -Max 3
      if ($dirRoll -eq 0) { $null = Invoke-RestMethod "$BaseUrl/api/tenants" }
      elseif ($dirRoll -eq 1) { $null = Invoke-RestMethod "$BaseUrl/api/agents?tenantId=$tenant" }
      else { $null = Invoke-RestMethod "$BaseUrl/api/customers?tenantId=$tenant" }
      $ops++
    }
    elseif ($roll -lt 78) {
      # --- Create a new case ---
      $body = @{
        tenantId = $tenant
        customerId = Pick $customers
        assignedAgentId = if ((Get-Random -Max 3) -ne 0) { Pick $agents } else { $null }
        subject = Pick $subjects
        description = "Reported via support portal. Customer impact: $(Pick @('low','medium','high')). Environment: $(Pick @('production','staging','dev'))."
        priority = Pick $priorities
      } | ConvertTo-Json
      $result = Invoke-RestMethod "$BaseUrl/api/cases" -Method POST -ContentType "application/json" -Body $body
      $caseIds[$tenant].Add($result.id)
      $ops++
    }
    elseif ($roll -lt 88) {
      # --- Update case (status change, reassign, priority change) ---
      if ($caseIds[$tenant].Count -gt 0) {
        $cid = Pick $caseIds[$tenant]
        $patch = @{ changedBy = Pick $agents }
        $updateRoll = Get-Random -Max 3
        if ($updateRoll -eq 0) { $patch.status = Pick $statuses }
        elseif ($updateRoll -eq 1) { $patch.priority = Pick $priorities }
        else { $patch.assignedAgentId = Pick $agents }
        $body = $patch | ConvertTo-Json
        $null = Invoke-RestMethod "$BaseUrl/api/cases/$cid`?tenantId=$tenant" -Method PATCH -ContentType "application/json" -Body $body
        $ops++
      }
    }
    else {
      # --- Add comment ---
      if ($caseIds[$tenant].Count -gt 0) {
        $cid = Pick $caseIds[$tenant]
        $body = @{
          authorId = if ((Get-Random -Max 2) -eq 0) { Pick $agents } else { Pick $customers }
          authorKind = if ((Get-Random -Max 2) -eq 0) { "agent" } else { "customer" }
          body = Pick $commentBodies
        } | ConvertTo-Json
        $null = Invoke-RestMethod "$BaseUrl/api/cases/$cid/comments?tenantId=$tenant" -Method POST -ContentType "application/json" -Body $body
        $ops++
      }
    }
  } catch {
    $errCount++
  }

  # Realistic inter-request delay: 500ms - 3s (simulates humans + background polling)
  $delay = Get-Random -Minimum 500 -Maximum 3000
  Start-Sleep -Milliseconds $delay

  # Progress every 30 ops
  if ($ops % 30 -eq 0 -and $ops -gt 0) {
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
    $remaining = [math]::Round(($end - (Get-Date)).TotalMinutes, 1)
    Write-Host ('  [{0} min] {1} ops ({2} errors) - {3} min remaining' -f $elapsed, $ops, $errCount, $remaining) -ForegroundColor DarkGray
  }
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host ('Total: {0} operations in {1} minutes ({2} errors)' -f $ops, $elapsed, $errCount)
if ($elapsed -gt 0) { Write-Host ('Rate: {0} ops/min' -f [math]::Round($ops / $elapsed, 1)) }
