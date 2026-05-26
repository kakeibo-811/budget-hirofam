# ============================================================
# Backup PRODUCTION D1
# ============================================================
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

if (-not (Test-Path 'backups')) { New-Item -ItemType Directory -Path 'backups' | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = "backups/prod-$ts.sql"
Write-Host "Exporting prod D1 to $out ..." -ForegroundColor Cyan
npx wrangler d1 export budget-hirofam-prod --remote --output $out --config worker/wrangler.toml
Write-Host "Done: $out" -ForegroundColor Green
