# ============================================================
# Deploy PREVIEW with WRITE_ENABLED=true
# Production is not touched.
# ============================================================
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

Write-Host '== Enable WRITE_ENABLED for PREVIEW only ==' -ForegroundColor Cyan
$content = Get-Content 'worker/wrangler.toml' -Raw -Encoding UTF8
$pattern = '(?ms)(\[env\.preview\.vars\].*?WRITE_ENABLED\s*=\s*")[^"]*(")'
$content = [regex]::Replace($content, $pattern, '${1}true${2}')
Set-Content 'worker/wrangler.toml' $content -Encoding UTF8 -NoNewline

Write-Host '== Apply preview migrations ==' -ForegroundColor Cyan
Push-Location 'worker'
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml
Pop-Location

Write-Host '== Build frontend ==' -ForegroundColor Cyan
npm --prefix frontend run build

Write-Host '== TypeScript check ==' -ForegroundColor Cyan
Push-Location 'worker'
npx tsc --noEmit

Write-Host '== Deploy preview ==' -ForegroundColor Cyan
npx wrangler@4 deploy --env preview --config wrangler.toml
Pop-Location

Write-Host '== Health check ==' -ForegroundColor Cyan
Invoke-WebRequest 'https://budget-hirofam-preview.xn487gnzwp.workers.dev/api/health' -UseBasicParsing
Start-Process 'https://budget-hirofam-preview.xn487gnzwp.workers.dev'
