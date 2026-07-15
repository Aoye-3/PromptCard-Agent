param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("storage", "runtime", "frontend")]
  [string]$Service
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Python = Join-Path $RepoRoot "agent-runtime\backend\.venv\Scripts\python.exe"
$env:PYTHONPATH = "$RepoRoot;$RepoRoot\agent-runtime\backend"

if ($Service -eq "storage") {
  $env:PROMPTCARD_STORAGE_DATA_DIR = Join-Path $RepoRoot "tests\.runtime\image-generation-storage"
  $env:PROMPTCARD_STORAGE_PORT = "38102"
  Set-Location $RepoRoot
  & $Python -m promptcard_storage
  exit $LASTEXITCODE
}

if ($Service -eq "runtime") {
  $env:PROMPTCARD_STORAGE_URL = "http://127.0.0.1:38102"
  $env:PORT = "38101"
  Set-Location $RepoRoot
  & $Python "tests\fixtures\image_generation_runtime.py"
  exit $LASTEXITCODE
}

$env:PROMPTCARD_AGENT_URL = "http://127.0.0.1:38101"
$env:PROMPTCARD_STORAGE_URL = "http://127.0.0.1:38102"
Set-Location $RepoRoot
& npm.cmd run dev -- --host 127.0.0.1 --port 38100
exit $LASTEXITCODE
