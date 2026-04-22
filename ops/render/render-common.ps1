Set-StrictMode -Version Latest

$script:RenderRuntimeDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.runtime\render'
$script:RenderEnvFile = Join-Path $script:RenderRuntimeDir 'render-api.env'
$script:RenderConfigFile = Join-Path $script:RenderRuntimeDir 'service-config.json'

function Get-RenderApiKey {
    if (-not (Test-Path $script:RenderEnvFile)) {
        throw "Render API env file not found: $script:RenderEnvFile"
    }

    $line = Get-Content $script:RenderEnvFile | Where-Object { $_ -match '^RENDER_API_KEY=' } | Select-Object -First 1
    if (-not $line) {
        throw 'RENDER_API_KEY entry not found in render-api.env'
    }

    return ($line -split '=', 2)[1].Trim()
}

function Get-RenderServiceConfig {
    if (-not (Test-Path $script:RenderConfigFile)) {
        throw "Render service config not found: $script:RenderConfigFile"
    }

    return Get-Content $script:RenderConfigFile | ConvertFrom-Json
}

function Invoke-RenderApi {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Path,

        [object]$Body
    )

    $apiKey = Get-RenderApiKey
    $headers = @{
        Authorization = "Bearer $apiKey"
        Accept = 'application/json'
    }

    $uri = if ($Path.StartsWith('http')) { $Path } else { "https://api.render.com$Path" }

    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Headers $headers -Uri $uri
    }

    $headers['Content-Type'] = 'application/json'
    $jsonBody = $Body | ConvertTo-Json -Depth 20
    return Invoke-RestMethod -Method $Method -Headers $headers -Uri $uri -Body $jsonBody
}
