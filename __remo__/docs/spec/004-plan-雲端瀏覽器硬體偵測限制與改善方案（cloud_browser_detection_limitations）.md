---
type: plan
status: draft
created: 2026-07-13
updated: 2026-07-13
tags: [ai-hardware-checker, cloudflare, browser-detection, webgl, hardware, cloud-vs-local]
---

# 004 — 雲端瀏覽器硬體偵測：限制分析與改善方案

> 為什麼雲端部署後硬體偵測「不準」？這份文件拆解瀏覽器 API 的天花板，並提出務實的改善路徑。

---

## 問題摘要

Cloudflare Pages 部署後，使用者與訪客都發現硬體偵測結果不正確。根本原因只有一個：

> **瀏覽器能取得的硬體資訊遠少於 PowerShell / nvidia-smi / WMI。**

這是雲端靜態部署的先天限制，不可能完全克服。但可以改善到「夠用」的程度。

---

## 現狀：瀏覽器偵測能力一覽

### #current-capabilities

| 硬體項目 | 當前實作 | 準確度 | 限制 |
|---------|---------|--------|------|
| 作業系統 | `navigator.userAgent` | ✅ 高 | 無法區分 Win10/Win11 同一 UA |
| CPU 核心數 | `navigator.hardwareConcurrency` | ✅ 高 | 回傳邏輯核心（含 hyperthreading） |
| RAM | `navigator.deviceMemory` | ✅ Chrome 準確 | ⚠️ Firefox/Safari: **未知**（API 不存在） |
| GPU 型號 | WebGL `UNMASKED_RENDERER_WEBGL` | ✅ 高 | 部分瀏覽器回傳模糊名稱（如「Apple GPU」） |
| VRAM | `GL_GPU_MEM_INFO_TOTAL_AVAILABLE_MEMORY_NVIDIA` + texture allocation test | ⚠️ 中等 | NVIDIA EXT 僅 Chrome 支援；allocation test 可能觸發瀏覽器 crash |
| 磁碟容量 | `navigator.storage.estimate().quota` | ❌ **錯誤** | 回傳的是**瀏覽器儲存空間配額**（通常幾 GB），並非真實磁碟大小 |
| CPU 型號 | 無 API | ❌ 無法取得 | 只能從 User-Agent 猜測架構（x64/ARM） |
| GPU 溫度 | 無 API | ❌ 無法取得 | 需要 LibreHardwareMonitor / nvidia-smi |
| GPU 負載 | 無 API | ❌ 無法取得 | |
| CPU 溫度 | 無 API | ❌ 無法取得 | |
| 風扇轉速 | 無 API | ❌ 無法取得 | |
| 磁碟使用率 | 無 API | ❌ 無法取得 | |
| 各磁區明細 | 無 API | ❌ 無法取得 | |

### #current-flow

```
頁面載入
  ├── detectHardware()      @300ms  ─ 瀏覽器 API 偵測（OS/CPU/RAM/磁碟）
  │     └── detectGPU()     async   ─ WebGL + WebGPU GPU 偵測
  │           └── applyGPUResult()  ─ 顯示 GPU/VRAM 結果
  │
  └── autoLoadSystemConfig() @600ms ─ 嘗試載入 _local/hardware-config.json
        ├── fetch 失敗 （雲端無 _local/ 目錄）
        └── _loadScript 失敗
              → 無作用，systemConfigLoaded = false
```

**雲端上 `autoLoadSystemConfig()` 一定會全部失敗**，這是預期行為（`.wranglerignore` 已排除）。降級到瀏覽器偵測是唯一路徑。

---

## 核心問題分析

### #problem-disk

磁碟偵測是目前最嚴重的問題。`navigator.storage.estimate()` 回傳的是 **瀏覽器儲存配額**（Chrome 通常 ~60% 的磁碟空間 ÷ 所有同源站點），而非真實磁碟大小。

**影響**：訪客看到的磁碟欄位顯示 5-60 GB 不等的小數字，與真實硬碟（數百 GB~數 TB）完全不符，直接破壞信任感。

### #problem-vram

VRAM 偵測有三個層級：

| 層級 | 方法 | 適用瀏覽器 | 準確度 |
|------|------|-----------|--------|
| 1 | NVIDIA WebGL Extension | Chrome + NVIDIA GPU | ✅ 精準 |
| 2 | Texture allocation test | 所有 WebGL 瀏覽器 | ⚠️ 約 ±30% |
| 3 | GPU 型號查表（lookupVRAM） | 所有瀏覽器 | ✅ 精準（但需型號匹配） |

層級 3（查表）其實最好，但有兩個問題：
- WebGL 回傳的 GPU 字串有時不包含型號（如只寫 "AMD Radeon Graphics"）
- 新 GPU 不在查表清單中時回傳 0

### #problem-ram-non-chrome

`navigator.deviceMemory` 是 Chrome-only API。Firefox 和 Safari 用戶完全無法用瀏覽器偵測 RAM。

---

## 改善方案

### #option-A-務實改善（推薦）

不動架構，只改進現有瀏覽器偵測的品質：

1. **磁碟欄位行為修改**（高優先）
   - 雲端時磁碟欄位顯示「—」或「瀏覽器無法偵測磁碟」
   - 引導用戶到「手動指定」區域
   - 絕不能顯示 `navigator.storage.estimate()` 的錯誤值

2. **VRAM 查表增強**（中優先）
   - 確保 `lookupVRAM()` 覆蓋常見 GPU 型號
   - WebGL 回傳模糊名稱時，用 keyword 模糊匹配

3. **RAM fallback**（低優先）
   - 非 Chrome 瀏覽器顯示「⚠️ 請手動指定」而非「未知」

4. **雲端提示**（低優先）
   - 在硬體面板顯示提示：「🌐 瀏覽器偵測（數據有限）。下載執行 run-detection.bat 可獲得更精準結果」

### #option-B-混合架構（更大工程）

維持靜態部署，但引入外部硬體資料庫：

1. 建立 GPU 效能資料庫（JSON）：每張 GPU 的 VRAM、架構世代、支援的 precision
2. 前端只做 GPU 型號偵測（WebGL），其餘全由查表完成
3. 優點：VRAM / RAM / 磁碟全由資料庫提供，不受瀏覽器限制
4. 缺點：需要維護資料庫、無法反映真實 RAM/磁碟（只能給出本機機器的合理預設值）

### #option-C-放棄瀏覽器偵測（最極端）

完全放棄雲端自動偵測，Cloudflare 頁面只做「模型查詢 + 分析」功能，硬體資訊全部仰賴用戶手動選擇 GPU 下拉選單。

優點：零錯誤、零誤導
缺點：用戶體驗較差，需要自己知道顯卡型號

---

## 建議實作

### #recommended-approach

採取 **Option A**，具體修改：

1. `detectHardware()` 中的磁碟偵測：雲端時顯示 `"—"`，不做 `navigator.storage.estimate()`
2. 磁碟面板：雲端時隱藏整個磁碟區塊（或顯示提示）
3. `applyGPUResult()` 中的 VRAM：查表結果優先於 allocation test
4. 在硬體面板 header 或 banner 顯示雲端偵測提示

### #out-of-scope

以下功能在雲端不可能實作，不要嘗試：

- 感測器（溫度/風扇/功耗）
- 精準 VRAM（取代 nvidia-smi）
- 磁碟使用率與各磁區
- CPU 型號名稱（x64/ARM 以外）

---

## 相關檔案

- `app.js` — `detectHardware()` L351、`applyGPUResult()` L220、`autoLoadSystemConfig()` L903
- `index.html` — 硬體面板結構（#spec_disk、#sysDetectBanner）
- `003-spec-Cloudflare Pages 靜態部署（cloudflare_pages_deploy）.md` — 部署規格
- `S:\projects\share\cloudflare\003-guide-Cloudflare上雲一條龍（cloudflare_one_stop_deploy）.md` — 部署通用指南
