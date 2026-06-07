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
$RuntimeEnvironment = Join-Path $env:LOCALAPPDATA "PromptCardAgentRuntime\.venv"
$BundledPython = "C:\Users\123\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
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

Push-Location $BackendRoot
try {
  $RuntimePython = Join-Path $RuntimeEnvironment "Scripts\python.exe"
  if (Test-Path $RuntimePython) {
    & $RuntimePython -c "from deerflow.config import get_app_config; cfg=get_app_config(); print({'models':[m.name for m in cfg.models], 'agents_api': cfg.agents_api.enabled, 'vision': cfg.models[0].supports_vision, 'tool_search': cfg.tool_search.enabled, 'tools':[t.name for t in cfg.tools]})"
  }
  else {
    $env:UV_CACHE_DIR = Join-Path $env:TEMP "promptcard-agent-uv-cache"
    $env:UV_LINK_MODE = "copy"
    $env:UV_PROJECT_ENVIRONMENT = $RuntimeEnvironment
    $env:UV_PYTHON = if (Test-Path $BundledPython) { $BundledPython } else { "C:\Program Files\Python311\python.exe" }
    New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
    uv run python -c "from deerflow.config import get_app_config; cfg=get_app_config(); print({'models':[m.name for m in cfg.models], 'agents_api': cfg.agents_api.enabled, 'vision': cfg.models[0].supports_vision, 'tool_search': cfg.tool_search.enabled, 'tools':[t.name for t in cfg.tools]})"
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
