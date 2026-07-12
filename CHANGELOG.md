# Changelog

此專案的所有重大變更都將記錄於此檔案中。

## [1.1.0] - 2026-07-12

### 新增
- 實作基於 `.NET CLR` `System.IO.DriveInfo` 的合成磁碟偵測方案，在關閉 LibreHardwareMonitor 卡頓的原生磁碟偵測下，仍能正確獲取主機各磁碟分區的容量及使用狀態。
- 前端 `app.js` 的 `loadBackendConfig` 函式新增對後端 `/api/hardware` 傳回磁碟資訊的解析邏輯，優先提取 C 槽容量更新至 `pc.diskGB` 與 `#spec_disk` 元素。

### 修正
- 修正 `detect-hardware.ps1` 在 Windows PowerShell 5.1 環境下的 `ParserError: MissingCatchOrFinally` 語法錯誤（將 `if-else` 表達式包裹於 `$()` 子表達式中）。
- 整合 LibreHardwareMonitor 偵測到的 `GPU Memory Total` 數值，當 WMI 獲取的 VRAM 因 4GB 溢位被截斷時，自動回寫最外層的 `vram_gb` 欄位與 `vram_source` 來源。
- 修正 `hardware_monitor.py` 的 `_CANDIDATE_DIRS` 搜尋路徑，將專案的 `librehardware` 目錄設為最優先，避免因載入路徑寫死開發機環境而導致 `RuntimeError` 崩潰。
- 關閉 `hardware_monitor.py` 中的 `computer.IsStorageEnabled = False` 以解決讀取原生磁碟造成系統卡頓的問題。
- 移除所有檔案中非必要的 Emoji，確保排版與風格更加簡潔乾淨。
