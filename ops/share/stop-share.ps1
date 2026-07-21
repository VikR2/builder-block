[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ComposeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$RuntimeDir = Join-Path $RepoRoot '.runtime\share'
$PidFile = Join-Path $RuntimeDir 'next.pid'
$StateFile = Join-Path $RuntimeDir 'share-state.json'
$ComposeProject = 'builderblockshare'

$env:COMPOSE_PROJECT_NAME = $ComposeProject

Write-Host '==> Stopping Cloudflare tunnel and Nginx'
docker compose -p $ComposeProject -f $ComposeFile down --remove-orphans | Out-Null

$remainingContainers = docker ps -aq --filter "name=$ComposeProject"
if ($remainingContainers) {
    foreach ($containerId in $remainingContainers) {
        docker rm -f $containerId | Out-Null
    }
}

docker network rm "${ComposeProject}_default" | Out-Null 2>$null

if (Test-Path $PidFile) {
    $appPid = Get-Content $PidFile | Select-Object -First 1
    if ($appPid) {
        try {
            Stop-Process -Id ([int]$appPid) -Force -ErrorAction Stop
            Write-Host "==> Stopped Next.js process $appPid"
        } catch {
            Write-Warning "Next.js process $appPid was not running."
        }
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

if (Test-Path $StateFile) {
    Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
}

Write-Host 'Share stack stopped.'
