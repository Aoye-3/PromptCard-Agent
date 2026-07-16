$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendRoot = Join-Path $RepoRoot "agent-runtime\backend"

function Test-WorkspacePath([string]$Path) {
  $WorkspacePrefix = [System.IO.Path]::GetFullPath([string]$RepoRoot).TrimEnd('\') + '\'
  return [System.IO.Path]::GetFullPath($Path).StartsWith($WorkspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)
}

if (!$env:PROMPTCARD_RUNTIME_STATE_DIR -or !(Test-WorkspacePath $env:PROMPTCARD_RUNTIME_STATE_DIR)) {
  $env:PROMPTCARD_RUNTIME_STATE_DIR = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "logs\agent-runtime-state"))
}
if (!$env:PROMPTCARD_LIBRARY_FILE -or !(Test-WorkspacePath $env:PROMPTCARD_LIBRARY_FILE)) {
  $env:PROMPTCARD_LIBRARY_FILE = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "data\prompt-library-presets.json"))
}
$RuntimeEnvironment = [System.IO.Path]::GetFullPath((Join-Path $BackendRoot ".venv"))
$env:UV_CACHE_DIR = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ".uv-cache"))
$env:UV_PYTHON_INSTALL_DIR = [System.IO.Path]::GetFullPath((Join-Path $BackendRoot ".python"))
$env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
$env:UV_LINK_MODE = "copy"
$env:PYTHONPATH = $BackendRoot
if (!$env:GATEWAY_HOST) { $env:GATEWAY_HOST = "127.0.0.1" }
if (!$env:GATEWAY_PORT) { $env:GATEWAY_PORT = "8001" }

New-Item -ItemType Directory -Force -Path $env:PROMPTCARD_RUNTIME_STATE_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:UV_PYTHON_INSTALL_DIR | Out-Null

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
}
$RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
if ($WorkspacePython -ne $RuntimePython -or !(Test-Path -LiteralPath $RuntimePython)) {
  uv sync --project $BackendRoot --python $WorkspacePython
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Push-Location $BackendRoot
try {
  & (Join-Path $RuntimeEnvironment "Scripts\uvicorn.exe") app.gateway.app:app --host $env:GATEWAY_HOST --port ([int]$env:GATEWAY_PORT)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
