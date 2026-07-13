$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:PROMPTCARD_DESKTOP_DEV = "1"

function Copy-MissingProfileFiles {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [Parameter(Mandatory = $true)][string]$DestinationDir
  )

  if (!(Test-Path -LiteralPath $SourceDir)) { return }
  Get-ChildItem -LiteralPath $SourceDir -Force | ForEach-Object {
    $target = Join-Path $DestinationDir $_.Name
    if (Test-Path -LiteralPath $target) { return }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse
  }
}

if (!$env:PROMPTCARD_DESKTOP_PROFILE_ROOT) {
  $env:PROMPTCARD_DESKTOP_PROFILE_ROOT = Join-Path $RepoRoot "logs\desktop-profile"
}

$ProfileRoot = $env:PROMPTCARD_DESKTOP_PROFILE_ROOT
$DataDir = Join-Path $ProfileRoot "data"
$RuntimeStateDir = Join-Path $ProfileRoot "agent-runtime\.deer-flow"
$LogsDir = Join-Path $ProfileRoot "logs"
$BackupsDir = Join-Path $ProfileRoot "backups"
$ConfigDir = Join-Path $ProfileRoot "config"
$DesktopShellConfig = Join-Path $ConfigDir "desktop-shell.json"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeStateDir "data") | Out-Null
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackupsDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

$LegacyDataDir = Join-Path $RepoRoot "data"
$ProfileDatabase = Join-Path $DataDir "promptcard.sqlite3"
if (!(Test-Path -LiteralPath $ProfileDatabase) -and (Test-Path -LiteralPath $LegacyDataDir)) {
  Copy-MissingProfileFiles -SourceDir $LegacyDataDir -DestinationDir $DataDir
}

$LegacyRuntimeStateDir = Join-Path $RepoRoot "agent-runtime\.deer-flow"
if ((Test-Path -LiteralPath $LegacyRuntimeStateDir) -and -not (Get-ChildItem -LiteralPath $RuntimeStateDir -Force -ErrorAction SilentlyContinue)) {
  Copy-MissingProfileFiles -SourceDir $LegacyRuntimeStateDir -DestinationDir $RuntimeStateDir
}

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

$StartScript = Join-Path $RepoRoot "scripts\start-dev-with-agent.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript -FrontendCommand "npm.cmd run dev"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
