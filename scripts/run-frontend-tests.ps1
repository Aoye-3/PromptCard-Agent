param(
  [ValidateRange(1, 16)]
  [int]$ShardCount = 4,

  [ValidateRange(1, 16)]
  [int]$MaxWorkers = 2
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logRoot = Join-Path $repoRoot '.tmp\frontend-tests'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

Push-Location $repoRoot
try {
  for ($shardIndex = 1; $shardIndex -le $ShardCount; $shardIndex += 1) {
    $shard = "$shardIndex/$ShardCount"
    $logPath = Join-Path $logRoot "shard-$shardIndex.log"
    Write-Host "Running frontend test shard $shard..."

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & npx.cmd vitest run "--shard=$shard" --reporter=dot "--maxWorkers=$MaxWorkers" --minWorkers=1 *> $logPath
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    Get-Content -LiteralPath $logPath

    if ($exitCode -ne 0) {
      Write-Error "Frontend test shard $shard failed with exit code $exitCode."
      exit $exitCode
    }
  }
}
finally {
  Pop-Location
}

Write-Host "All $ShardCount frontend test shards passed."
