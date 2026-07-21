[CmdletBinding()]
param(
    [string]$LocalEnvFile = 'ui/.env.local',
    [string]$PublicUrl = '',
    [switch]$OnlyLocalKeys
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-common.ps1')

function Read-EnvFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    Get-Content $Path | Where-Object {
        $_ -match '=' -and -not $_.Trim().StartsWith('#')
    } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }

    return $values
}

$config = Get-RenderServiceConfig
$pairs = Read-EnvFile -Path $LocalEnvFile

if (-not $OnlyLocalKeys) {
    $resolvedUrl = if ($PublicUrl) { $PublicUrl } else { $config.serviceUrl }
    $pairs['NODE_ENV'] = 'production'
    $pairs['NEXT_TELEMETRY_DISABLED'] = '1'
    $pairs['NEXT_PUBLIC_APP_URL'] = $resolvedUrl
    $pairs['NEXT_PUBLIC_BASE_URL'] = $resolvedUrl
    $pairs['TCM_EMBEDDING_PROVIDER'] = 'google-gemini-api'
    $pairs['TCM_EMBEDDING_MODEL'] = 'gemini-embedding-2-preview'
    if ($pairs.ContainsKey('ANTHROPIC_API_KEY')) {
        $pairs['TCM_LLM_PROVIDER'] = 'anthropic'
    }
}

$updatedKeys = New-Object System.Collections.Generic.List[string]

foreach ($key in $pairs.Keys) {
    $value = [string]$pairs[$key]
    if ([string]::IsNullOrWhiteSpace($value)) {
        continue
    }

    Invoke-RenderApi -Method PUT -Path "/v1/services/$($config.serviceId)/env-vars/$key" -Body @{
        value = $value
    } | Out-Null

    [void]$updatedKeys.Add($key)
}

Write-Host 'Updated Render environment variable keys:'
$updatedKeys | Sort-Object | ForEach-Object { Write-Host "  $_" }
