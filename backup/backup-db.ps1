# ─── LuckyStop: Neon Database Backup ────────────────────────────────────────
# Saves a full SQL dump and keeps only the 3 most recent files.
#
# CONFIGURE: set BACKUP_ROOT to your external hard drive path
$BACKUP_ROOT = "S:\LuckyStopBackups\database"
# ─────────────────────────────────────────────────────────────────────────────

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Read DATABASE_URL from backend/.env (the DIRECT_URL — pooler doesn't work with pg_dump)
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
$directUrl = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^DIRECT_URL="?([^"]+)"?$') {
        $directUrl = $matches[1]
        break
    }
}
if (-not $directUrl) { Write-Error "Could not read DIRECT_URL from backend/.env"; exit 1 }

# pg_dump check
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: pg_dump not found." -ForegroundColor Red
    Write-Host "Install PostgreSQL (any version) from https://www.postgresql.org/download/windows/"
    Write-Host "Then add its \bin folder to your PATH and re-run this script."
    exit 1
}

# Ensure backup directory exists
if (-not (Test-Path $BACKUP_ROOT)) {
    New-Item -ItemType Directory -Path $BACKUP_ROOT -Force | Out-Null
}

$date     = Get-Date -Format "yyyy-MM-dd_HH-mm"
$outFile  = Join-Path $BACKUP_ROOT "luckystop_$date.sql"

Write-Host ""
Write-Host "Backing up LuckyStop database..." -ForegroundColor Cyan
pg_dump $directUrl --no-password -f $outFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "BACKUP FAILED (exit code $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

$sizeMB = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host "Saved: $outFile ($sizeMB MB)" -ForegroundColor Green

# Rolling retention: keep 3 most recent, delete the rest
[array]$all = @(Get-ChildItem $BACKUP_ROOT -Filter "luckystop_*.sql" |
                Sort-Object LastWriteTime -Descending)

if ($all.Count -gt 3) {
    $all | Select-Object -Skip 3 | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "Removed old backup: $($_.Name)" -ForegroundColor DarkGray
    }
}

Write-Host "Done. Backups kept: $([math]::Min($all.Count, 3))" -ForegroundColor Green

# ── Backup critical secrets (keystore, .env, Firebase SDK JSON) ───────────
Write-Host ""
Write-Host "Backing up secrets..." -ForegroundColor Cyan

$SECRETS_DIR = Join-Path (Split-Path $BACKUP_ROOT) "secrets"
if (-not (Test-Path $SECRETS_DIR)) {
    New-Item -ItemType Directory -Path $SECRETS_DIR -Force | Out-Null
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# Android keystore
[array]$keystores = @(Get-ChildItem $projectRoot -Recurse -Filter "*.jks" -ErrorAction SilentlyContinue |
                      Where-Object { $_.FullName -notmatch "node_modules" })
foreach ($ks in $keystores) {
    Copy-Item $ks.FullName (Join-Path $SECRETS_DIR $ks.Name) -Force
    Write-Host "  Keystore: $($ks.Name)" -ForegroundColor Green
}

# backend .env
$envSrc = Join-Path $projectRoot "backend\.env"
if (Test-Path $envSrc) {
    Copy-Item $envSrc (Join-Path $SECRETS_DIR "backend.env") -Force
    Write-Host "  backend/.env" -ForegroundColor Green
}

# Firebase Admin SDK JSON
[array]$fbJsons = @(Get-ChildItem $projectRoot -Filter "*firebase-adminsdk*.json" -ErrorAction SilentlyContinue |
                    Where-Object { $_.FullName -notmatch "node_modules" })
foreach ($fb in $fbJsons) {
    Copy-Item $fb.FullName (Join-Path $SECRETS_DIR $fb.Name) -Force
    Write-Host "  Firebase SDK: $($fb.Name)" -ForegroundColor Green
}

Write-Host "Secrets saved to: $SECRETS_DIR" -ForegroundColor Green
