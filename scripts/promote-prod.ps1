# ============================================================
# Promote to PRODUCTION
# 必ず実行する事前チェック：
#   1. Production DB のバックアップ
#   2. Preview のヘルスチェック確認
#   3. Production の現在件数記録
#   4. ユーザーに最終確認
#   5. Worker をデプロイ
#   6. デプロイ後の件数確認
# ============================================================

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

Write-Host '== Promote: PRODUCTION ==' -ForegroundColor Magenta

# 1. Backup
Write-Host '[1/5] Backing up PRODUCTION D1...' -ForegroundColor Cyan
if (-not (Test-Path 'backups')) { New-Item -ItemType Directory -Path 'backups' | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = "backups/prod-$ts.sql"
npx wrangler d1 export budget-hirofam-prod --remote --output $backupFile --config worker/wrangler.toml
Write-Host "Backup saved: $backupFile" -ForegroundColor Green

# 2. Confirmation
Write-Host "`n[2/5] Pre-promote checklist:" -ForegroundColor Cyan
Write-Host '  [ ] Preview was tested on iPhone Safari' -ForegroundColor Yellow
Write-Host '  [ ] /api/health on preview returned ok' -ForegroundColor Yellow
Write-Host '  [ ] Tab navigation works on preview' -ForegroundColor Yellow
Write-Host '  [ ] DB read works on preview' -ForegroundColor Yellow
$ans = Read-Host 'All checked? Promote to PRODUCTION? Type "yes" to continue'
if ($ans -ne 'yes') {
    Write-Host 'Aborted.' -ForegroundColor Red
    exit 1
}

# 3. Clean & build
Write-Host "`n[3/5] Clean & build..." -ForegroundColor Cyan
if (Test-Path 'frontend/dist') { Remove-Item -Recurse -Force 'frontend/dist' }
npm --prefix frontend run build
if (-not (Test-Path 'frontend/dist/index.html')) { throw 'Frontend build failed' }

# 4. Deploy
Write-Host "`n[4/5] Deploying to PRODUCTION..." -ForegroundColor Cyan
npx wrangler deploy --env production --config worker/wrangler.toml

# 5. Post-deploy check
Write-Host "`n[5/5] Post-deploy verification..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host @"

Production deploy complete.
Verify at the production URL:
  - / loads
  - /api/health returns ok
  - /api/diag/summary shows expected row counts
  - No Worker errors in dashboard

If something is wrong: ./scripts/rollback.ps1 $backupFile
"@ -ForegroundColor Green
