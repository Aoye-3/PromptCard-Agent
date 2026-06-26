param(
  [string]$StorageHealthUrl = "",
  [string]$AgentHealthUrl = "",
  [string]$FrontendUrl = "",
  [int]$HealthTimeoutSeconds = 30,
  [string]$FrontendCommand = "npm.cmd run dev",
  [string]$RuntimeManifestPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentScript = Join-Path $RepoRoot "scripts\start-agent-runtime.ps1"
$StorageScript = Join-Path $RepoRoot "scripts\start-storage-service.ps1"
$LogsDir = if ($env:PROMPTCARD_LOGS_DIR) { $env:PROMPTCARD_LOGS_DIR } else { Join-Path $RepoRoot "logs" }
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
. (Join-Path $PSScriptRoot "dev-port-runtime.ps1")

if (!$RuntimeManifestPath) {
  $RuntimeManifestPath = if ($env:PROMPTCARD_DEV_RUNTIME_MANIFEST) { $env:PROMPTCARD_DEV_RUNTIME_MANIFEST } else { Join-Path $LogsDir "dev-runtime.json" }
}
$env:PROMPTCARD_DEV_RUNTIME_MANIFEST = $RuntimeManifestPath

$Runtime = $null
if ($env:PROMPTCARD_REUSE_DEV_RUNTIME -eq "1") {
  $Runtime = Read-PromptCardDevRuntime $RuntimeManifestPath
}
if (!$Runtime) {
  $Runtime = New-PromptCardDevRuntime `
    -RepoRoot $RepoRoot `
    -ManifestPath $RuntimeManifestPath `
    -FrontendUrlOverride $FrontendUrl `
    -AgentHealthUrlOverride $AgentHealthUrl `
    -StorageHealthUrlOverride $StorageHealthUrl
}
Set-PromptCardDevRuntimeEnvironment $Runtime

$StorageHealthUrl = $Runtime.storageHealthUrl
$AgentHealthUrl = $Runtime.agentHealthUrl
$FrontendUrl = $Runtime.frontendUrl

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
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.serviceVersion -ne "2.0.0" -or $payload.schemaVersion -ne 1 -or !$payload.capabilities.sqlite) {
      Write-Host "PromptCard storage service is running an incompatible storage version."
      return $false
    }
    if (!$env:PROMPTCARD_STORAGE_DATA_DIR) { return $true }
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
  try {
    $response = Invoke-WebRequest -UseBasicParsing $FrontendUrl -TimeoutSec 2
    if ($response.StatusCode -ne 200) { return $false }
    $scriptMatch = [regex]::Match($response.Content, '<script[^>]+type=["'']module["''][^>]+src=["'']([^"'']+)["'']')
    if (!$scriptMatch.Success) { return $false }
    $entryUrl = [System.Uri]::new([System.Uri]$FrontendUrl, $scriptMatch.Groups[1].Value).AbsoluteUri
    $entry = Invoke-WebRequest -UseBasicParsing $entryUrl -TimeoutSec 2
    if ($entry.StatusCode -ne 200) { return $false }
    if ($entry.Content -match '/node_modules/(react|react-dom)/(index|client)\.js') {
      Write-Host "Vite frontend is serving unoptimized CommonJS React modules."
      return $false
    }
    return $true
  }
  catch {
    return $false
  }
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
