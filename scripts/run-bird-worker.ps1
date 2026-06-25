# Wrapper pra Task Scheduler. Loga em D:\aumi-cockpit\logs\bird-YYYY-MM-DD.log
$ErrorActionPreference = "Continue"
$ProjectDir = "D:\aumi-cockpit"
$LogDir = "$ProjectDir\logs"
$Today = (Get-Date).ToString("yyyy-MM-dd")
$LogFile = "$LogDir\bird-$Today.log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Set-Location $ProjectDir
$Stamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
Add-Content -Path $LogFile -Value "===== $Stamp =====" -Encoding UTF8

$Node = "C:\Program Files\nodejs\node.exe"

& $Node "workers\bird-mentions.mjs" --once 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8

$ExitCode = $LASTEXITCODE
Add-Content -Path $LogFile -Value "exit code: $ExitCode" -Encoding UTF8
exit $ExitCode
