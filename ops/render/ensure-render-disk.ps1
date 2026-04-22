[CmdletBinding()]
param(
    [string]$DiskName = 'app-data',
    [string]$MountPath = '/app/data',
    [int]$SizeGB = 10
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-common.ps1')

$config = Get-RenderServiceConfig
$deploys = Invoke-RenderApi -Method GET -Path "/v1/services/$($config.serviceId)/deploys"
$latestDeploy = $deploys[0].deploy

if ($latestDeploy.status -match 'pending|in_progress|created|queued|build_in_progress|update_in_progress') {
    throw "Cannot attach disk while latest deploy is still active: $($latestDeploy.status)"
}

$disks = Invoke-RenderApi -Method GET -Path '/v1/disks'
foreach ($entry in $disks) {
    $disk = if ($entry.disk) { $entry.disk } else { $entry }
    if ($disk.serviceId -eq $config.serviceId) {
        Write-Host "Disk already attached: $($disk.name) at $($disk.mountPath)"
        return
    }
}

$created = Invoke-RenderApi -Method POST -Path '/v1/disks' -Body @{
    name = $DiskName
    sizeGB = $SizeGB
    mountPath = $MountPath
    serviceId = $config.serviceId
}

$disk = if ($created.disk) { $created.disk } else { $created }
[pscustomobject]@{
    id = $disk.id
    name = $disk.name
    serviceId = $disk.serviceId
    mountPath = $disk.mountPath
    sizeGB = $disk.sizeGB
} | Format-List
