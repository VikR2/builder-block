[CmdletBinding()]
param(
    [string]$ReleaseTag = '',
    [string]$Repo = '',
    [string]$SourceDir = '.runtime/render-data/google-drive-upload',
    [string]$TargetBranch = '',
    [switch]$Overwrite,
    [int]$MaxRetries = 3
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

function Get-GitHubToken {
    if ($env:GH_TOKEN) {
        return $env:GH_TOKEN
    }

    $token = (& gh auth token).Trim()
    if (-not $token) {
        throw 'Unable to resolve a GitHub token from gh auth token.'
    }

    return $token
}

function Resolve-GitHubRepo {
    if ($Repo) {
        return $Repo
    }

    $remote = (& git remote get-url origin).Trim()
    if ($remote -match 'github\.com[:/](.+?)(?:\.git)?$') {
        return $Matches[1]
    }

    throw "Could not infer GitHub repo from remote URL: $remote"
}

function Invoke-GhApiJson {
    param(
        [string]$Path,
        [string]$Method = 'GET'
    )

    $args = @('api')
    if ($Method -ne 'GET') {
        $args += @('-X', $Method)
    }
    $args += $Path
    $json = & gh @args
    if (-not $json) {
        return $null
    }
    return $json | ConvertFrom-Json
}

function Get-Release {
    param(
        [string]$ResolvedRepo,
        [string]$Tag
    )

    try {
        return Invoke-GhApiJson -Path "repos/$ResolvedRepo/releases/tags/$Tag"
    } catch {
        return $null
    }
}

function Ensure-Release {
    param(
        [string]$ResolvedRepo,
        [string]$Tag,
        [string]$Branch
    )

    $release = Get-Release -ResolvedRepo $ResolvedRepo -Tag $Tag
    if ($release) {
        return $release
    }

    & gh release create $Tag `
        --repo $ResolvedRepo `
        --title "Render data bundle $Tag" `
        --notes "Runtime data migration bundle for Render. Download all part files, concatenate them into render-data-bundle.zip, then restore with scripts/render_restore_data_bundle.py." `
        --target $Branch | Out-Null

    return Get-Release -ResolvedRepo $ResolvedRepo -Tag $Tag
}

function Get-ReleaseAssets {
    param(
        [string]$ResolvedRepo,
        [int]$ReleaseId
    )

    $assets = Invoke-GhApiJson -Path "repos/$ResolvedRepo/releases/$ReleaseId/assets"
    return @($assets)
}

function Remove-ReleaseAsset {
    param(
        [string]$ResolvedRepo,
        [int]$AssetId
    )

    & gh api -X DELETE "repos/$ResolvedRepo/releases/assets/$AssetId" | Out-Null
}

function Upload-Asset {
    param(
        [string]$ResolvedRepo,
        [int]$ReleaseId,
        [string]$Token,
        [System.IO.FileInfo]$File
    )

    $headers = @{
        Authorization = "token $Token"
        'Content-Type' = 'application/octet-stream'
        Accept = 'application/json'
    }

    $encodedName = [uri]::EscapeDataString($File.Name)
    $uri = "https://uploads.github.com/repos/$ResolvedRepo/releases/$ReleaseId/assets?name=$encodedName"

    $attempt = 1
    while ($attempt -le $MaxRetries) {
        try {
            Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -InFile $File.FullName -TimeoutSec 7200 | Out-Null
            return
        } catch {
            if ($attempt -ge $MaxRetries) {
                throw
            }
            Start-Sleep -Seconds ([Math]::Min(30, 5 * $attempt))
            $attempt += 1
        }
    }
}

$resolvedRepo = Resolve-GitHubRepo
if (-not $ReleaseTag) {
    $ReleaseTag = "render-data-bundle-{0}" -f (Get-Date -Format 'yyyyMMdd')
}
if (-not $TargetBranch) {
    $TargetBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
}

$token = Get-GitHubToken
$sourcePath = Resolve-Path $SourceDir
$files = Get-ChildItem $sourcePath -File | Sort-Object Name
if ($files.Count -eq 0) {
    throw "No files found in $sourcePath"
}

$release = Ensure-Release -ResolvedRepo $resolvedRepo -Tag $ReleaseTag -Branch $TargetBranch
$releaseId = [int]$release.id
$assets = Get-ReleaseAssets -ResolvedRepo $resolvedRepo -ReleaseId $releaseId

Write-Host "Release: $ReleaseTag"
Write-Host "Repo:    $resolvedRepo"
Write-Host "Branch:  $TargetBranch"
Write-Host ''

foreach ($file in $files) {
    $existing = $assets | Where-Object { $_.name -eq $file.Name } | Select-Object -First 1

    if ($existing -and -not $Overwrite) {
        Write-Host "Skip  $($file.Name) (already uploaded)"
        continue
    }

    if ($existing -and $Overwrite) {
        Write-Host "Delete $($file.Name) (overwrite requested)"
        Remove-ReleaseAsset -ResolvedRepo $resolvedRepo -AssetId ([int]$existing.id)
    }

    Write-Host "Upload $($file.Name) ..."
    Upload-Asset -ResolvedRepo $resolvedRepo -ReleaseId $releaseId -Token $token -File $file
    $assets = Get-ReleaseAssets -ResolvedRepo $resolvedRepo -ReleaseId $releaseId
}

Write-Host ''
Write-Host 'Final release assets:'
($assets | Select-Object -ExpandProperty name | Sort-Object) | ForEach-Object { Write-Host "  $_" }
