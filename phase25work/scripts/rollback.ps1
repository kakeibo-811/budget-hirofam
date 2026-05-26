# ============================================================
# Rollback PRODUCTION D1 from backup
# Usage: ./scripts/rollback.ps1 backups/prod-YYYYMMDD-HHMMSS.sql
# ============================================================
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

Write-Host "WARNING: This will REPLACE production D1 contents from: $BackupFile" -ForegroundColor Red
$ans = Read-Host 'Type "ROLLBACK" to confirm'
if ($ans -ne 'ROLLBACK') {
    Write-Host 'Aborted.' -ForegroundColor Yellow
    exit 1
}

# 安全のため、ロールバック前に現状の追加バックアップ
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$preRollback = "backups/pre-rollback-$ts.sql"
Write-Host "Saving current state to $preRollback before rollback..." -ForegroundColor Cyan
npx wrangler d1 export budget-hirofam-prod --remote --output $preRollback --config worker/wrangler.toml

Write-Host "Restoring from $BackupFile ..." -ForegroundColor Cyan
npx wrangler d1 execute budget-hirofam-prod --remote --file $BackupFile --config worker/wrangler.toml

Write-Host "Rollback complete." -ForegroundColor Green
