# ─── LuckyStop: Register Windows Scheduled Backup Tasks ────────────────────
# Run this once as Administrator to set up automatic backups.
# After running, tasks appear in Task Scheduler under "LuckyStop".
# ─────────────────────────────────────────────────────────────────────────────

$BACKUP_DIR  = $PSScriptRoot
$DB_SCRIPT   = Join-Path $BACKUP_DIR "backup-db.ps1"
$IMG_SCRIPT  = Join-Path $BACKUP_DIR "backup-images.js"

# Detect node path
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "ERROR: node.exe not found in PATH." -ForegroundColor Red
    exit 1
}
$nodePath = $nodeCmd.Source

Write-Host ""
Write-Host "Registering LuckyStop backup tasks..." -ForegroundColor Cyan

# ── 1. Weekly DB backup — every Sunday at 2:00 AM ──────────────────────────
$dbAction  = New-ScheduledTaskAction `
    -Execute  "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$DB_SCRIPT`""

$dbTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "02:00"

$dbSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName "LuckyStop\DB-Weekly-Backup" `
    -Action   $dbAction `
    -Trigger  $dbTrigger `
    -Settings $dbSettings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  DB backup: every Sunday at 2:00 AM" -ForegroundColor Green

# ── 2. Monthly image backup — first Sunday of each month at 3:00 AM ─────────
# Task Scheduler has no native "first Sunday of month" trigger, so we schedule
# weekly and let the script's rolling-retention handle duplicates harmlessly.
$imgAction  = New-ScheduledTaskAction `
    -Execute  $nodePath `
    -Argument "`"$IMG_SCRIPT`""

$imgTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "03:00"

$imgSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName "LuckyStop\Images-Weekly-Backup" `
    -Action   $imgAction `
    -Trigger  $imgTrigger `
    -Settings $imgSettings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  Image backup: every Sunday at 3:00 AM" -ForegroundColor Green

Write-Host ""
Write-Host "All done! Tasks are visible in:" -ForegroundColor Cyan
Write-Host "  Task Scheduler > Task Scheduler Library > LuckyStop"
Write-Host ""
Write-Host "To test immediately (without waiting for Sunday):"
Write-Host "  Start-ScheduledTask -TaskName 'LuckyStop\DB-Weekly-Backup'"
Write-Host "  Start-ScheduledTask -TaskName 'LuckyStop\Images-Weekly-Backup'"
