<#
.SYNOPSIS
     打包 AIHardwareChecker 供發布。自動處理安全問題、建置 EXE、壓縮 ZIP。

.DESCRIPTION
     1. 用 `git archive` 提取已 commit 的原始碼（自動排除 .env、機密、快取）
     2. 建置 PyInstaller EXE
     3. gitleaks + grep 雙重掃描最終產出物
     4. 合併原始碼 + EXE 成一個 .zip → `dist/AIHardwareChecker.zip`（給朋友）
     5. 用 7-Zip 壓縮純 EXE 成 ZIP → `download/AIHardwareChecker.zip`（給網頁陌生人下載，防毒較友善）

     使用者只需：執行此腳本 → 取得 dist/AIHardwareChecker.zip 發給朋友 + download/ 給網頁。
#>

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $ROOT

# ── 設定 ──
$OUTPUT_DIR = Join-Path $ROOT "dist"
$OUTPUT_ZIP = Join-Path $OUTPUT_DIR "AIHardwareChecker.zip"

# ── 步驟 1：確認 git archive 可行（未 commit 的變更不會被納入） ──
Write-Host "=== 步驟 1/6：檢查 git 狀態 ===" -ForegroundColor Cyan
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  以下檔案未 commit，不會被包含在發布包中：" -ForegroundColor Yellow
    $status | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkYellow }
    Write-Host "  自動繼續（未 commit 檔案將被排除）" -ForegroundColor DarkGray
}

# ── 步驟 2：建置 PyInstaller EXE ──
Write-Host "=== 步驟 2/6：建置 EXE ===" -ForegroundColor Cyan
$pyi = Get-Command "pyinstaller" -ErrorAction SilentlyContinue
if (-not $pyi) {
    Write-Host "❌ pyinstaller 未安裝。執行：pip install pyinstaller" -ForegroundColor Red
    exit 1
}

Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue
Remove-Item -Force "AIHardwareChecker.spec" -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $OUTPUT_DIR "AIHardwareChecker.exe") -ErrorAction SilentlyContinue

pyinstaller --onefile --console --name "AIHardwareChecker" `
    --add-data "index.html;." `
    --add-data "app.js;." `
    --add-data "models.json;." `
    --add-data "models.js;." `
    --add-data "detect-hardware.ps1;." `
    app.py
if ($LASTEXITCODE -ne 0) { Write-Host "❌ PyInstaller 建置失敗" -ForegroundColor Red; exit 1 }

$EXE_PATH = Join-Path $OUTPUT_DIR "AIHardwareChecker.exe"
if (-not (Test-Path $EXE_PATH)) { Write-Host "❌ EXE 未產生" -ForegroundColor Red; exit 1 }
Write-Host "  ✅ EXE 建置完成：$EXE_PATH" -ForegroundColor Green

# ── 步驟 3：用 git archive 提取乾淨原始碼 ──
Write-Host "=== 步驟 3/6：提取原始碼 ===" -ForegroundColor Cyan
$extractDir = Join-Path $OUTPUT_DIR "AIHardwareChecker"
Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

$archiveTemp = Join-Path $env:TEMP "AIHC_archive_$(Get-Random).zip"
git archive --format=zip HEAD -o $archiveTemp
Expand-Archive -DestinationPath $extractDir -Force -Path $archiveTemp
Remove-Item -Force $archiveTemp -ErrorAction SilentlyContinue
Write-Host "  ✅ 原始碼提取至：$extractDir" -ForegroundColor Green

# 複製 EXE 進原始碼目錄
Copy-Item $EXE_PATH $extractDir
Write-Host "  ✅ EXE 已合併至原始碼目錄" -ForegroundColor Green

# ── 步驟 4：gitleaks + grep 雙重掃描 ──
Write-Host "=== 步驟 4/6：Secret 掃描（gitleaks + grep）===" -ForegroundColor Cyan

# 4a. gitleaks：150+ 種 secret pattern 廣篩
if (-not (Get-Command "gitleaks" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ gitleaks 未安裝。winget install gitleaks" -ForegroundColor Red
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    exit 1
}

$savedEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& gitleaks detect --source "$extractDir" --no-git --exit-code 1 --report-path "$env:TEMP\gitleaks-report.json" 2>$null
$ErrorActionPreference = $savedEA
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ gitleaks 掃到 secret pattern！報告：$env:TEMP\gitleaks-report.json" -ForegroundColor Red
    if (Test-Path "$env:TEMP\gitleaks-report.json") {
        Get-Content "$env:TEMP\gitleaks-report.json" | ConvertFrom-Json | ForEach-Object {
            Write-Host "    $($_.File):$($_.StartLine) — $($_.RuleID)" -ForegroundColor Red
        }
    }
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  ✅ gitleaks 通過（無 secret pattern）" -ForegroundColor Green

# 4b. grep：針對性確認關鍵字
$grepFiles = Get-ChildItem -Recurse -File "$extractDir\*" | Where-Object { $_.Name -ne "pack.ps1" }
$grepHits = $grepFiles | Select-String -Pattern "(?-i)(sk-|api_key|API_KEY|token|secret|password)" -SimpleMatch
if ($grepHits) {
    Write-Host "❌ grep 掃到敏感字串！" -ForegroundColor Red
    $grepHits | ForEach-Object { Write-Host "    $($_.Filename):$($_.LineNumber)" -ForegroundColor Red }
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  ✅ grep 字串掃描通過" -ForegroundColor Green

# ── 步驟 5：壓縮成 .zip ──
Write-Host "=== 步驟 5/6：壓縮 ZIP ===" -ForegroundColor Cyan
Remove-Item -Force $OUTPUT_ZIP -ErrorAction SilentlyContinue

$sevenZip = Get-Command "7z" -ErrorAction SilentlyContinue
if ($sevenZip) {
    Write-Host "  使用 7-Zip 壓縮..." -ForegroundColor DarkGray
    & 7z a -tzip -mx=9 "$OUTPUT_ZIP" "$extractDir\*" | Out-Null
} else {
    Write-Host "  使用 PowerShell Compress-Archive..." -ForegroundColor DarkGray
    Compress-Archive -Path "$extractDir\*" -DestinationPath $OUTPUT_ZIP -CompressionLevel Optimal
}

if ($LASTEXITCODE -eq 0 -or (-not $sevenZip)) {
    Write-Host ""
    Write-Host "========================" -ForegroundColor Cyan
    Write-Host "🎉 打包完成！" -ForegroundColor Green
    Write-Host "   給朋友：$OUTPUT_ZIP（EXE + 原始碼）" -ForegroundColor Green
    Write-Host "   給網頁：$(Join-Path $ROOT "download\AIHardwareChecker.exe")（純 EXE）" -ForegroundColor Green
    Write-Host "   大小：$((Get-Item $OUTPUT_ZIP).Length / 1MB -as [int]) MB" -ForegroundColor Green
    Write-Host "========================" -ForegroundColor Cyan
}

# 壓縮純 EXE → download/AIHardwareChecker.zip（供網頁陌生人下載，防毒較友善）
$WEB_ZIP = Join-Path $ROOT "download\AIHardwareChecker.zip"
$WEB_DL = Join-Path $ROOT "download"
if (-not (Test-Path $WEB_DL)) { New-Item -ItemType Directory -Path $WEB_DL -Force | Out-Null }
Remove-Item $WEB_ZIP -ErrorAction SilentlyContinue
$7z = Get-Command "C:\Program Files\7-Zip\7z.exe" -ErrorAction SilentlyContinue
if ($7z) {
    & "C:\Program Files\7-Zip\7z.exe" a -tzip -mx=9 "$WEB_ZIP" "$EXE_PATH" | Out-Null
    Write-Host "  ✅ 網頁 ZIP 已產生：$WEB_ZIP ($((Get-Item $WEB_ZIP).Length / 1KB -as [int]) KB)" -ForegroundColor Green
} else {
    Compress-Archive -Path $EXE_PATH -DestinationPath $WEB_ZIP -CompressionLevel Optimal
    Write-Host "  ⚠️  7-Zip 未安裝，用 Compress-Archive 替代：$WEB_ZIP" -ForegroundColor Yellow
}

# 清理暫存原始碼目錄
Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
Remove-Item -Force "$env:TEMP\gitleaks-report.json" -ErrorAction SilentlyContinue
