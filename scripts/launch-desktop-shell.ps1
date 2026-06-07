param(
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot
try {
  if (!(Test-Path -LiteralPath "node_modules")) {
    Write-Host "Installing frontend dependencies..."
    npm.cmd install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  if ($NoLaunch) {
    Write-Host "Desktop shell launch check passed."
    exit 0
  }

  Write-Host "Starting PromptCard Manager Dev Shell in a detached process..."
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "tauri:dev") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden
  Write-Host "Desktop shell launch requested. You can close this launcher window."
}
finally {
  Pop-Location
}
