[CmdletBinding()]
param(
    [string]$HealthCheckPath = '/api/health'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-common.ps1')

$config = Get-RenderServiceConfig
$updated = Invoke-RenderApi -Method PATCH -Path "/v1/services/$($config.serviceId)" -Body @{
    serviceDetails = @{
        healthCheckPath = $HealthCheckPath
    }
}

[pscustomobject]@{
    serviceId = $updated.id
    serviceName = $updated.name
    healthCheckPath = $updated.serviceDetails.healthCheckPath
} | Format-List
