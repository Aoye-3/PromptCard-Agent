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
$RuntimeEnvironment = [System.IO.Path]::GetFullPath((Join-Path $BackendRoot ".venv"))
$env:UV_CACHE_DIR = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ".uv-cache"))
$env:UV_PYTHON_INSTALL_DIR = [System.IO.Path]::GetFullPath((Join-Path $BackendRoot ".python"))
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

function Test-WorkspacePath([string]$Path) {
  $WorkspacePrefix = [System.IO.Path]::GetFullPath([string]$RepoRoot).TrimEnd('\') + '\'
  return [System.IO.Path]::GetFullPath($Path).StartsWith($WorkspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-WorkspacePython {
  $VenvPython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
  $VenvConfig = Join-Path $RuntimeEnvironment "pyvenv.cfg"
  if ((Test-Path -LiteralPath $VenvPython) -and (Test-Path -LiteralPath $VenvConfig)) {
    $HomeLine = Get-Content -LiteralPath $VenvConfig | Where-Object { $_ -match '^home\s*=\s*(.+)$' } | Select-Object -First 1
    $HomePath = $HomeLine -replace '^home\s*=\s*', ''
    if ($HomeLine -and (Test-WorkspacePath $HomePath)) { return $VenvPython }
  }
  return Get-ChildItem -LiteralPath $env:UV_PYTHON_INSTALL_DIR -Recurse -File -Filter "python.exe" |
    Where-Object { Test-WorkspacePath $_.FullName } |
    Select-Object -First 1 -ExpandProperty FullName
}

$WorkspacePython = Get-WorkspacePython
if (!$WorkspacePython) {
  uv python install 3.12.12
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $WorkspacePython = Get-WorkspacePython
  if (!$WorkspacePython) { throw "uv did not provision Python inside $env:UV_PYTHON_INSTALL_DIR" }
}

$RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
if (!(Test-WorkspacePath $WorkspacePython)) {
  throw "Agent runtime Python must stay inside the current workspace."
}
if ($WorkspacePython -ne $RuntimePython -or !(Test-Path -LiteralPath $RuntimePython)) {
  uv sync --project $BackendRoot --python $WorkspacePython
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (!(Test-Path -LiteralPath $RuntimePython)) { throw "uv sync did not create the workspace-local runtime." }

Push-Location $BackendRoot
try {
  $RuntimeCheck = "import keyring; from volcenginesdkarkruntime import Ark; print({'secure_image_runtime': True, 'model_credentials': 'configured at invocation'})"
  & $RuntimePython -c $RuntimeCheck
  if ($LASTEXITCODE -ne 0) {
    $RepairCommand = "`$env:UV_CACHE_DIR='$env:UV_CACHE_DIR'; `$env:UV_PYTHON_INSTALL_DIR='$env:UV_PYTHON_INSTALL_DIR'; `$env:UV_PROJECT_ENVIRONMENT='$RuntimeEnvironment'; uv sync --project '$BackendRoot' --python '$WorkspacePython'"
    Write-Error "Agent runtime dependencies are incomplete. keyring and the Ark SDK are required. Repair the workspace-local F: environment with: $RepairCommand"
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
