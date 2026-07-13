---
type: issue
status: suspended
created: 2026-07-13
tags: [ai-hardware-checker, pyinstaller, smartscreen, antivirus, code-signing]
---

# 007 — PyInstaller EXE 被 SmartScreen / 賽門鐵克封鎖

> 狀態：**暫不處理**。已知問題，記錄備查。

---

## 問題

從 Cloudflare Pages 下載 `AIHardwareChecker.exe`（PyInstaller `--onefile` 打包）後：

1. **Chrome 下載掃描很久** — 8.3 MB 單一 EXE 需完整掃描
2. **SmartScreen** — 「Windows 已保護您的電腦。Microsoft Defender SmartScreen 已防止某個無法辨識的應用程式啟動。發行者：不明的發行者」
3. **賽門鐵克** — 即使點「仍要執行」仍被攔截

之前本機執行 `dist/AIHardwareChecker.exe` 不會發生，因為：

- 本機產生的檔案沒有 `Zone.Identifier`（網際網路標記），Windows 不會將其視為「來自網路」，不觸發 SmartScreen
- 從 Cloudflare Pages 下載的 EXE 會被 Windows 自動附加 `Zone.Identifier`（ZoneId=3，表示網際網路），觸發 SmartScreen 檢查
- 加上無數位簽章 + 無下載聲譽 → SmartScreen 直接封鎖

這也可以透過 `Get-Item .\download\AIHardwareChecker.exe -Stream Zone*` 驗證：有 `Zone.Identifier` 的就是網路下載檔。

---

## 原因

| 原因 | 說明 |
|------|------|
| 無數位簽章 | EXE 沒有 Code Signing 憑證 → 顯示「不明的發行者」 |
| 下載次數不足 | SmartScreen 聲譽資料庫查無此檔案 |
| PyInstaller 特徵 | 防毒引擎對 PyInstaller 的啟發式偵測靈敏度較高（`_MEIPASS`、PYZ 封存等特徵） |

---

## 研究結論

查證報告：

- **UPX 壓縮無效** — UPX 本身被防毒業界當作惡意軟體特徵（CYFIRMA YARA rule 明確把 `UPX!` 列為指標），反而可能增加誤判率。且 PyInstaller `--onefile` 下 UPX 只壓內層 .dll，不壓外層 EXE 殼。
- **PyInstaller 官方** 在 GitHub Issue #4694 表明：這是已知問題，無法解決，唯一建議是向 Microsoft 回報 false positive。
- **真正有效做法** 只有 Code Signing 憑證（OV 級，~$200-400/年）或向各防毒廠商逐一提交 false positive。

---

## 解決方案（未來處理）

| 方案 | 效果 | 估計成本 |
|------|------|----------|
| **OV Code Signing 憑證**（DigiCert / Sectigo） | EXE 顯示「發行者：你的名稱」，消除 SmartScreen + 大多數防毒警告 | ~$200-400/年 |
| **EV Code Signing 憑證** | 同上 + 更快建立聲譽 | ~$300-500/年 |
| **向 Microsoft / 賽門鐵克提交 false positive** | 提交後 1-2 天解除，但每次新版 EXE 需重送 | 免費但需持續維護 |
| **改用 Nuitka 編譯** | 產生 native C 二進位，PyInstaller 特徵較少 | 免費但需遷移建置流程 |

---

## 相關檔案

- `pack.ps1` — PyInstaller 建置腳本（需修改加入簽章步驟）
- `S:\projects\share\cloudflare\004-guide-cloudflare-通用部署指南-pages-deploy.md` — 部署指南
