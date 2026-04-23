[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://builder-block.onrender.com'
)

$ErrorActionPreference = 'Stop'

function Invoke-SmokeRequest {
    param(
        [string]$Url,
        [int]$TimeoutSec = 30
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return [pscustomobject]@{
            url = $Url
            statusCode = $response.StatusCode
            ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
        }
    } catch {
        return [pscustomobject]@{
            url = $Url
            statusCode = $null
            ok = $false
            error = $_.Exception.Message
        }
    }
}

$checks = @(
    '/',
    '/api/health',
    '/pricing',
    '/login',
    '/tcm'
) | ForEach-Object {
    Invoke-SmokeRequest -Url ($BaseUrl.TrimEnd('/') + $_)
}

$checks | Format-Table -AutoSize

if ($checks.Where({ -not $_.ok }).Count -gt 0) {
    exit 1
}
