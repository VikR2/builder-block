[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [datetime]$StartTime,

    [Parameter(Mandatory)]
    [datetime]$StopTime,

    [ValidateSet('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')]
    [string[]]$Days = @('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'),

    [ValidateSet('prod', 'dev')]
    [string]$AppMode = 'prod',

    [ValidateSet('auto', 'none', 'quick', 'named')]
    [string]$TunnelMode = 'auto',

    [string]$TaskPrefix = 'builder-block-share'
)

$ErrorActionPreference = 'Stop'

$startScript = Join-Path $PSScriptRoot 'start-share.ps1'
$stopScript = Join-Path $PSScriptRoot 'stop-share.ps1'

$startAction = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -AppMode $AppMode -TunnelMode $TunnelMode"

$stopAction = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$stopScript`""

$startTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $StartTime
$stopTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $StopTime

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName "$TaskPrefix-start" `
    -Action $startAction `
    -Trigger $startTrigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Register-ScheduledTask `
    -TaskName "$TaskPrefix-stop" `
    -Action $stopAction `
    -Trigger $stopTrigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "Scheduled tasks registered:"
Write-Host "  $TaskPrefix-start at $($StartTime.ToString('HH:mm')) on $($Days -join ', ')"
Write-Host "  $TaskPrefix-stop at $($StopTime.ToString('HH:mm')) on $($Days -join ', ')"
