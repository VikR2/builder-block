[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-common.ps1')

$config = Get-RenderServiceConfig
$service = Invoke-RenderApi -Method GET -Path "/v1/services/$($config.serviceId)"
$deploys = Invoke-RenderApi -Method GET -Path "/v1/services/$($config.serviceId)/deploys"
$envVars = Invoke-RenderApi -Method GET -Path "/v1/services/$($config.serviceId)/env-vars"
$disks = Invoke-RenderApi -Method GET -Path '/v1/disks'

$serviceDisks = @()
foreach ($entry in $disks) {
    $disk = if ($entry.disk) { $entry.disk } else { $entry }
    if ($disk.serviceId -eq $config.serviceId) {
        $serviceDisks += $disk
    }
}

[pscustomobject]@{
    serviceId = $service.id
    serviceName = $service.name
    url = $service.serviceDetails.url
    branch = $service.branch
    healthCheckPath = $service.serviceDetails.healthCheckPath
    latestDeployStatus = $deploys[0].deploy.status
    envVarCount = @($envVars).Count
    diskCount = @($serviceDisks).Count
} | Format-List
