# ============================================================
# Deploy to PREVIEW environment
# ============================================================
# 過去事故対策：
# - 必ず dist を削除してからビルド（汚染防止）
# - env を必ず明示
# - デプロイ後に /api/health を叩いて疎通確認
# ============================================================

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

Write-Host '== Deploy: PREVIEW ==' -ForegroundColor Cyan

# Clean
Write-Host '[1/4] Cleaning dist...' -ForegroundColor Cyan
if (Test-Path 'frontend/dist') { Remove-Item -Recurse -Force 'frontend/dist' }
if (Test-Path 'worker/dist')   { Remove-Item -Recurse -Force 'worker/dist' }

# Build frontend
Write-Host "`n[2/4] Building frontend..." -ForegroundColor Cyan
npm --prefix frontend run build
if (-not (Test-Path 'frontend/dist/index.html')) {
    throw 'Frontend build failed: frontend/dist/index.html not found'
}

# Deploy worker (Workers assets binding via [assets])
Write-Host "`n[3/4] Deploying worker (preview)..." -ForegroundColor Cyan
npx wrangler@4 deploy --env preview --config worker/wrangler.toml

# Health check
Write-Host "`n[4/4] Health check..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
# wrangler の出力からURLを抽出するのは脆弱なので、ユーザーに案内
Write-Host @"

Preview deployed.
Open the worker URL printed above, sign in via Cloudflare Access, and check:
  - / loads the app shell
  - /api/health returns JSON with status:ok and db.ok:true
  - Tab navigation works
  - Theme/lang toggles work
"@ -ForegroundColor Green
