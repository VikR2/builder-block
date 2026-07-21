[CmdletBinding()]
param(
    [string]$SourceBranch = '',
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

$currentBranch = git rev-parse --abbrev-ref HEAD
if (-not $SourceBranch) {
    $SourceBranch = $currentBranch
}

if ($SourceBranch -eq 'production') {
    throw 'Source branch is already production. Switch to the branch you want to promote.'
}

$hasProduction = $false
try {
    git show-ref --verify --quiet refs/heads/production
    if ($LASTEXITCODE -eq 0) {
        $hasProduction = $true
    }
} catch {
    $hasProduction = $false
}

if (-not $hasProduction) {
    Write-Host 'Creating local production branch from source branch...'
    git branch production $SourceBranch
}

Write-Host "Checking out production branch..."
git checkout production

Write-Host "Resetting production branch to $SourceBranch ..."
git reset --hard $SourceBranch

if ($NoPush) {
    Write-Host ''
    Write-Host "Production branch now matches $SourceBranch locally. Push skipped due to -NoPush."
    exit 0
}

Write-Host ''
Write-Host 'Pushing production branch to origin...'
git push -u origin production --force-with-lease
