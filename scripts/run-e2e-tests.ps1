[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path (Join-Path $repoRoot '.playwright-browsers')).Path
$logRoot = Join-Path $repoRoot '.tmp\e2e-tests'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$runId = [Guid]::NewGuid().ToString('N')
$stdoutPath = Join-Path $logRoot "$runId.stdout.log"
$stderrPath = Join-Path $logRoot "$runId.stderr.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$playwright = Join-Path $repoRoot 'node_modules\@playwright\test\cli.js'
$process = $null
$exitCode = 1
$timedOut = $false
$waitTimeoutSeconds = 900

if ($env:PROMPTCARD_E2E_RUNNER_TIMEOUT_SECONDS) {
  if (-not [int]::TryParse($env:PROMPTCARD_E2E_RUNNER_TIMEOUT_SECONDS, [ref]$waitTimeoutSeconds) -or $waitTimeoutSeconds -lt 1) {
    throw 'PROMPTCARD_E2E_RUNNER_TIMEOUT_SECONDS must be a positive whole number.'
  }
}

try {
  $process = Start-Process -FilePath $node -ArgumentList (@($playwright, 'test') + $PlaywrightArgs) -WorkingDirectory $repoRoot -NoNewWindow -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  if ($process.WaitForExit($waitTimeoutSeconds * 1000)) {
    $process.WaitForExit()
    $process.Refresh()
    $exitCode = $process.ExitCode
  }
  else {
    $timedOut = $true
  }
}
finally {
  if ($process -and -not $process.HasExited) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
  }
}

if (Test-Path $stdoutPath) { Get-Content -LiteralPath $stdoutPath }
if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath }
if ((Test-Path $stdoutPath) -and (Select-String -LiteralPath $stdoutPath -Pattern '^\s+[1-9][0-9]* failed(?:\s|$)' -Quiet)) {
  $exitCode = 1
}
if ($timedOut) {
  Write-Error "Playwright did not exit within $waitTimeoutSeconds seconds."
}
exit $exitCode
