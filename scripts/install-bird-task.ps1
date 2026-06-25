# Registra a tarefa AUMI-Cockpit-Bird-Worker no Task Scheduler do Windows.
# Requer PowerShell como Administrador.

$TaskName  = "AUMI-Cockpit-Bird-Worker"
$ScriptPath = "D:\aumi-cockpit\scripts\run-bird-worker.ps1"

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# AtLogon + repetição a cada 15min indefinidamente
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Trigger.Repetition.Interval          = "PT15M"
$Trigger.Repetition.Duration          = "P9999D"
$Trigger.Repetition.StopAtDurationEnd = $false

$Settings = New-ScheduledTaskSettingsSet `
    -DisallowDemandStart:$false `
    -StopIfGoingOnBatteries:$false `
    -DisallowStartIfOnBatteries:$false `
    -ExecutionTimeLimit "PT5M" `
    -MultipleInstances IgnoreNew `
    -RunOnlyIfNetworkAvailable:$false

$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Task = New-ScheduledTask `
    -Action   $Action `
    -Trigger  $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "AUMI Cockpit bird-mentions worker — coleta sinais do X/Twitter a cada 15min"

Register-ScheduledTask -TaskName $TaskName -InputObject $Task

Write-Host ""
Write-Host "Tarefa registrada. Verificando:"
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
Write-Host ""
Write-Host "Para disparar agora:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
