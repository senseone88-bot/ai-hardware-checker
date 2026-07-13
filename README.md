# AI 硬體檢測工具 — AIHardwareChecker

雙擊 EXE 即可自動偵測本機 GPU/VRAM/CPU/RAM/磁碟/OS，並在瀏覽器中顯示 AI 模型相容性分析。

## 快速使用

1. 從 `dist/` 下載 `AIHardwareChecker.exe`
2. 雙擊執行，瀏覽器自動開啟
3. 等待數秒即顯示完整硬體規格與 AI 模型相容性

> 不需安裝 Python、Node.js 或任何執行環境。

## 給朋友：直接發 `dist/AIHardwareChecker-<版本>.zip`

壓縮檔內含：
- `AIHardwareChecker.exe` — 雙擊即可使用
- 完整原始碼（供審閱、自行修改）

## 自行建置

### 需求
- Python 3.11+
- PyInstaller

### 建置 EXE

```powershell
pip install pyinstaller
pyinstaller --onefile --console --name "AIHardwareChecker" ^
  --add-data "index.html;." ^
  --add-data "app.js;." ^
  --add-data "models.json;." ^
  --add-data "models.js;." ^
  --add-data "detect-hardware.ps1;." ^
  app.py
```

產出：`dist/AIHardwareChecker.exe`

### 一鍵打包（安全 + 建置 + 壓縮）

```powershell
.\pack.ps1
```

自動完成：
1. 檢查未 commit 的檔案
2. 掃描 secret（.env 不會被包含）
3. 建置 EXE
4. 用 `git archive` 提取乾淨原始碼（**不包含 .env、_local/、build/ 等**）
5. 合併 EXE + 原始碼 → 壓縮成 `.zip`

產出：`dist/AIHardwareChecker-<版本>.zip`

## 安全注意事項

- **`.env`** 包含部署憑證，**絕對不會**出現在發布包中（`git archive` + `.gitignore` 雙重保護）
- 發布包只包含已 commit 進 git 的檔案，不會有開發機的暫存檔或機密
- `pack.ps1` 會在打包前自動掃描是否有機密檔案漏網

## 架構

| 檔案 | 用途 |
|------|------|
| `app.py` | EXE 啟動器（HTTP server + PS1 執行） |
| `detect-hardware.ps1` | PowerShell 硬體偵測（nvidia-smi + WMI） |
| `index.html` | 前端頁面 |
| `app.js` | 前端邏輯（硬體顯示、模型比對） |
| `models.json` | AI 模型資料庫 |
| `pack.ps1` | 安全打包腳本 |

## 開發

```powershell
# 直接執行 Python 版本（不需打包）
python app.py
```
