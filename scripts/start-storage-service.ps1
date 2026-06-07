$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendRoot = Join-Path $RepoRoot "agent-runtime\backend"
$BundledPython = "C:\Users\123\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (!$env:PROMPTCARD_STORAGE_DATA_DIR) {
  $env:PROMPTCARD_STORAGE_DATA_DIR = Join-Path $RepoRoot "data"
}
$RuntimeEnvironment = Join-Path $env:LOCALAPPDATA "PromptCardAgentRuntime\.venv"
$env:PYTHONPATH = "$RepoRoot;$env:PYTHONPATH"

Push-Location $BackendRoot
try {
  $RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
  if (Test-Path $RuntimePython) {
    & $RuntimePython -m promptcard_storage
  }
  else {
    $env:UV_CACHE_DIR = Join-Path $env:TEMP "promptcard-agent-uv-cache"
    $env:UV_LINK_MODE = "copy"
    $env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
    $env:UV_PYTHON = if (Test-Path $BundledPython) { $BundledPython } else { "python" }
    uv run python -m promptcard_storage
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
