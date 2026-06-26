param(
  [switch]$NoLaunch,
  [switch]$ForceRebuild,
  [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DesktopShellExecutable = Join-Path $RepoRoot "src-tauri\target\debug\promptcard-manager-dev-shell.exe"
$DesktopServicesScript = Join-Path $RepoRoot "scripts\start-desktop-dev-services.ps1"
$LogsDir = if ($env:PROMPTCARD_LOGS_DIR) { $env:PROMPTCARD_LOGS_DIR } else { Join-Path $RepoRoot "logs" }
$RuntimeManifestPath = if ($env:PROMPTCARD_DEV_RUNTIME_MANIFEST) { $env:PROMPTCARD_DEV_RUNTIME_MANIFEST } else { Join-Path $LogsDir "dev-runtime.json" }
$TauriDevConfigPath = Join-Path $LogsDir "tauri.dev-runtime.conf.json"
$DesktopProcessName = "promptcard-manager-dev-shell"
. (Join-Path $PSScriptRoot "dev-port-runtime.ps1")

function Test-HttpOk($Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-HttpHealthy($Name, $Url) {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $Url) { return }
    Start-Sleep -Milliseconds 300
  }
  throw "$Name did not become healthy within $StartupTimeoutSeconds seconds: $Url"
}

function Wait-DevRuntimeHealthy {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $runtime = Read-PromptCardDevRuntime $RuntimeManifestPath
    if ($runtime -and $runtime.frontendUrl -and (Test-HttpOk $runtime.frontendUrl)) {
      return $runtime
    }
    Start-Sleep -Milliseconds 300
  }
  throw "Vite frontend did not become healthy within $StartupTimeoutSeconds seconds. Runtime manifest: $RuntimeManifestPath"
}

function Write-TauriDevRuntimeConfig($Runtime) {
  New-Item -ItemType Directory -Force -Path (Split-Path $TauriDevConfigPath -Parent) | Out-Null
  $configPath = Join-Path $RepoRoot "src-tauri\tauri.conf.json"
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $config.build.devUrl = ([string]$Runtime.frontendUrl).TrimEnd("/")
  [System.IO.File]::WriteAllText($TauriDevConfigPath, ($config | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
  return $TauriDevConfigPath
}

function Test-DesktopShellCurrent {
  param([switch]$IgnoreForceRebuild)

  if ((!$IgnoreForceRebuild -and $ForceRebuild) -or !(Test-Path -LiteralPath $DesktopShellExecutable)) { return $false }

  $executableTime = (Get-Item -LiteralPath $DesktopShellExecutable).LastWriteTimeUtc
  $inputs = @(
    Get-ChildItem -LiteralPath (Join-Path $RepoRoot "src-tauri\src") -Recurse -File
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\tauri.conf.json")
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\capabilities\default.json")
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\Cargo.toml")
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\build.rs")
  )
  return !($inputs | Where-Object { $_.LastWriteTimeUtc -gt $executableTime } | Select-Object -First 1)
}

function Start-DesktopShellExecutable {
  $process = Start-Process -FilePath $DesktopShellExecutable -WorkingDirectory (Split-Path $DesktopShellExecutable) -PassThru
  Start-Sleep -Milliseconds 500
  if ($process.HasExited) {
    throw "Desktop shell exited immediately with code $($process.ExitCode)."
  }
  return $process
}

function Wait-DesktopShellProcess($StartedAfter) {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $fallbackStarted = $false
  while ((Get-Date) -lt $deadline) {
    $process = Get-CimInstance Win32_Process -Filter "Name='promptcard-manager-dev-shell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CreationDate -ge $StartedAfter } |
      Select-Object -First 1
    if ($process) { return $process }

    if (!$fallbackStarted -and (Test-DesktopShellCurrent -IgnoreForceRebuild)) {
      Write-Host "Tauri dev build completed; starting current desktop shell directly..."
      $fallback = Start-DesktopShellExecutable
      $fallbackStarted = $true
      return [pscustomobject]@{ ProcessId = $fallback.Id }
    }

    Start-Sleep -Milliseconds 300
  }
  throw "Desktop shell did not open within $StartupTimeoutSeconds seconds."
}

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

  $existingShell = Get-Process -Name $DesktopProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingShell) {
    Write-Host "PromptCard Manager Dev Shell is already running (PID $($existingShell.Id))."
    exit 0
  }

  Write-Host "[1/2] Starting or reusing local services..."
  $env:PROMPTCARD_DEV_RUNTIME_MANIFEST = $RuntimeManifestPath
  Start-Process `
    -FilePath "powershell" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$DesktopServicesScript`"") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden | Out-Null
  $runtime = Wait-DevRuntimeHealthy
  Set-PromptCardDevRuntimeEnvironment $runtime
  Write-Host "Frontend: $($runtime.frontendUrl)"

  $frontendUri = [System.Uri]$runtime.frontendUrl
  if ($frontendUri.Port -eq 3000 -and (Test-DesktopShellCurrent)) {
    Write-Host "[2/2] Starting current desktop shell directly..."
    $process = Start-DesktopShellExecutable
    Write-Host "PromptCard Manager Dev Shell opened (PID $($process.Id))."
    exit 0
  }

  Write-Host "[2/2] Desktop shell requires rebuild; starting tauri dev..."
  Write-Host "The launcher will remain visible until the application window opens."
  $devConfigPath = Write-TauriDevRuntimeConfig $runtime
  $env:PROMPTCARD_REUSE_DEV_RUNTIME = "1"
  $startedAfter = Get-Date
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "tauri:dev", "--", "--config", $devConfigPath) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden | Out-Null
  $process = Wait-DesktopShellProcess $startedAfter
  Write-Host "PromptCard Manager Dev Shell opened (PID $($process.ProcessId))."
}
finally {
  Pop-Location
}
