[CmdletBinding()]
param(
    [ValidateSet('prod', 'dev')]
    [string]$AppMode = 'prod',

    [ValidateSet('auto', 'none', 'quick', 'named')]
    [string]$TunnelMode = 'auto',

    [int]$SharePort = 8080,

    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$UiPath = Join-Path $RepoRoot 'ui'
$ComposeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$EnvFile = Join-Path $PSScriptRoot '.env.share'
$RuntimeDir = Join-Path $RepoRoot '.runtime\share'
$UiEnvFile = Join-Path $UiPath '.env.local'
$AppLog = Join-Path $RuntimeDir 'next.log'
$AppErrLog = Join-Path $RuntimeDir 'next.err.log'
$PidFile = Join-Path $RuntimeDir 'next.pid'
$StateFile = Join-Path $RuntimeDir 'share-state.json'
$ComposeProject = 'builderblockshare'
$AppPort = 3000

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) {
            return
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
    }
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    return $false
}

function Get-ActiveListener {
    param([int]$Port)

    try {
        return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    } catch {
        return $null
    }
}

function Start-NextApp {
    $listener = Get-ActiveListener -Port $AppPort
    if ($listener) {
        Write-Step "Next.js is already listening on http://127.0.0.1:$AppPort"
        return $null
    }

    Push-Location $UiPath
    try {
        if ($AppMode -eq 'prod' -and -not $SkipBuild) {
            Write-Step 'Building the Next.js app for production'
            & npm.cmd run build
        }

        $command = if ($AppMode -eq 'prod') {
            "npm run start -- --hostname 127.0.0.1 --port $AppPort"
        } else {
            "npm run dev -- --hostname 127.0.0.1 --port $AppPort"
        }

        Write-Step "Starting Next.js in $AppMode mode on http://127.0.0.1:$AppPort"
        $process = Start-Process `
            -FilePath 'cmd.exe' `
            -ArgumentList '/c', $command `
            -WorkingDirectory $UiPath `
            -RedirectStandardOutput $AppLog `
            -RedirectStandardError $AppErrLog `
            -PassThru `
            -WindowStyle Hidden

        Set-Content -Path $PidFile -Value $process.Id

        if (-not (Wait-ForHttp -Url "http://127.0.0.1:$AppPort" -TimeoutSeconds 120)) {
            throw "Next.js did not become ready on port $AppPort. Check $AppLog and $AppErrLog."
        }

        return $process.Id
    } finally {
        Pop-Location
    }
}

function Get-QuickTunnelUrl {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $logs = docker compose -p $ComposeProject -f $ComposeFile logs cloudflared-quick --tail 50 2>$null
        $match = [regex]::Match(($logs -join [Environment]::NewLine), 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            return $match.Value
        }

        Start-Sleep -Seconds 2
    }

    return $null
}

Import-EnvFile -Path $EnvFile

$resolvedTunnelMode = $TunnelMode
if ($resolvedTunnelMode -eq 'auto') {
    if ($env:TUNNEL_TOKEN) {
        $resolvedTunnelMode = 'named'
    } else {
        $resolvedTunnelMode = 'quick'
    }
}

$env:COMPOSE_PROJECT_NAME = $ComposeProject
$env:SHARE_PORT = "$SharePort"

if ($resolvedTunnelMode -ne 'none' -and (Test-Path $UiEnvFile)) {
    Write-Warning 'ui/.env.local exists. Any public share will run with your local app secrets and external integrations enabled.'
}

Write-Step 'Resetting any previous share stack'
docker compose -p $ComposeProject -f $ComposeFile down --remove-orphans | Out-Null

$nextPid = Start-NextApp

Write-Step "Starting Nginx on http://127.0.0.1:$SharePort"
docker compose -p $ComposeProject -f $ComposeFile up -d nginx | Out-Null

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$SharePort" -TimeoutSeconds 60)) {
    throw "Nginx did not become ready on port $SharePort."
}

$publicUrl = $null
$publicHostname = $env:PUBLIC_HOSTNAME

switch ($resolvedTunnelMode) {
    'none' {
        Write-Step 'Tunnel disabled. The site is available only on localhost.'
    }
    'quick' {
        Write-Step 'Starting a Cloudflare quick tunnel'
        docker compose -p $ComposeProject -f $ComposeFile --profile quick up -d cloudflared-quick | Out-Null
        $publicUrl = Get-QuickTunnelUrl
        if (-not $publicUrl) {
            throw 'Quick tunnel started but the public URL could not be detected from container logs.'
        }
    }
    'named' {
        if (-not $env:TUNNEL_TOKEN) {
            throw 'Named tunnel mode requires TUNNEL_TOKEN in ops/share/.env.share or the current shell environment.'
        }

        Write-Step 'Starting the named Cloudflare tunnel'
        docker compose -p $ComposeProject -f $ComposeFile --profile named up -d cloudflared-named | Out-Null
        if (-not $publicHostname) {
            Write-Warning 'Named tunnel is running, but PUBLIC_HOSTNAME is not set so the friendly URL cannot be printed automatically.'
        }
    }
}

$state = [ordered]@{
    startedAt = (Get-Date).ToString('o')
    appMode = $AppMode
    appPort = $AppPort
    sharePort = $SharePort
    tunnelMode = $resolvedTunnelMode
    appPid = $nextPid
    publicUrl = $publicUrl
    publicHostname = $publicHostname
}

$state | ConvertTo-Json | Set-Content -Path $StateFile

Write-Host ''
Write-Host 'Share stack is ready.'
Write-Host "Local app:   http://127.0.0.1:$AppPort"
Write-Host "Local proxy: http://127.0.0.1:$SharePort"

if ($publicUrl) {
    Write-Host "Public URL:  $publicUrl"
}

if ($resolvedTunnelMode -eq 'named' -and $publicHostname) {
    Write-Host "Public host: https://$publicHostname"
}

if ($resolvedTunnelMode -eq 'quick') {
    Write-Warning 'Quick tunnels are best for simple view-only sharing. This app uses streaming endpoints, and Cloudflare documents that quick tunnels do not support SSE.'
}

Write-Host ''
Write-Host "To stop sharing, run: $PSScriptRoot\stop-share.ps1"
