[CmdletBinding()]
param(
    [switch]$ClearCache
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-common.ps1')

$config = Get-RenderServiceConfig
$body = @{
    clearCache = if ($ClearCache) { 'clear' } else { 'do_not_clear' }
}

$deploy = Invoke-RenderApi -Method POST -Path "/v1/services/$($config.serviceId)/deploys" -Body $body
$result = if ($deploy.deploy) { $deploy.deploy } else { $deploy }

[pscustomobject]@{
    deployId = $result.id
    status = $result.status
    createdAt = $result.createdAt
} | Format-List
