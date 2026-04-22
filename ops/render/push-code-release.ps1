[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CommitMessage,

    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

$stageScript = Join-Path $PSScriptRoot 'stage-code-release.ps1'

Write-Host 'Staging repo-safe release files...'
powershell -ExecutionPolicy Bypass -File $stageScript -ResetStaging

$stagedFiles = git diff --cached --name-only
if (-not $stagedFiles) {
    throw 'No repo-safe files were staged. Nothing to commit.'
}

Write-Host ''
Write-Host 'Creating commit...'
git commit -m $CommitMessage

if ($NoPush) {
    Write-Host ''
    Write-Host 'Commit created. Push skipped because -NoPush was used.'
    exit 0
}

$branch = git rev-parse --abbrev-ref HEAD
Write-Host ''
Write-Host "Pushing to origin/$branch ..."
git push -u origin $branch
