$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeRoot = Join-Path $RepoRoot "agent-runtime"
$BackendRoot = Join-Path $RuntimeRoot "backend"
$ApiKeyCandidates = @(
  $env:PROMPTCARD_AGENT_API_KEY_FILE,
  "F:\.Agent-PromptCardManager\API-Key.txt",
  "F:\.FinalProject\API-Key.txt"
) | Where-Object { $_ -and $_.Trim() }
$ApiKeyFile = $ApiKeyCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (!$ApiKeyFile) {
  throw "DeepSeek API key file was not found. Checked PROMPTCARD_AGENT_API_KEY_FILE, F:\.Agent-PromptCardManager\API-Key.txt, and F:\.FinalProject\API-Key.txt"
}

$ApiFileText = Get-Content -LiteralPath $ApiKeyFile -Raw
$ApiKeyMatch = [regex]::Match($ApiFileText, "sk-[A-Za-z0-9_-]{12,}")
if (!$ApiKeyMatch.Success) {
  throw "No DeepSeek-style API key was found in the local API file."
}

$env:DEEPSEEK_API_KEY = $ApiKeyMatch.Value
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
$BundledPython = "C:\Users\123\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (!$env:GATEWAY_HOST) {
  $env:GATEWAY_HOST = "127.0.0.1"
}
if (!$env:GATEWAY_PORT) {
  $env:GATEWAY_PORT = "8001"
}
if (!$env:GATEWAY_CORS_ORIGINS) {
  $frontendOrigin = if ($env:PROMPTCARD_FRONTEND_URL) {
    $frontendUri = [System.Uri]$env:PROMPTCARD_FRONTEND_URL
    "$($frontendUri.Scheme)://$($frontendUri.Host):$($frontendUri.Port)"
  } else {
    "http://127.0.0.1:3000"
  }
  $env:GATEWAY_CORS_ORIGINS = "$frontendOrigin,http://localhost:$(([System.Uri]$frontendOrigin).Port)"
}
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

New-Item -ItemType Directory -Force -Path $env:DEER_FLOW_HOME | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $RuntimeEnvironment -Parent) | Out-Null
Push-Location $BackendRoot
try {
  $RuntimeUvicorn = Join-Path $RuntimeEnvironment "Scripts\uvicorn.exe"
  if (Test-Path $RuntimeUvicorn) {
    & $RuntimeUvicorn app.gateway.app:app --host $env:GATEWAY_HOST --port ([int]$env:GATEWAY_PORT)
  }
  else {
    $env:UV_CACHE_DIR = if ($env:UV_CACHE_DIR) { $env:UV_CACHE_DIR } else { Join-Path $RepoRoot ".uv-cache" }
    $env:UV_LINK_MODE = "copy"
    $env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
    $env:UV_PYTHON = if (Test-Path $BundledPython) { $BundledPython } else { "C:\Program Files\Python311\python.exe" }
    New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
    uv run uvicorn app.gateway.app:app --host $env:GATEWAY_HOST --port ([int]$env:GATEWAY_PORT)
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
