$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AgentScript = Join-Path $RepoRoot "scripts\start-agent-runtime.ps1"
$StorageScript = Join-Path $RepoRoot "scripts\start-storage-service.ps1"

function Test-StorageService {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8002/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

if (-not (Test-StorageService)) {
  Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$StorageScript`"" -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-StorageService) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-StorageService)) {
    throw "PromptCard storage service did not become healthy at http://127.0.0.1:8002/health"
  }
}

Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$AgentScript`"" -WindowStyle Hidden
Push-Location $RepoRoot
try {
  npm run dev
}
finally {
  Pop-Location
}
