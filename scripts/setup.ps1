# ============================================================
# Budget HiroFam - Setup script
# 一度だけ実行する初期セットアップ。
#
# 使い方：
#   PS> cd <project-root>
#   PS> ./scripts/setup.ps1
#
# 何をするか：
#   1. npm 依存をインストール
#   2. wrangler login （ブラウザが開く）
#   3. D1 データベースを2つ作成（preview と prod）
#   4. その database_id を wrangler.toml に自動で書き込む
#   5. マイグレーションを両方の D1 に適用
#   6. Cloudflare Access の設定方法を表示
# ============================================================

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

Write-Host '== Budget HiroFam Setup ==' -ForegroundColor Cyan
Write-Host "project root: $root"

# 1. npm install
Write-Host "`n[1/6] npm install..." -ForegroundColor Cyan
npm install
npm --prefix frontend install
npm --prefix worker install

# 2. wrangler login
Write-Host "`n[2/6] wrangler login (browser will open)..." -ForegroundColor Cyan
npx wrangler login

# 3. D1 create
Write-Host "`n[3/6] Creating D1 databases..." -ForegroundColor Cyan
$wranglerToml = "worker/wrangler.toml"

function Get-D1IdFromCreate {
    param([string]$dbName)
    Write-Host "Creating D1: $dbName"
    $output = npx wrangler d1 create $dbName --config $wranglerToml 2>&1 | Out-String
    if ($output -match 'database_id\s*=\s*"([^"]+)"') {
        return $matches[1]
    } elseif ($output -match 'already exists' -or $output -match 'already exists') {
        # 既に存在する場合は list から拾う
        $list = npx wrangler d1 list --config $wranglerToml --json 2>&1 | Out-String
        $obj = $list | ConvertFrom-Json
        $found = $obj | Where-Object { $_.name -eq $dbName } | Select-Object -First 1
        if ($found) { return $found.uuid }
    }
    throw "Failed to obtain database_id for $dbName. Raw output:`n$output"
}

$previewId = Get-D1IdFromCreate -dbName 'budget-hirofam-preview'
$prodId    = Get-D1IdFromCreate -dbName 'budget-hirofam-prod'

Write-Host "preview database_id: $previewId" -ForegroundColor Green
Write-Host "prod database_id   : $prodId" -ForegroundColor Green

# 4. wrangler.toml への ID 書き込み
Write-Host "`n[4/6] Patching wrangler.toml..." -ForegroundColor Cyan
$tomlText = Get-Content $wranglerToml -Raw -Encoding UTF8
$tomlText = $tomlText -replace 'REPLACE_WITH_PREVIEW_DB_ID', $previewId
$tomlText = $tomlText -replace 'REPLACE_WITH_PROD_DB_ID', $prodId
Set-Content -Path $wranglerToml -Value $tomlText -Encoding UTF8 -NoNewline
Write-Host "wrangler.toml updated."

# 5. マイグレーション適用
Write-Host "`n[5/6] Applying migrations to PREVIEW..." -ForegroundColor Cyan
npx wrangler d1 migrations apply budget-hirofam-preview --remote --config $wranglerToml

Write-Host "`n[5/6] Applying migrations to PRODUCTION..." -ForegroundColor Cyan
$confirm = Read-Host 'Apply migrations to PRODUCTION? (y/N)'
if ($confirm -eq 'y' -or $confirm -eq 'Y') {
    npx wrangler d1 migrations apply budget-hirofam-prod --remote --config $wranglerToml
} else {
    Write-Host 'Skipped production migration.' -ForegroundColor Yellow
}

# 6. Cloudflare Access 案内
Write-Host "`n[6/6] Cloudflare Access setup (manual)..." -ForegroundColor Cyan
Write-Host @"

== Cloudflare Access Manual Steps ==
After deploying, configure Access in the Cloudflare dashboard:

1. Visit https://one.dash.cloudflare.com/ -> Access -> Applications -> Add an application
2. Choose "Self-hosted"
3. Application domain: your worker URL or custom domain (e.g. budget-hirofam-prod.<account>.workers.dev)
4. Identity provider: e.g. One-time PIN (email)
5. Add a policy that allows your two emails (Toshi & Lisa)
6. After creation, copy:
   - Application Audience (AUD) Tag    -> CF_ACCESS_AUD
   - Team domain (e.g. yourteam.cloudflareaccess.com) -> CF_ACCESS_TEAM_DOMAIN

Then update worker/wrangler.toml [env.preview.vars] and [env.production.vars]:
   CF_ACCESS_TEAM_DOMAIN = "yourteam.cloudflareaccess.com"
   CF_ACCESS_AUD = "abc123def456..."

Then redeploy: ./scripts/deploy-preview.ps1
"@ -ForegroundColor Yellow

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "Next: ./scripts/deploy-preview.ps1" -ForegroundColor Cyan
