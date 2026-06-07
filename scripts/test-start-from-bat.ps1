param(
  [string]$FrontendUrl = "http://127.0.0.1:3000/",
  [string]$StorageHealthUrl = "http://127.0.0.1:8002/health",
  [string]$AgentHealthUrl = "http://127.0.0.1:8001/health",
  [int]$TimeoutSeconds = 60,
  [switch]$SkipBrowserCheck
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$StartBat = Join-Path $RepoRoot "start.bat"
$LogsDir = Join-Path $RepoRoot "logs"
$StartedAt = Get-Date
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Write-Step($Message) {
  Write-Host "[startup-test] $Message"
}

function Test-HttpOk($Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-Healthy($Name, $Url) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $Url) {
      Write-Step "$Name healthy: $Url"
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not become healthy within $TimeoutSeconds seconds: $Url"
}

function Assert-FrontendShell($Url) {
  $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 5
  if ($response.StatusCode -ne 200) {
    throw "Frontend returned HTTP $($response.StatusCode): $Url"
  }
  if ($response.Content -notmatch 'src="/src/main\.tsx(?:\?[^"]*)?"') {
    throw "Frontend HTML shell did not include the Vite React entry module."
  }
  Write-Step "frontend HTML shell includes /src/main.tsx"
}

function Assert-BrowserRender {
  $nodeCheck = @"
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const issues = [];
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) issues.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => issues.push({ type: 'pageerror', text: err.message }));
  await page.goto(process.env.PROMPTCARD_TEST_FRONTEND_URL, { waitUntil: 'networkidle' });
  const title = await page.title();
  const body = await page.locator('body').innerText();
  const ok = title === 'PromptCard-Agent' && body.includes('Projects') && body.includes('Create project');
  console.log(JSON.stringify({ title, ok, issues }, null, 2));
  await browser.close();
  if (!ok || issues.length) process.exit(1);
})();
"@

  $env:PROMPTCARD_TEST_FRONTEND_URL = $FrontendUrl
  $output = $nodeCheck | node -
  $nodeExitCode = $LASTEXITCODE
  Write-Host $output
  if ($nodeExitCode -ne 0) {
    throw "browser render check failed with exit code $nodeExitCode"
  }
  Write-Step "browser render check passed"
}

function Start-StartBatProcess($StartBatPath, $WorkingDirectory, $StdoutPath, $StderrPath) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "cmd.exe"
  $startInfo.Arguments = "/c `"`"$StartBatPath`" 1>`"$StdoutPath`" 2>`"$StderrPath`"`""
  $startInfo.WorkingDirectory = [string]$WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo

  [void]$process.Start()

  return [pscustomobject]@{
    Process = $process
  }
}

if (!(Test-Path -LiteralPath $StartBat)) {
  throw "start.bat not found: $StartBat"
}

$stdoutLog = Join-Path $LogsDir "start-from-bat-test.log"
$stderrLog = Join-Path $LogsDir "start-from-bat-test.err.log"
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

Write-Step "starting from start.bat"
$env:PROMPTCARD_START_SKIP_PAUSE = "1"
$startedProcess = Start-StartBatProcess $StartBat $RepoRoot $stdoutLog $stderrLog
$process = $startedProcess.Process

Write-Step "start.bat process id: $($process.Id)"

Wait-Healthy "storage service" $StorageHealthUrl
Wait-Healthy "Agent Runtime" $AgentHealthUrl
Wait-Healthy "Vite frontend" $FrontendUrl
Assert-FrontendShell $FrontendUrl

if ($SkipBrowserCheck) {
  Write-Step "browser render check skipped"
}
else {
  Assert-BrowserRender
}

if ($process.HasExited) {
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    $stderr = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Raw } else { "" }
    throw "start.bat exited with code $($process.ExitCode). stderr: $stderr"
  }
}

$elapsed = [int]((Get-Date) - $StartedAt).TotalSeconds
Write-Step "full startup flow passed in ${elapsed}s"
Write-Step "stdout log: $stdoutLog"
Write-Step "stderr log: $stderrLog"
