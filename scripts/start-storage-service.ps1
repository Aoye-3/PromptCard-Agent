$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendRoot = Join-Path $RepoRoot "agent-runtime\backend"

if (!$env:PROMPTCARD_STORAGE_DATA_DIR) {
  $env:PROMPTCARD_STORAGE_DATA_DIR = Join-Path $RepoRoot "data"
}
if (!$env:PROMPTCARD_STORAGE_HOST) {
  $env:PROMPTCARD_STORAGE_HOST = "127.0.0.1"
}
if (!$env:PROMPTCARD_STORAGE_PORT) {
  $env:PROMPTCARD_STORAGE_PORT = "8002"
}
$RuntimeEnvironment = if ($env:UV_PROJECT_ENVIRONMENT) { $env:UV_PROJECT_ENVIRONMENT } else { Join-Path $BackendRoot ".venv" }
$env:UV_CACHE_DIR = if ($env:UV_CACHE_DIR) { $env:UV_CACHE_DIR } else { Join-Path $RepoRoot ".uv-cache" }
$env:UV_PYTHON_INSTALL_DIR = if ($env:UV_PYTHON_INSTALL_DIR) { $env:UV_PYTHON_INSTALL_DIR } else { Join-Path $BackendRoot ".python" }
$env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
$env:UV_LINK_MODE = "copy"
$env:PYTHONPATH = "$RepoRoot;$env:PYTHONPATH"

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
  return Get-ChildItem -LiteralPath $env:UV_PYTHON_INSTALL_DIR -Recurse -File -Filter "python.exe" -ErrorAction SilentlyContinue |
    Where-Object { Test-WorkspacePath $_.FullName } |
    Select-Object -First 1 -ExpandProperty FullName
}

New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:UV_PYTHON_INSTALL_DIR | Out-Null

$WorkspacePython = Get-WorkspacePython
if (!$WorkspacePython) {
  uv python install 3.12.12
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $WorkspacePython = Get-WorkspacePython
  if (!$WorkspacePython) { throw "uv did not provision Python inside $env:UV_PYTHON_INSTALL_DIR" }
}

$RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
if (!(Test-WorkspacePath $WorkspacePython)) {
  throw "PromptCard storage Python must stay inside the current workspace."
}
if ($WorkspacePython -ne $RuntimePython -or !(Test-Path -LiteralPath $RuntimePython)) {
  uv sync --project $BackendRoot --python $WorkspacePython
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (!(Test-Path -LiteralPath $RuntimePython)) { throw "uv sync did not create the workspace-local runtime." }

Push-Location $BackendRoot
try {
  & $RuntimePython -m promptcard_storage
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
