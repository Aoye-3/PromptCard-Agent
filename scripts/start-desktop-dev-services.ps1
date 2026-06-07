$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:PROMPTCARD_DESKTOP_DEV = "1"

if ($env:PROMPTCARD_DESKTOP_USE_APPDATA_PROFILE -eq "1") {
  $ProfileRoot = if ($env:PROMPTCARD_DESKTOP_PROFILE_ROOT) {
    $env:PROMPTCARD_DESKTOP_PROFILE_ROOT
  } else {
    Join-Path $env:APPDATA "PromptCard-Manager\dev-profile"
  }

  $DataDir = Join-Path $ProfileRoot "data"
  $RuntimeStateDir = Join-Path $ProfileRoot "agent-runtime\.deer-flow"
  $LogsDir = Join-Path $ProfileRoot "logs"
  $ConfigDir = Join-Path $ProfileRoot "config"
  $DesktopShellConfig = Join-Path $ConfigDir "desktop-shell.json"

  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeStateDir "data") | Out-Null
  New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $ProfileRoot "backups") | Out-Null
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

  if (!(Test-Path -LiteralPath $DesktopShellConfig)) {
    @{
      schemaVersion = 1
      sourceRoot = [string]$RepoRoot
      profileRoot = [string](Resolve-Path $ProfileRoot)
      createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $DesktopShellConfig -Encoding UTF8
  }

  $env:PROMPTCARD_DESKTOP_PROFILE_ROOT = $ProfileRoot
  $env:PROMPTCARD_STORAGE_DATA_DIR = $DataDir
  $env:PROMPTCARD_LOGS_DIR = $LogsDir
  $env:DEER_FLOW_HOME = $RuntimeStateDir
  $env:PROMPTCARD_LIBRARY_FILE = Join-Path $DataDir "prompt-library-presets.json"
}

$StartScript = Join-Path $RepoRoot "scripts\start-dev-with-agent.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript -FrontendCommand "npm.cmd run dev"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
