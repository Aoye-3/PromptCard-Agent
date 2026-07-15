$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeRoot = Join-Path $RepoRoot "agent-runtime"
$BackendRoot = Join-Path $RuntimeRoot "backend"
$env:DEER_FLOW_PROJECT_ROOT = $RuntimeRoot
if (!$env:DEER_FLOW_HOME) {
  $env:DEER_FLOW_HOME = Join-Path $RuntimeRoot ".deer-flow"
}
if (!$env:DEER_FLOW_CONFIG_PATH) {
  $env:DEER_FLOW_CONFIG_PATH = Join-Path $RuntimeRoot "config.yaml"
}
if (!$env:DEER_FLOW_EXTENSIONS_CONFIG_PATH) {
  $env:DEER_FLOW_EXTENSIONS_CONFIG_PATH = Join-Path $RuntimeRoot "extensions_config.json"
}
if (!$env:PROMPTCARD_LIBRARY_FILE) {
  $env:PROMPTCARD_LIBRARY_FILE = Join-Path $RepoRoot "data\prompt-library-presets.json"
}
$RuntimeEnvironment = if ($env:UV_PROJECT_ENVIRONMENT) { $env:UV_PROJECT_ENVIRONMENT } else { Join-Path $BackendRoot ".venv" }
$env:UV_CACHE_DIR = if ($env:UV_CACHE_DIR) { $env:UV_CACHE_DIR } else { Join-Path $RepoRoot ".uv-cache" }
$env:UV_PYTHON_INSTALL_DIR = if ($env:UV_PYTHON_INSTALL_DIR) { $env:UV_PYTHON_INSTALL_DIR } else { Join-Path $BackendRoot ".python" }
$env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
$env:UV_LINK_MODE = "copy"
if (!$env:AUTH_JWT_SECRET) {
  $env:AUTH_JWT_SECRET = "promptcard-local-agent-runtime-dev-secret"
}
if (!$env:PROMPTCARD_AGENT_ADMIN_EMAIL) {
  $env:PROMPTCARD_AGENT_ADMIN_EMAIL = "admin@promptcard.dev"
}
if (!$env:PROMPTCARD_AGENT_ADMIN_PASSWORD) {
  $env:PROMPTCARD_AGENT_ADMIN_PASSWORD = "PromptCardAgentRuntime!2026"
}

$HarnessPath = Join-Path $BackendRoot "packages\harness"
$env:PYTHONPATH = "$BackendRoot;$HarnessPath;$env:PYTHONPATH"
New-Item -ItemType Directory -Force -Path (Split-Path $RuntimeEnvironment -Parent) | Out-Null
New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:UV_PYTHON_INSTALL_DIR | Out-Null

Push-Location $BackendRoot
try {
  $RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
  $RuntimeCheck = "import keyring; from volcenginesdkarkruntime import Ark; print({'secure_image_runtime': True, 'model_credentials': 'configured at invocation'})"
  if (Test-Path $RuntimePython) {
    & $RuntimePython -c $RuntimeCheck
  }
  else {
    uv run --python 3.12 python -c $RuntimeCheck
  }
  if ($LASTEXITCODE -ne 0) {
    $RepairCommand = "`$env:UV_CACHE_DIR='$env:UV_CACHE_DIR'; `$env:UV_PYTHON_INSTALL_DIR='$env:UV_PYTHON_INSTALL_DIR'; `$env:UV_PROJECT_ENVIRONMENT='$RuntimeEnvironment'; uv sync --project '$BackendRoot' --python 3.12"
    Write-Error "Agent runtime dependencies are incomplete. keyring and the Ark SDK are required. Repair the workspace-local F: environment with: $RepairCommand"
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
