param(
  [string]$StorageHealthUrl = "http://127.0.0.1:8002/health",
  [string]$AgentHealthUrl = "http://127.0.0.1:8001/health",
  [string]$FrontendUrl = "http://127.0.0.1:3000/",
  [int]$HealthTimeoutSeconds = 30,
  [string]$FrontendCommand = "npm.cmd run dev"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentScript = Join-Path $RepoRoot "scripts\start-agent-runtime.ps1"
$StorageScript = Join-Path $RepoRoot "scripts\start-storage-service.ps1"
$LogsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Test-HttpOk($Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Test-StorageService {
  return Test-HttpOk $StorageHealthUrl
}

function Test-AgentRuntime {
  return Test-HttpOk $AgentHealthUrl
}

function Test-Frontend {
  return Test-HttpOk $FrontendUrl
}

function Wait-UntilHealthy($Name, $Probe) {
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Probe) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not become healthy within $HealthTimeoutSeconds seconds."
}

if (-not (Test-StorageService)) {
  $storageOut = Join-Path $LogsDir "storage-service.log"
  $storageErr = Join-Path $LogsDir "storage-service.err.log"
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$StorageScript`"" -WindowStyle Hidden -RedirectStandardOutput $storageOut -RedirectStandardError $storageErr
  Wait-UntilHealthy "PromptCard storage service at $StorageHealthUrl" ${function:Test-StorageService}
}
else {
  Write-Host "PromptCard storage service is already healthy at $StorageHealthUrl"
}

if (-not (Test-AgentRuntime)) {
  $agentOut = Join-Path $LogsDir "agent-runtime.log"
  $agentErr = Join-Path $LogsDir "agent-runtime.err.log"
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`"" -WindowStyle Hidden -RedirectStandardOutput $agentOut -RedirectStandardError $agentErr
  Wait-UntilHealthy "Agent Runtime at $AgentHealthUrl" ${function:Test-AgentRuntime}
}
else {
  Write-Host "Agent Runtime is already healthy at $AgentHealthUrl"
}

if (Test-Frontend) {
  Write-Host "Vite frontend is already healthy at $FrontendUrl"
  exit 0
}

Push-Location $RepoRoot
try {
  $global:LASTEXITCODE = $null
  Invoke-Expression $FrontendCommand
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
