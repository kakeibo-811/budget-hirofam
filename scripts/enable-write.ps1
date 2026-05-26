# ============================================================
# Enable / disable WRITE_ENABLED feature flag
# Usage:
#   ./scripts/enable-write.ps1 -Env preview -Enable $true
#   ./scripts/enable-write.ps1 -Env production -Enable $false
# ============================================================
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('preview', 'production')]
    [string]$Env,
    [Parameter(Mandatory = $true)]
    [bool]$Enable
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

$tomlFile = 'worker/wrangler.toml'
$content = Get-Content $tomlFile -Raw -Encoding UTF8

$envSection = "\[env\.$Env\.vars\]"
$marker = if ($Enable) { 'true' } else { 'false' }

# 該当 env セクション内の WRITE_ENABLED 行を置換
$pattern = "(?ms)($envSection.*?WRITE_ENABLED\s*=\s*"")[^""]*("")"
$replacement = "`${1}$marker`${2}"
$content = [regex]::Replace($content, $pattern, $replacement)

Set-Content -Path $tomlFile -Value $content -Encoding UTF8 -NoNewline
Write-Host "WRITE_ENABLED set to '$marker' for env=$Env. Now redeploy:" -ForegroundColor Green
Write-Host "  ./scripts/deploy-$Env.ps1" -ForegroundColor Cyan
