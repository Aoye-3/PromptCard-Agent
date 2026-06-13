param(
  [switch]$NoLaunch,
  [switch]$ForceRebuild,
  [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DesktopShellExecutable = Join-Path $RepoRoot "src-tauri\target\debug\promptcard-manager-dev-shell.exe"
$DesktopServicesScript = Join-Path $RepoRoot "scripts\start-desktop-dev-services.ps1"
$FrontendUrl = "http://127.0.0.1:3000/"
$DesktopProcessName = "promptcard-manager-dev-shell"

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

function Test-DesktopShellCurrent {
  if ($ForceRebuild -or !(Test-Path -LiteralPath $DesktopShellExecutable)) { return $false }

  $executableTime = (Get-Item -LiteralPath $DesktopShellExecutable).LastWriteTimeUtc
  $inputs = @(
    Get-ChildItem -LiteralPath (Join-Path $RepoRoot "src-tauri\src") -Recurse -File
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\tauri.conf.json")
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\Cargo.toml")
    Get-Item -LiteralPath (Join-Path $RepoRoot "src-tauri\build.rs")
  )
  return !($inputs | Where-Object { $_.LastWriteTimeUtc -gt $executableTime } | Select-Object -First 1)
}

function Wait-DesktopShellProcess($StartedAfter) {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $process = Get-CimInstance Win32_Process -Filter "Name='promptcard-manager-dev-shell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CreationDate -ge $StartedAfter } |
      Select-Object -First 1
    if ($process) { return $process }
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
  Start-Process `
    -FilePath "powershell" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$DesktopServicesScript`"") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden | Out-Null
  Wait-HttpHealthy "Vite frontend" $FrontendUrl

  if (Test-DesktopShellCurrent) {
    Write-Host "[2/2] Starting current desktop shell directly..."
    $process = Start-Process -FilePath $DesktopShellExecutable -WorkingDirectory (Split-Path $DesktopShellExecutable) -PassThru
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) {
      throw "Desktop shell exited immediately with code $($process.ExitCode)."
    }
    Write-Host "PromptCard Manager Dev Shell opened (PID $($process.Id))."
    exit 0
  }

  Write-Host "[2/2] Desktop shell requires rebuild; starting tauri dev..."
  Write-Host "The launcher will remain visible until the application window opens."
  $startedAfter = Get-Date
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "tauri:dev") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden | Out-Null
  $process = Wait-DesktopShellProcess $startedAfter
  Write-Host "PromptCard Manager Dev Shell opened (PID $($process.ProcessId))."
}
finally {
  Pop-Location
}
