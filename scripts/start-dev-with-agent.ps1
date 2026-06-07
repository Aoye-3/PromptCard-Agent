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
$LogsDir = if ($env:PROMPTCARD_LOGS_DIR) { $env:PROMPTCARD_LOGS_DIR } else { Join-Path $RepoRoot "logs" }
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
  try {
    $response = Invoke-WebRequest -UseBasicParsing $StorageHealthUrl -TimeoutSec 2
    if ($response.StatusCode -ne 200) { return $false }
    if (!$env:PROMPTCARD_STORAGE_DATA_DIR) { return $true }

    $payload = $response.Content | ConvertFrom-Json
    if (!$payload.storage) { return $false }
    $expected = [System.IO.Path]::GetFullPath($env:PROMPTCARD_STORAGE_DATA_DIR).TrimEnd('\')
    $actual = [System.IO.Path]::GetFullPath([string]$payload.storage).TrimEnd('\')
    if ($expected -ne $actual) {
      Write-Host "PromptCard storage service is healthy but uses $actual; expected $expected"
      return $false
    }
    return $true
  }
  catch {
    return $false
  }
}

function Test-AgentRuntime {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $AgentHealthUrl -TimeoutSec 2
    if ($response.StatusCode -ne 200) { return $false }
    if (!$env:DEER_FLOW_HOME) { return $true }

    $payload = $response.Content | ConvertFrom-Json
    if (!$payload.deerFlowHome) { return $false }
    $expected = [System.IO.Path]::GetFullPath($env:DEER_FLOW_HOME).TrimEnd('\')
    $actual = [System.IO.Path]::GetFullPath([string]$payload.deerFlowHome).TrimEnd('\')
    if ($expected -ne $actual) {
      Write-Host "Agent Runtime is healthy but uses $actual; expected $expected"
      return $false
    }
    return $true
  }
  catch {
    return $false
  }
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
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$StorageScript`"" -WindowStyle Hidden
  Wait-UntilHealthy "PromptCard storage service at $StorageHealthUrl" ${function:Test-StorageService}
}
else {
  Write-Host "PromptCard storage service is already healthy at $StorageHealthUrl"
}

if (-not (Test-AgentRuntime)) {
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`"" -WindowStyle Hidden
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
