---
type: spec
status: draft
version: 2
created: 2026-07-13
updated: 2026-07-13
author: Eric
reviewed_by: Claude
tags: [ai-hardware-checker, ui-redesign, dual-theme, nvidia, linear]
---

# 002 — NVIDIA/LINEAR 雙主題切換與版面重新設計

## 問題描述

1. **磁碟區版面跑版**：目前使用 `<table>` 顯示磁碟資訊，當磁碟數量多（8 個）時，欄位過多導致字擠在一起，版面無法正常顯示。
2. **AI 感過重**：現行 CSS 使用藍藍紫紫（`--accent: #7c5cfc`）配色，使用者認為「AI demo 感」太重，期望改為大廠設計風格。
3. **入口不一致**：功能集中在 `ai-hardware-checker.html`，但 `index.html` 僅是 redirect stub，使用者需要統一入口。

## 目標

- 將完整內容從 `ai-hardware-checker.html` 搬遷至 `index.html`，單一入口
- 磁碟區改為卡片式網格（`display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`）
- 兩套完整暗色主題：NVIDIA（預設）、Linear，隱藏式一鍵切換
- 移除所有藍紫色，主題各自有明確的設計語言
- 所有現有硬體資訊（CPU、GPU、RAM、網路等）保持正常顯示，僅磁碟區改動
- `app.js` 維持外部 `<script src="app.js">` 載入，不 inline

---

## 設計決策

### A. NVIDIA 主題（預設）

| 項目 | 值 |
|------|-----|
| 背景 | `#000000`（純黑） |
| 表面背景 | `#111111` |
| 卡片背景 | `#1a1a1a` |
| 主要文字 | `#ffffff` |
| 次要文字 | `#888888` |
| 強調色（accent） | `#76b900`（NVIDIA 螢光綠） |
| 卡片 border | `1px solid #2a2a2a` |
| 卡片圓角 | `6px`（銳利感） |
| 字體 weight | 粗體（600-700）為主 |
| 進度條 | `#76b900` → `#e6a800`（黃）→ `#e80000`（紅）三色漸變 |
| 門檻 | `< 60%` 綠色, `60-80%` 黃色, `> 80%` 紅色 |
| 使用率文字 | 配合進度條顏色 |
| hover 效果 | 綠色邊框 glow：`0 0 12px rgba(118,185,0,0.3)` |

### B. Linear 主題

| 項目 | 值 |
|------|-----|
| 背景 | `#08090a`（Linear 深色基底） |
| 表面背景 | `#111214` |
| 卡片背景 | `#1a1b1e` |
| 主要文字 | `#e8e8e8` |
| 次要文字 | `#898c92` |
| 強調色（accent） | `#6b6ee5`（indigo-violet，Claude 確認維持此值） |
| 卡片 border | `1px solid #232427` |
| 卡片圓角 | `10px`（圓潤感） |
| 字體 weight | 正常（400-500），標題 600 |
| 進度條 | `#6b6ee5` → `#d46be5` → `#e56b6b` 三色漸變 |
| 門檻 | `< 60%` 紫色, `60-80%` 紫紅, `> 80%` 紅色 |
| hover 效果 | 白色 elevation shadow：`0 4px 20px rgba(255,255,255,0.05)` |

### C. 切換機制

- 使用 CSS custom properties（`--bg`, `--surface`, `--card`, `--accent` 等）定義所有顏色變數
- 兩套主題各自定義完整的變數組合
- 切換方式：在 `<html>` 上切換 `data-theme="nvidia"` / `data-theme="linear"`
- 預設 NVIDIA，讀取 `localStorage` 恢復上一次選擇
- 持久化寫入 key `hw-checker-theme`

### D. 切換按鈕 UI

- 位置：頁面右上角，小圖示按鈕
- 預設 `opacity: 0.4`
- `:hover` / `:focus` 時 `opacity: 1`
- 不放在 footer（頁面過長，體驗差）
- 符合 SaaS 產品慣例（GitHub、Linear 均為右上角）

### E. 磁碟卡片結構

每個磁碟一張卡片，`grid` 自動換行：

```
+------------------+
| C:               |  裝置名稱（大標題）
| 465 GB           |  總容量（粗體大號）
| +--------------+ |
| |████████████░░| |  使用率進度條（依門檻變色）
| +--------------+ |
| 182 GB / 283 GB  |  已用 / 剩餘
| 39%              |  使用率（配合進度條顏色）
+------------------+
```

下方一個全寬總計卡片：

```
+--------------------------------------------------+
| 總計：11,648 GB  已用 11,018 GB  剩餘 630 GB      |
| 使用率：95%                                       |
+--------------------------------------------------+
```

---

## 關鍵程式碼

### 1. PowerShell 磁碟資料收集
**檔案**：`S:\projects\ai-hardware-checker\detect-hardware.ps1`（第 151-164 行）

```powershell
$disks = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -gt 0 -or $_.Free -gt 0 } | ForEach-Object {
    $totalGB = [math]::Round(($_.Used + $_.Free) / 1GB, 0)
    $usedGB = [math]::Round($_.Used / 1GB, 0)
    $freeGB = [math]::Round($_.Free / 1GB, 0)
    $pct = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 0) } else { 0 }
    @{
        device   = $_.Name
        size_gb  = $totalGB
        used_gb  = $usedGB
        free_gb  = $freeGB
        used_pct = $pct
    }
}
```

### 2. JSON 輸出結構（hardware-config.json）
**檔案**：`S:\projects\ai-hardware-checker\detect-hardware.ps1`（第 197-200 行）

```json
{
  "disks": [
    { "device": "C", "size_gb": 465, "used_gb": 182, "free_gb": 283, "used_pct": 39 }
  ],
  "total_disk_gb": 11648,
  "total_used_gb": 11018,
  "total_free_gb": 630,
  "total_used_pct": 95
}
```

### 3. 前端磁碟卡片渲染（JS）
**檔案**：`S:\projects\ai-hardware-checker\app.js`（磁碟區段）

關鍵渲染邏輯，包含等級 class 判斷（JS 只判斷等級，不判斷顏色）：

```javascript
function getDiskLevel(pct) {
  if (pct < 60) return 'low';
  if (pct < 80) return 'mid';
  return 'high';
}

function renderDisks(disks, total_disk_gb, total_used_gb, total_free_gb, total_used_pct) {
  const grid = document.getElementById('disk-grid');
  grid.innerHTML = disks.map(d => {
    const level = getDiskLevel(d.used_pct);
    return `
    <div class="disk-card" data-theme-item>
      <div class="disk-name">${d.device}:</div>
      <div class="disk-total">${d.size_gb.toLocaleString()} GB</div>
      <div class="disk-bar">
        <div class="disk-bar-fill level-${level}" style="width:${d.used_pct}%"></div>
      </div>
      <div class="disk-detail">已用 ${d.used_gb.toLocaleString()} / 剩餘 ${d.free_gb.toLocaleString()}</div>
      <div class="disk-pct level-${level}">${d.used_pct}%</div>
    </div>`;
  }).join('');
}
```

呼叫端範例（`app.js` 中 JSON 載入完成後）：

```javascript
fetch('hardware-config.json')
  .then(r => r.json())
  .then(data => {
    renderDisks(data.disks, data.total_disk_gb, data.total_used_gb, data.total_free_gb, data.total_used_pct);
  });
```

### 4. CSS 變數定義（雙主題）
**檔案**：`S:\projects\ai-hardware-checker\index.html`（`<style>` 區塊）

```css
/* NVIDIA 主題（預設） */
html[data-theme="nvidia"] {
  --bg: #000000;
  --surface: #111111;
  --card: #1a1a1a;
  --accent: #76b900;
  --text: #ffffff;
  --text-secondary: #888888;
  --card-border: #2a2a2a;
  --card-radius: 6px;
  --bar-start: #76b900;
  --bar-mid: #e6a800;
  --bar-end: #e80000;
}

/* Linear 主題 */
html[data-theme="linear"] {
  --bg: #08090a;
  --surface: #111214;
  --card: #1a1b1e;
  --accent: #6b6ee5;
  --text: #e8e8e8;
  --text-secondary: #898c92;
  --card-border: #232427;
  --card-radius: 10px;
  --bar-start: #6b6ee5;
  --bar-mid: #d46be5;
  --bar-end: #e56b6b;
}

/* 等級 class：JS 只設等級，顏色由 CSS 變數對應主題 */
.disk-bar-fill.level-low  { background: var(--bar-start); }
.disk-bar-fill.level-mid  { background: var(--bar-mid); }
.disk-bar-fill.level-high { background: var(--bar-end); }
.disk-pct.level-low  { color: var(--bar-start); }
.disk-pct.level-mid  { color: var(--bar-mid); }
.disk-pct.level-high { color: var(--bar-end); }
```

### 5. 切換開關與持久化
**檔案**：`S:\projects\ai-hardware-checker\index.html`（`<script>` 區塊）

```javascript
// 載入時讀取偏好
const savedTheme = localStorage.getItem('hw-checker-theme') || 'nvidia';
document.documentElement.setAttribute('data-theme', savedTheme);

// 切換
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'nvidia' ? 'linear' : 'nvidia';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hw-checker-theme', next);
}

// 綁定切換按鈕（右上角小圖示）
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
```

### 關於等級 class 的設計原則

- JS 只判斷「等級」（`low` / `mid` / `high`），不判斷顏色值
- 顏色透過 `.level-*` class + CSS 變數對應到各主題（NVIDIA 用螢光綠→黃→紅，Linear 用紫→紫紅→紅）
- 切換主題時顏色自動跟隨變數，JS 不需要重新執行
- 職責分離：CSS = 顏色 + 主題，JS = 資料 + 等級分類

---

## Claude 審閱結論（已確認）

| 項目 | 結論 |
|------|------|
| Q1 切換按鈕位置 | 右上角小圖示，預設 opacity 0.4~0.5，hover/focus 提升到 1 |
| Q2 Linear 主色 | 維持 `#6b6ee5`，不需調整 |
| Q3 hover 效果 | 兩套都保留，各自對應主題個性 |
| Q4 進度條門檻 | 60/80 維持不變 |
| DeepSeek A：舊檔案 | 刪除 `ai-hardware-checker.html`，不留備份，靠 git 歷史復原 |
| DeepSeek B：app.js 載入方式 | 維持外部 `<script src="app.js">`，不要 inline |
| 參數名修正 | `renderDisks()` 簽名統一為 `total_disk_gb, total_used_gb, total_free_gb, total_used_pct`，與 JSON 欄位一致 |

---

## Tasks

### Task 1: 搬內容到 index.html
- 將 `ai-hardware-checker.html` 的完整 `<style>`、`<body>`、`<script>` 內容搬至 `index.html`
- 保留 `index.html` 的所有 meta 與結構
- 刪除 `index.html` 中現有的 redirect script tag
- 驗證：打開 `index.html` 應顯示與 `ai-hardware-checker.html` 完全一致的內容

### Task 2: 磁碟區改卡片網格
- 在 `index.html` 中將磁碟 `<table>` 區域替換為 `<div id="disk-grid">` + CSS `grid`
- 卡片模板如上（裝置名、總容量、進度條、已用/剩餘、使用率）
- 總計條放在卡片網格下方，全寬橫條
- 驗證：8 個磁碟顯示為 2 行 x 4 列（或自動換行），無滾動條或文字溢位

### Task 3: CSS 變數化 + 雙主題
- 將現有所有顏色值抽為 CSS 變數（`--bg`, `--surface`, `--card`, `--accent`, `--text`, `--text-secondary`, `--card-border`, `--card-radius`, `--bar-start`, `--bar-mid`, `--bar-end`）
- 定義兩套 `html[data-theme="nvidia"]` 與 `html[data-theme="linear"]`
- 預設 `data-theme="nvidia"`
- 驗證：切換 `data-theme` 時所有顏色正確切換，無漏網之魚

### Task 4: 切換按鈕 + localStorage 持久化
- 右上角小圖示按鈕，預設 opacity 0.4，hover/focus 提升到 1
- 讀取 `localStorage` 恢復上一次選擇的主題
- 切換時寫入 `localStorage`
- 驗證：切換後 refresh 頁面，主題保持

### Task 5: 進度條顏色漸變
- 依 `used_pct` 設定 `--bar-fill-color`：
  - `< 60%`：`var(--bar-start)`
  - `60-80%`：`var(--bar-mid)`
  - `> 80%`：`var(--bar-end)`
- 使用率文字顏色同步
- 驗證：D 槽 98% 顯示紅色，C 槽 39% 顯示綠色

### Task 6: 刪除舊檔案
- 刪除 `ai-hardware-checker.html`
- 不保留備份，復原依賴 git 歷史
- 驗證：開啟 `index.html` 正常顯示

### Task 7: 最終整合驗證
- 打開 `index.html`，所有硬體區塊正常顯示
- 磁碟區 8 張卡片排列整齊，無跑版
- 切換主題，所有區塊顏色雙向正確
- refresh 頁面後主題保持
- 無 console error
