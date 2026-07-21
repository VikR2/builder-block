[CmdletBinding()]
param(
    [switch]$ResetStaging,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

$AllowedPrefixes = @(
    '.github/',
    'docs/',
    'ops/render/',
    'ops/share/',
    'scripts/',
    'ui/',
    'data/migrations/'
)

$AllowedExact = @(
    '.gitignore',
    'AGENTS.md',
    'README.md',
    'SETUP.md',
    'Dockerfile',
    'render.yaml',
    'requirements.render.txt',
    'data/schema.sql'
)

$ExcludedPrefixes = @(
    '.Codex/',
    '.agents/',
    '.claude/',
    '.playwright-mcp/',
    '.serena/',
    'data/local-videos/',
    'data/local-videos-legacy/',
    'data/video-frames/',
    'screenshots/',
    'scripts-output/',
    'thoughts/',
    'ui/.next/',
    'ui/playwright-report/',
    'ui/test-results/'
)

$ExcludedExact = @(
    'data/builder.db',
    'data/builder.db-shm',
    'data/builder.db-wal',
    'ui/nul',
    'ui/tsconfig.tsbuildinfo'
)

$ExcludedSuffixes = @(
    '/CLAUDE.md'
)

function Test-AllowedPath {
    param([string]$Path)

    if ($ExcludedExact -contains $Path) {
        return $false
    }

    foreach ($prefix in $ExcludedPrefixes) {
        if ($Path.StartsWith($prefix)) {
            return $false
        }
    }

    foreach ($suffix in $ExcludedSuffixes) {
        if ($Path.EndsWith($suffix)) {
            return $false
        }
    }

    if ($AllowedExact -contains $Path) {
        return $true
    }

    foreach ($prefix in $AllowedPrefixes) {
        if ($Path.StartsWith($prefix)) {
            return $true
        }
    }

    return $false
}

if ($ResetStaging) {
    Write-Host 'Resetting staged files only'
    git reset --quiet
}

$statusLines = git status --short
if (-not $statusLines) {
    Write-Host 'No working tree changes found.'
    exit 0
}

$candidatePaths = New-Object System.Collections.Generic.HashSet[string]

foreach ($line in $statusLines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    $pathPart = $line.Substring(3).Trim()
    if ($pathPart.Contains(' -> ')) {
        $pathPart = ($pathPart -split ' -> ')[1].Trim()
    }

    if ([string]::IsNullOrWhiteSpace($pathPart)) {
        continue
    }

    $normalizedPath = $pathPart.Replace('\', '/')
    $resolvedPath = Join-Path $RepoRoot ($normalizedPath -replace '/', [IO.Path]::DirectorySeparatorChar)

    if ((Test-Path $resolvedPath) -and (Get-Item $resolvedPath).PSIsContainer) {
        Get-ChildItem -Path $resolvedPath -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
            [void]$candidatePaths.Add($relative)
        }
        continue
    }

    [void]$candidatePaths.Add($normalizedPath)
}

$stageable = @($candidatePaths | Where-Object { Test-AllowedPath $_ } | Sort-Object)
$skipped = @($candidatePaths | Where-Object { -not (Test-AllowedPath $_) } | Sort-Object)

Write-Host ''
Write-Host 'Stageable code/config paths:'
if ($stageable.Count -eq 0) {
    Write-Host '  (none)'
} else {
    $stageable | ForEach-Object { Write-Host "  $_" }
}

Write-Host ''
Write-Host 'Skipped runtime/local-data paths:'
if ($skipped.Count -eq 0) {
    Write-Host '  (none)'
} else {
    $skipped | ForEach-Object { Write-Host "  $_" }
}

if ($DryRun) {
    Write-Host ''
    Write-Host 'Dry run only. Nothing was staged.'
    exit 0
}

if ($stageable.Count -eq 0) {
    Write-Host ''
    Write-Host 'No repo-safe files matched the release allowlist.'
    exit 0
}

Write-Host ''
Write-Host 'Staging repo-safe paths...'
foreach ($path in $stageable) {
    git add -- $path
}

Write-Host ''
Write-Host 'Currently staged files:'
git diff --cached --name-only
