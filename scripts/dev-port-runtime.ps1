$ErrorActionPreference = "Stop"

function Test-PromptCardPortAvailable {
  param(
    [string]$HostName,
    [int]$Port
  )

  $listener = $null
  try {
    $address = [System.Net.IPAddress]::Parse($HostName)
    $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
    $listener.Start()
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Get-PromptCardFreeTcpPort {
  param(
    [string]$HostName,
    [hashtable]$ReservedPorts
  )

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $listener = $null
    try {
      $address = [System.Net.IPAddress]::Parse($HostName)
      $listener = [System.Net.Sockets.TcpListener]::new($address, 0)
      $listener.Start()
      $port = [int]$listener.LocalEndpoint.Port
      if (!$ReservedPorts.ContainsKey($port)) {
        $ReservedPorts[$port] = $true
        return $port
      }
    }
    finally {
      if ($listener) {
        $listener.Stop()
      }
    }
  }

  throw "Unable to reserve a free local TCP port after 20 attempts."
}

function Resolve-PromptCardPort {
  param(
    [string]$Name,
    [string]$EnvName,
    [string]$HostName,
    [int]$PreferredPort,
    [hashtable]$ReservedPorts
  )

  $raw = [string](Get-Item -Path "env:$EnvName" -ErrorAction SilentlyContinue).Value
  if ($raw.Trim()) {
    $explicitPort = 0
    if (![int]::TryParse($raw.Trim(), [ref]$explicitPort) -or $explicitPort -lt 1 -or $explicitPort -gt 65535) {
      throw "$EnvName must be a TCP port between 1 and 65535."
    }
    if ($ReservedPorts.ContainsKey($explicitPort) -or !(Test-PromptCardPortAvailable -HostName $HostName -Port $explicitPort)) {
      throw "$Name port $explicitPort is occupied. Choose another $EnvName or stop the process using it."
    }
    $ReservedPorts[$explicitPort] = $true
    return [pscustomobject]@{ Port = $explicitPort; Explicit = $true }
  }

  if ($PreferredPort -gt 0) {
    for ($candidate = $PreferredPort; $candidate -le ($PreferredPort + 100); $candidate++) {
      if (!$ReservedPorts.ContainsKey($candidate) -and (Test-PromptCardPortAvailable -HostName $HostName -Port $candidate)) {
        $ReservedPorts[$candidate] = $true
        return [pscustomobject]@{ Port = $candidate; Explicit = $false }
      }
    }
  }

  $port = Get-PromptCardFreeTcpPort -HostName $HostName -ReservedPorts $ReservedPorts
  return [pscustomobject]@{ Port = $port; Explicit = $false }
}

function Get-PromptCardOrigin {
  param([string]$Url)

  $uri = [System.Uri]$Url
  return "$($uri.Scheme)://$($uri.Host):$($uri.Port)"
}

function Test-PromptCardFrontend {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    if ($response.StatusCode -ne 200) { return $false }

    $content = [string]$response.Content
    if ($content -notmatch '<title>\s*PromptCard-Agent\s*</title>') { return $false }
    if ($content -notmatch "src=[`"']/src/main\.tsx(?:\?[^`"']*)?[`"']") { return $false }
    return $true
  }
  catch {
    return $false
  }
}

function New-PromptCardDevRuntime {
  param(
    [string]$RepoRoot,
    [string]$ManifestPath,
    [string]$FrontendUrlOverride,
    [string]$AgentHealthUrlOverride,
    [string]$StorageHealthUrlOverride
  )

  $hostName = "127.0.0.1"
  $reservedPorts = @{}

  $frontendUrl = $FrontendUrlOverride
  if (!$frontendUrl) {
    $frontend = Resolve-PromptCardPort -Name "Frontend" -EnvName "PROMPTCARD_FRONTEND_PORT" -HostName $hostName -PreferredPort 3000 -ReservedPorts $reservedPorts
    $frontendUrl = "http://${hostName}:$($frontend.Port)/"
  }
  else {
    $frontendUri = [System.Uri]$frontendUrl
    $reservedPorts[[int]$frontendUri.Port] = $true
  }

  $agentHealthUrl = $AgentHealthUrlOverride
  if (!$agentHealthUrl) {
    $agent = Resolve-PromptCardPort -Name "Agent Runtime" -EnvName "PROMPTCARD_AGENT_PORT" -HostName $hostName -PreferredPort 0 -ReservedPorts $reservedPorts
    $agentUrl = "http://${hostName}:$($agent.Port)"
    $agentHealthUrl = "$agentUrl/health"
  }
  else {
    $agentUrl = Get-PromptCardOrigin $agentHealthUrl
    $agentUri = [System.Uri]$agentHealthUrl
    $reservedPorts[[int]$agentUri.Port] = $true
  }

  $storageHealthUrl = $StorageHealthUrlOverride
  if (!$storageHealthUrl) {
    $storage = Resolve-PromptCardPort -Name "Storage service" -EnvName "PROMPTCARD_STORAGE_PORT" -HostName $hostName -PreferredPort 0 -ReservedPorts $reservedPorts
    $storageUrl = "http://${hostName}:$($storage.Port)"
    $storageHealthUrl = "$storageUrl/health"
  }
  else {
    $storageUrl = Get-PromptCardOrigin $storageHealthUrl
    $storageUri = [System.Uri]$storageHealthUrl
    $reservedPorts[[int]$storageUri.Port] = $true
  }

  $frontendUri = [System.Uri]$frontendUrl
  $agentUri = [System.Uri]$agentUrl
  $storageUri = [System.Uri]$storageUrl

  $runtime = [pscustomobject]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    frontendUrl = $frontendUrl
    agentUrl = $agentUrl
    agentHealthUrl = $agentHealthUrl
    storageUrl = $storageUrl
    storageHealthUrl = $storageHealthUrl
    ports = [pscustomobject]@{
      frontend = [int]$frontendUri.Port
      agent = [int]$agentUri.Port
      storage = [int]$storageUri.Port
    }
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $ManifestPath -Parent) | Out-Null
  [System.IO.File]::WriteAllText($ManifestPath, ($runtime | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
  return $runtime
}

function Set-PromptCardDevRuntimeEnvironment {
  param([pscustomobject]$Runtime)

  $frontendOrigin = Get-PromptCardOrigin $Runtime.frontendUrl
  $env:PROMPTCARD_FRONTEND_URL = $Runtime.frontendUrl
  $env:PROMPTCARD_FRONTEND_PORT = [string]$Runtime.ports.frontend
  $env:PROMPTCARD_AGENT_URL = $Runtime.agentUrl
  $env:PROMPTCARD_AGENT_PORT = [string]$Runtime.ports.agent
  $env:PROMPTCARD_STORAGE_URL = $Runtime.storageUrl
  $env:PROMPTCARD_STORAGE_PORT = [string]$Runtime.ports.storage
  $env:PROMPTCARD_STORAGE_HEALTH_URL = $Runtime.storageHealthUrl
  $env:GATEWAY_HOST = "127.0.0.1"
  $env:GATEWAY_PORT = [string]$Runtime.ports.agent
  $env:GATEWAY_CORS_ORIGINS = "$frontendOrigin,http://localhost:$($Runtime.ports.frontend)"
  $env:PROMPTCARD_STORAGE_HOST = "127.0.0.1"
}

function Read-PromptCardDevRuntime {
  param([string]$ManifestPath)

  if (!(Test-Path -LiteralPath $ManifestPath)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  }
  catch {
    return $null
  }
}
