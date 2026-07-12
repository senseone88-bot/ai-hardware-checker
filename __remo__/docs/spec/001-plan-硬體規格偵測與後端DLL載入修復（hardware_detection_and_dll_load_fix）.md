---
type: plan
status: completed
updated: 2026-07-12
domain: detection
tags: [hardware, vram, dll, librehardwaremonitor, storage]
author: antigravity
---

# 系統級硬體偵測與後端 DLL 載入修復方案

> 針對 Windows 環境下 AI 硬體體檢工具之 VRAM 4GB 限制、LibreHardwareMonitor 感測器數據同步以及後端 DLL 載入失敗等問題進行修復與最佳化。

---

## 背景與問題分析

> 在 Windows 繁體中文環境下，目前 AI 硬體體檢工具在偵測硬體規格時存在多項不準確與服務崩潰之問題：
>
>> #detection-wmi-limit
>> ### WMI VRAM 偵測限制 (4GB)
>>
>> 當 `nvidia-smi` 不可用時（例如 AMD、Intel 顯卡，或是路徑未設定），偵測腳本 `detect-hardware.ps1` 會退回使用 WMI 查詢 (`Win32_VideoController.AdapterRAM`)。在 Windows 32 位元無號整數限制下，對於大於 4GB 的顯示卡，該欄位會因為溢位而被截斷，最多只能顯示 **4.0 GB**，導致偵測結果不準確。
>
>> #detection-lhm-integration
>> ### LibreHardwareMonitor 偵測數據未回饋
>>
>> 雖然 `detect-hardware.ps1` 載入了 LibreHardwareMonitor 並成功讀取了高精度的 GPU 顯存數值，但這些感測器數值只被儲存在 JSON 輸出的 `"sensors"` 陣列中，最外層的 `"vram_gb"` 欄位在 `nvidia-smi` 失敗時仍保留著 WMI 截斷的 **4.0 GB**。
>>
>> 實機驗證（RTX 5070）：LHM 傳感器 `GPU Memory Total`（型態 `SmallData`）回傳值為 `12227 MB`，換算後為 **12.0 GB**，與 nvidia-smi 一致，可作為可靠的覆寫來源。
>
>> #backend-dll-path
>> ### FastAPI 後端 DLL 載入路徑寫死
>>
>> `hardware_monitor.py` 在載入 `LibreHardwareMonitorLib.dll` 時，候選路徑陣列 `_CANDIDATE_DIRS` 寫死了開發機路徑，並未包含本專案實際下載 DLL 的存放路徑 `librehardware\`。這導致 Python 後端啟動或呼叫 `/api/hardware` 時直接拋出 `RuntimeError: LibreHardwareMonitor DLLs not found in any known location` 而崩潰。
>
>> #powershell-parser-error
>> ### Windows PowerShell 5.1 語法相容問題
>>
>> 在 `detect-hardware.ps1` 中，使用 `min = if (...) { ... } else { ... }` 這種將 if 語句直接作為表達式賦值的語法，在 Windows 原生 PowerShell 5.1 下會引發 `ParserError: MissingCatchOrFinally`。必須使用 `$()` 子表達式進行包裹。

---

## 實作設計與修復方案

> 本次修復遵循 **Surgical Changes (精準修改)** 與 **Simplicity First (簡單優先)** 原則，僅修改關鍵檔案：
>
>> #implementation-dll-path
>> ### 1. 修正 `hardware_monitor.py` 的 DLL 載入路徑
>>
>> 在 `_CANDIDATE_DIRS` 首位加入專案根目錄下的 `librehardware` 路徑（優先查找）：
>> ```python
>> _CANDIDATE_DIRS = [
>>     _SCRIPT_DIR / "librehardware",   # ← 新增，本專案實際 DLL 存放位置
>>     _SCRIPT_DIR / "lib" / "lhm_extracted" / "runtimes" / "win-x64" / "lib" / "net10.0",
>>     # ...
>> ]
>> ```
>
>> #implementation-powershell-syntax
>> ### 2. 修正 `detect-hardware.ps1` 的 PowerShell 5.1 語法錯誤
>>
>> 將 `min` 與 `max` 的賦值語法修改為子表達式 `$()`：
>> ```powershell
>> # ❌ PS 5.1 會報 ParserError
>> min = if ($sensor.Min -ne $null) { [Math]::Round([double]$sensor.Min, 2) } else { $null }
>>
>> # ✅ 正確寫法：以 $() 包裹使其成為合法的右值表達式
>> min = $(if ($sensor.Min -ne $null) { [Math]::Round([double]$sensor.Min, 2) } else { $null })
>> max = $(if ($sensor.Max -ne $null) { [Math]::Round([double]$sensor.Max, 2) } else { $null })
>> ```
>
>> #implementation-vram-fallback
>> ### 3. 整合 LHM 數據回寫至最外層 VRAM 欄位
>>
>> 在 LHM 感測器迴圈內，當 `$vramSource -eq "wmi"` 且偵測到 GPU 的 `GPU Memory Total`（型態 `SmallData`，單位 MB）時，立即換算並覆寫外層變數，無需等待迴圈結束：
>> ```powershell
>> $isGpu = $hardware.HardwareType.ToString() -match "Gpu"
>> foreach ($sensor in $hardware.Sensors) {
>>     # LHM 顯存覆寫：僅在 WMI 降級狀態下執行
>>     if ($isGpu -and $vramSource -eq "wmi" `
>>         -and $sensor.Name -eq "GPU Memory Total" `
>>         -and $sensor.SensorType.ToString() -eq "SmallData" `
>>         -and $sensor.Value -ne $null) {
>>         $lhmVramGb = [Math]::Round($sensor.Value / 1024, 1)  # MB → GB
>>         if ($lhmVramGb -gt 0) {
>>             $vramGB    = $lhmVramGb
>>             $vramSource = "librehardware"
>>         }
>>     }
>>     # ... 原有感測器收集邏輯不變
>> }
>> ```
>> **傳感器命名依據**：實機驗證（RTX 5070）確認 LHM 傳感器名稱固定為 `GPU Memory Total`、型態為 `SmallData`，數值單位為 MB。

>> #implementation-storage-fallback
>> ### 4. 實作 System.IO.DriveInfo 合成磁碟偵測與前端解析
>>
>> 由於 LibreHardwareMonitor 讀取 Storage 資訊時會造成系統卡頓，後端設定 `computer.IsStorageEnabled = False` 關閉了原生的磁碟偵測。我們藉由 `.NET CLR` 的 `System.IO.DriveInfo.GetDrives()` 來實作非卡頓的合成磁碟偵測。
>> 1. **後端 (Python/CLR)**：透過 `System.IO.DriveInfo.GetDrives()` 取得各磁碟之 `TotalSize` 與 `TotalFreeSpace`，計算已用空間與使用率，封裝為 `Storage` 硬體與感測器格式注入 `/api/hardware` 與 `/api/hardware/raw` 中。
>> 2. **前端 (JavaScript)**：在 `app.js` 的 `loadBackendConfig` 函式中過濾並取得包含 `C:` 的磁碟物件，將其 `total` 寫入 `pc.diskGB`，並更新 `#spec_disk` 元素顯示完整已用與百分比資訊。

---

## 任務清單與驗證步驟 (Tasks)

> 為確保修改結果正確且沒有副作用，設計以下適度工程化的驗證工作流：
>
>> #tasks-execution
>> ### 執行任務清單
>>
>> | 步驟 | 任務內容 | 預期結果 | 驗證方式 | 狀態 |
>> | :--- | :--- | :--- | :--- | :---: |
>> | 1 | 撰寫開發規劃文件 | 產生 `001-plan-...md` 文件 | 本文確認已寫入 | ✅ |
>> | 2 | 修正 `detect-hardware.ps1` 語法錯誤 | 解決 PowerShell 5.1 語法報錯，腳本可被正確解析 | 執行 `powershell -NoProfile -ExecutionPolicy Bypass -File detect-hardware.ps1` | ✅ |
>> | 3 | 修改 `detect-hardware.ps1` LHM 顯存覆寫邏輯 | LHM 偵測到的 GPU 顯示記憶體能正確回寫到 JSON 最外層 `vram_gb` | 檢查 `hardware-config.json`，確認 `vram_gb` 非 4.0 GB、`vram_source` 為 `"librehardware"` | ✅ |
>> | 4 | 修正 `hardware_monitor.py` DLL 搜尋路徑 | FastAPI 能正確初始化，不拋出 DLL 找不到的異常 | 執行 `python main.py`，呼叫 `/api/hardware`，確認回傳正確硬體 JSON | ✅ |
>> | 5 | 前端網頁與體檢比對測試 | 前端能成功載入 JSON/JS 並渲染，顯示與手動選取一致 | 用瀏覽器開啟網頁，確認系統偵測規格無誤且體檢功能正常 | ✅ |
>> | 6 | 整合合成磁碟空間檢測 | 解決關閉 LHM Storage 偵測後無磁碟數據之問題，使 C 槽空間可正常被體檢功能判定 | 呼叫 `/api/hardware` 包含 `Local Disk (C:\)`，前端 `#spec_disk` 正常顯示空間 | ✅ |
