---
type: plan
status: draft
created: 2026-07-13
updated: 2026-07-13
tags: [ai-hardware-checker, exe, pyinstaller, desktop, deployment]
---

# 005 — EXE 桌面版包裝（PyInstaller）

> 將 AI 硬體檢測工具包裝為單一 EXE，使用者雙擊即可自動偵測硬體 + 開啟瀏覽器顯示結果。

---

## 動機

Cloudflare Pages 雲端版無法執行 PowerShell/nvidia-smi，瀏覽器 API 偵測硬體有限且不準確（見 004-plan）。

解決方案：包裝為桌面 EXE，使用者下載後雙擊：
1. 自動執行 PowerShell 硬體偵測（nvidia-smi + WMI + LibreHardwareMonitor 感測器）
2. 啟動內建 HTTP 伺服器
3. 自動開啟瀏覽器顯示完整結果

不需手動執行任何 `.bat` 或安裝任何軟體。

---

## 架構

```
AIHardwareChecker.exe
  │
  ├── app.py（啟動器）
  │     ├── 執行 detect-hardware.ps1 → 產生 _local/hardware-config.json
  │     └── 啟動 HTTP server → 自動開瀏覽器 http://127.0.0.1:8000
  │
  ├── index.html / app.js / models.json（前端）
  ├── detect-hardware.ps1（PowerShell 偵測腳本）
  ├── run-detection.bat（備用批次檔）
  └── _local/hardware-config.json（執行時產生）
```

### #data-flow

```
使用者雙擊 EXE
  │
  ▼
app.py: 執行 detect-hardware.ps1
  │  ├── nvidia-smi → GPU/VRAM
  │  ├── WMI → CPU/RAM/OS/磁碟
  │  └── LibreHardwareMonitor → 感測器
  │
  ▼
app.py: 啟動 HTTP server（127.0.0.1:8000）
  │  └── 自動開啟瀏覽器
  │
  ▼
瀏覽器: autoLoadSystemConfig() → fetch _local/hardware-config.json
  │  └── applySystemConfig(data) → 顯示完整硬體資料
  │
  ▼
瀏覽器: detectHardware() → WebGL 備用（僅當 JSON 載入失敗時）
```

---

## 建置方式

```bash
# 安裝 PyInstaller
pip install pyinstaller

# 建置單一 EXE
pyinstaller --onefile --noconsole --name "AIHardwareChecker" ^
  --add-data "index.html;." ^
  --add-data "app.js;." ^
  --add-data "models.json;." ^
  --add-data "models.js;." ^
  --add-data "styles.css;." ^
  --add-data "detect-hardware.ps1;." ^
  --add-data "run-detection.bat;." ^
  --add-data "_local;._local" ^
  app.py
```

### #build-output

| 檔案 | 大小 | 說明 |
|------|------|------|
| `dist/AIHardwareChecker.exe` | ~9.4 MB | 最終產出，單一檔案，無依賴 |
| `build/` | (可刪) | 建置暫存目錄 |
| `AIHardwareChecker.spec` | (可刪) | PyInstaller spec 檔 |

---

## 使用方式

1. 下載 `AIHardwareChecker.exe`
2. 雙擊執行
3. PowerShell 自動偵測硬體（約 10-30 秒）
4. 瀏覽器自動開啟，顯示完整結果

### #admin-required

`detect-hardware.ps1` 需要管理員權限才能載入 LibreHardwareMonitor 感測器 DLL。
- 如果有管理員權限：感測器（溫度/風扇/功耗）完整顯示
- 如果沒有管理員權限：GPU/CPU/RAM/磁碟基本偵測仍正常，感測器略過
- EXE 本身不需要管理員權限即可啟動

---

## 與 Cloudflare 版的差異

| 功能 | Cloudflare 版 | EXE 桌面版 |
|------|--------------|-----------|
| 開啟方式 | 瀏覽器開網址 | 下載 EXE → 雙擊 |
| GPU 型號 | WebGL ✅ | PowerShell ✅ |
| VRAM | WebGL 約 ±30% | nvidia-smi 精準 ✅ |
| RAM | Chrome only | WMI 精準 ✅ |
| 磁碟各磁區 | ❌ 無法 | WMI ✅ |
| CPU 型號 | ❌ 無法 | WMI ✅ |
| OS 版本 | User-Agent 約略 | WMI 精準 ✅ |
| 感測器（溫度/風扇） | ❌ 無法 | LHM ✅ |
| 分享給別人 | ✅ 開網址即可 | ❌ 需下載 EXE |

---

## 注意事項

- `app.py` 使用 `subprocess.run` 執行 PowerShell，**不可使用 `capture_output=True`**（Windows pipe buffer 可能導致死結）
- EXE 打包時 `_local/` 目錄需一併納入（內含最新的 `hardware-config.json` + `.js`）
- `--noconsole` 使 EXE 執行時不顯示黑色終端機視窗
- 前端 `app.js` 的 `autoLoadSystemConfig()` 透過 HTTP fetch `_local/hardware-config.json` 載入數據

---

## 相關檔案

- `app.py` — EXE 啟動器（SSOT）
- `detect-hardware.ps1` — PowerShell 硬體偵測腳本
- `main.py` — FastAPI 後端（供 Python `python main.py` 方式使用）
- `004-plan-雲端瀏覽器硬體偵測限制與改善方案.md` — Cloudflare 版限制說明
- `003-spec-Cloudflare Pages 靜態部署.md` — 雲端部署規格
