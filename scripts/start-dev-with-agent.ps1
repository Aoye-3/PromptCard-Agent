$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentScript = Join-Path $RepoRoot "scripts\start-agent-runtime.ps1"
$StorageScript = Join-Path $RepoRoot "scripts\start-storage-service.ps1"
$LogsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Test-StorageService {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8002/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Test-AgentRuntime {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8001/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-UntilHealthy($Name, $Probe) {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (& $Probe) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not become healthy within 30 seconds."
}

if (-not (Test-StorageService)) {
  $storageOut = Join-Path $LogsDir "storage-service.log"
  $storageErr = Join-Path $LogsDir "storage-service.err.log"
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$StorageScript`"" -WindowStyle Hidden -RedirectStandardOutput $storageOut -RedirectStandardError $storageErr
  Wait-UntilHealthy "PromptCard storage service at http://127.0.0.1:8002/health" ${function:Test-StorageService}
}
else {
  Write-Host "PromptCard storage service is already healthy at http://127.0.0.1:8002/health"
}

if (-not (Test-AgentRuntime)) {
  $agentOut = Join-Path $LogsDir "agent-runtime.log"
  $agentErr = Join-Path $LogsDir "agent-runtime.err.log"
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`"" -WindowStyle Hidden -RedirectStandardOutput $agentOut -RedirectStandardError $agentErr
  Wait-UntilHealthy "Agent Runtime at http://127.0.0.1:8001/health" ${function:Test-AgentRuntime}
}
else {
  Write-Host "Agent Runtime is already healthy at http://127.0.0.1:8001/health"
}

Push-Location $RepoRoot
try {
  npm run dev
}
finally {
  Pop-Location
}
