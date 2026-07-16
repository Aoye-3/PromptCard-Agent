$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (!$env:PROMPTCARD_TEXT_AGENT_HOST) {
  $env:PROMPTCARD_TEXT_AGENT_HOST = "127.0.0.1"
}
if (!$env:PROMPTCARD_TEXT_AGENT_PORT) {
  $env:PROMPTCARD_TEXT_AGENT_PORT = "8011"
}
if (!$env:PROMPTCARD_INTERNAL_TOKEN) {
  throw "PROMPTCARD_INTERNAL_TOKEN is required."
}
if (!$env:PROMPTCARD_GATEWAY_INTERNAL_URL) {
  $env:PROMPTCARD_GATEWAY_INTERNAL_URL = "http://127.0.0.1:8001/api/promptcard/runtime"
}

Push-Location $RepoRoot
try {
  node --experimental-strip-types text-agent-runtime/src/server.ts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
