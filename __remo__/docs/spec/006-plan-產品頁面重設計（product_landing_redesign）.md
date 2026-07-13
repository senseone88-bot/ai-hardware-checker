---
type: plan
status: draft
created: 2026-07-13
updated: 2026-07-13
tags: [ai-hardware-checker, landing-page, redesign, bilingual, ui]
---

# 006 — 產品頁面重設計（Product Landing Redesign）

> 將目前的 AI 硬體檢測工具頁面改為「AI夢幻工廠檢測器」品牌，國際大廠風格的軟體產品頁面：繁體中文預設、可切換英文（IP 非台灣自動切英文）、有硬體偵測截圖、LOGO 點擊切換主題、社群連結（蝦皮/TikTok）、下載連結，簡潔有力。

---

## 現狀

目前的 `index.html` 是一個中文工具頁面，功能完整但設計上偏工程風格：
- 硬體規格表、GPU 下拉選單、模型分析面板夾雜在同一頁
- 店家連結混在 header 中
- 頁面頂部顯示分析功能而非產品定位
- 缺少截圖、缺少下載 call-to-action
- 整體不像一個「產品」而是「工具」

目前線上有兩個版本：
- **Cloudflare Pages 版**（僅前端 UI，無 PowerShell 偵測）→ 改為產品 Landing Page
- **EXE 桌面版**（真正有完整偵測能力）→ 下載目標

---

## 設計目標

1. **像國際大廠的產品頁面** — NVIDIA、Microsoft、Adobe 等級的視覺品質
2. **有硬體偵測畫面截圖** — 展示真實運行畫面，建立信任
3. **繁體中文預設，可切換英文** — header 放語言切換按鈕；IP 非台灣自動顯示英文
4. **圖文並茂但不廢話** — Hero + 截圖 + 特色 + 下載，四段搞定
5. **附下載連結** — 明顯的 CTA，指向 `AIHardwareChecker.zip`
6. **保留既有功能** — 使用者仍然可以操作硬體偵測 + 模型分析（放在截圖後的 Live Demo 區塊）
7. **品牌名稱為「AI夢幻工廠檢測器」** — Hero 標題、頁面 title 統一使用此名稱
8. **LOGO 點擊切換主題** — 使用 `assets/image/logo_200x200.jpeg` 裁圓形，取代右上角 🎨 按鈕
9. **社群連結** — Hero 區加入 Shopee 與 TikTok 圖示連結

---

## 語言偵測實作（已驗證，cf-ipcountry 可用）

### 驗證結果

2026-07-13 實際部署測試，`functions/api/country.js` 回傳：

```json
{
  "cf_ipcountry_header": "TW",
  "cf_country": "TW",
  "ip": "111.242.124.94",
  "accept_language": "en-US,en;q=0.9"
}
```

確認 `cf-ipcountry` header 與 `cf.country` 皆可用，回傳 ISO 3166-1 國碼。

### 機制（三層 fallback）

```
1. localStorage('lang') 有值？            → 直接使用（手動切換的偏好）
   └─ 無 →
2. GET /api/country 成功且 cf.country 非 TW？ → 顯示英文
   └─ 失敗或 timeout → 
3. navigator.language 開頭非 zh？         → 顯示英文
   └─ 否則 → 繁體中文（預設）
```

**為什麼不直接用 `navigator.language`？** 因為台灣使用者可能設定瀏覽器介面為英文，但實際在台灣。`cf-ipcountry` 基於真實 IP，更準確。但 Cloudflare Pages Function 可能因網路問題 timeout（EXE 本機模式一定會），所以需要雙重 fallback。

### 實作細節

- Cloudflare Pages Function：`functions/api/country.js`，5 行程式碼，無依賴
- 前端 `app.js` 啟動時非同步呼叫 `/api/country`，timeout 設 3 秒
- EXE 本機模式（`http://127.0.0.1:8000`）呼叫 `/api/country` 會因路由不存在而快速 404，自然 fallback 到 `navigator.language`，不需額外判斷

---

## 輕量 i18n 實作（無 framework）

```js
const LANG = {
  "zh-TW": {
    hero_title: "AI夢幻工廠檢測器",
    hero_sub: "一秒知道你的電腦能跑哪些 AI 模型",
    download: "免費下載",
    feature1: "系統級精準偵測",
    ...
  },
  "en": {
    hero_title: "AI Hardware Checker",
    hero_sub: "Know which AI models your PC can run — in seconds.",
    download: "Download Free",
    feature1: "System-Level Precision",
    ...
  }
};
```

- 顯示字串透過 `<span data-i18n="hero_title">fallback</span>` 標記
- 圖片 alt 文字透過 `<img data-i18n-alt="screenshot_alt">` 標記
- `applyLanguage(lang)` 函數遍歷 `[data-i18n]` 元素替換 `textContent`，遍歷 `[data-i18n-alt]` 元素替換 `alt`
- **第一階段範圍**：僅 Landing Page 新增區塊（Hero/Features/Footer）雙語。既有 Live Demo 面板內的動態渲染內容（`renderSensors`、`applySystemConfig`、`analyzeModel` 產出的 DOM）維持中文。避免範圍膨脹。

---

## 頁面結構（定案，不再修改）

```
┌──────────────────────────────────────────┐
│  [EN/中文] 語言切換（右上角）           │
├──────────────────────────────────────────┤
│  HERO                                    │
│  LOGO（assets/image/logo_200x200.jpeg）  │
│  裁圓形，點擊切換主題                    │
│  AI夢幻工廠檢測器                        │
│  一秒知道你的電腦能跑哪些 AI 模型        │
│  [Shopee] [TikTok] 社群圖示               │
│  [免費下載]                               │
├──────────────────────────────────────────┤
│  SCREENSHOT                              │
│  1440×900 PNG · 壓縮至 <300KB            │
│  圓角 + shadow + browser mockup          │
├──────────────────────────────────────────┤
│  FEATURES (3 欄卡片)                     │
│  • 系統級精準偵測 / System-Level...     │
│  • 一鍵執行免安裝 / One-Click...         │
│  • AI 模型相容性分析 / Model Check       │
├──────────────────────────────────────────┤
│  LIVE DEMO（保留既有功能面板）            │
│  硬體規格 + 模型分析 + GPU 選擇          │
│  提示：瀏覽器 API 可能不準，以下載版為準│
├──────────────────────────────────────────┤
│  FOOTER                                  │
│  [免費下載] + 免責聲明                    │
└──────────────────────────────────────────┘
```

---

## 關鍵檔案

### `S:\projects\ai-hardware-checker\index.html`
- 需改造：上方加入 Landing 區塊；保留既有功能區塊
- 字串替換為 `data-i18n` attribute

### `S:\projects\ai-hardware-checker\app.js`
- 追加 i18n 區塊（LANG object + applyLanguage + detectLanguage）
- 既有 `applySystemConfig`、`renderSensors`、`analyzeModel` 不修改

### `S:\projects\ai-hardware-checker\functions\api\country.js`
- 新增 Pages Function，回傳 `cf.country` 供前端語言偵測

### `S:\projects\ai-hardware-checker\screenshot.png`
- 新增：執行 EXE 後截取 1440×900 硬體偵測畫面

### `S:\projects\ai-hardware-checker\public\download\AIHardwareChecker.zip`
- 下載目標（透過 wrangler 部署時同步上傳）

---

## Key 設計細節

- **色調**：維持 002 spec 既有雙主題（NVIDIA 綠黑預設 + Linear 紫黑選項），不調整
- **字體**：英文 `Inter` (Google Fonts)；中文 `-apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif`
- **截圖**：1440×900 PNG，browser frame mockup、圓角 12px、shadow；壓縮 <300KB
- **Screenshot alt text**：中文 `「AI 硬體檢測工具 — 硬體偵測結果」`
- **動畫**（選擇性）：Hero 區微漸變進入
- **Responsive**：下載按鈕手機可見

---

## Tasks

```yaml
tasks:
  - id: T1
    name: 產生硬體偵測截圖
    desc: |
      執行 EXE，等到硬體偵測完成後截取瀏覽器全畫面，
      裁切為 1440×900，壓縮至 <300KB PNG。
    files: []
    verify: |
      - 檔案: screenshot.png
      - 解析度: 1440×900（精確）
      - 大小: <300KB
      - 內容: 顯示完整的硬體偵測結果（GPU/VRAM/RAM/CPU/OS）

  - id: T2
    name: 改寫 index.html → 產品 Landing Page + i18n
    desc: |
      保留既有功能區塊（spec-grid + model analysis + sensors）不動，
      上方加入 Hero、Screenshot、Features、Download CTA。
      加入 i18n 架構（LANG object + data-i18n + applyLanguage + detectLanguage）。
      i18n 範圍僅 Landing 區塊（Hero/Features/Footer），
      Live Demo 動態內容維持中文。
      語言偵測：localStorage → GET /api/country → navigator.language → zh-TW 預設。
      標題改為「AI夢幻工廠檢測器」。
    LOGO 改為 assets/image/logo_200x200.jpeg 裁圓形，點擊切換主題（取代 🎨 按鈕）。
    Hero 加入 Shopee（https://ppt.cc/ffLGvx）與 TikTok（https://www.tiktok.com/@mycomtw）圖示連結。
    Live Demo 提示：瀏覽器 API 可能不準，以下載版為準。
      CSS 變數不調整（002 spec）。
      依賴 T1 產出的 screenshot.png。
    files:
      - S:\projects\ai-hardware-checker\index.html
      - S:\projects\ai-hardware-checker\app.js
      - S:\projects\ai-hardware-checker\functions\api\country.js
      - S:\projects\ai-hardware-checker\screenshot.png（依賴 T1，被引用）
    verify: |
      1. 首屏為 Hero（標題 + 下載按鈕），非功能面板
      2. 截圖 1440×900 顯示在中段（圓角 + shadow）
      3. 滑到下方仍可使用硬體偵測 + 模型分析
       4. LOGO（assets/image/logo_200x200.jpeg）裁圓形顯示，點擊切換主題
       5. Shopee（https://ppt.cc/ffLGvx）與 TikTok（https://www.tiktok.com/@mycomtw）圖示在 Hero
       6. 預設顯示繁體中文（本機測試環境，navigator.language fallback 分支）
       7. 切換按鈕可切英文，所有 Landing 字串即時更新
       8. Download 指向 /download/AIHardwareChecker.zip
       9. Live Demo 提示改為「以下面板受限於瀏覽器 API 可能不準確」

  - id: T3
    name: 部署至 Cloudflare Pages
    desc: |
      將 screenshot.png 與 AIHardwareChecker.zip 放至正確路徑後部署。
      ZIP 放在 public/download/AIHardwareChecker.zip。
      functions/api/country.js 需確認正常運行。
    files:
      - S:\projects\ai-hardware-checker\dist\AIHardwareChecker.zip
      - S:\projects\ai-hardware-checker\screenshot.png
      - S:\projects\ai-hardware-checker\functions\api\country.js
    verify: |
      1. https://ai-hardware-checker.pages.dev 顯示 Landing Page（繁體中文）
      2. VPN 切至非台灣節點 → 自動顯示英文（curl 無法測試，需實際 VPN）
      3. 手動切換語言按鈕正常
      4. Hero 截圖正常載入
      5. Download 按鈕可下載 /download/AIHardwareChecker.zip
      6. GET /api/country 回傳正確國碼
      7. Live Demo 區塊功能正常

  - id: T4
    name: 測試（EXE 本機模式）
    desc: |
      1. python app.py → 瀏覽器顯示新版 Landing Page（繁體中文）
      2. 硬體偵測結果正常載入（applySystemConfig）
      3. 模型分析正常（analyzeModel）
      4. 語言切換功能正常（僅 Landing 區塊，EXE 模式下 navigator.language fallback）
      5. 下載連結可取得正確的 ZIP
    files: []
    verify: 五項測試全部 PASS
```

---

## 相關檔案

- `S:\projects\ai-hardware-checker\index.html` — 主頁面（需改造）
- `S:\projects\ai-hardware-checker\app.js` — 前端邏輯（追加 i18n）
- `S:\projects\ai-hardware-checker\functions\api\country.js` — cf-ipcountry 測試函數（已驗證可用）
- `S:\projects\ai-hardware-checker\models.json` — 模型資料（不變）

## 下載區分

| 途徑 | 內容 | 位置 |
|------|------|------|
| **網頁陌生人下載** | 純 `AIHardwareChecker.exe` 經 7-Zip 壓縮成 ZIP（防毒友善） | `download/AIHardwareChecker.zip`（Cloudflare Pages `/download/`） |
| **朋友打包** | EXE + 原始碼（經 gitleaks + grep 掃描） | `dist/AIHardwareChecker.zip`（pack.ps1 產出，不上傳 Cloudflare） |

`pack.ps1` 執行後自動完成兩者：
1. 輸出 `dist/AIHardwareChecker.zip`（給朋友，EXE + 原始碼）
2. 7-Zip 壓縮純 EXE → `download/AIHardwareChecker.zip`（給網頁）

## 部署設定檔

| 檔案 | 用途 |
|------|------|
| `wrangler.toml` | Cloudflare Pages 部署設定（專案名稱、Functions 路徑） |
| `S:\projects\share\cloudflare\004-guide-cloudflare-通用部署指南-pages-deploy.md` | 通用部署指南（已移至外部） |

部署指令：
```bash
npx wrangler pages deploy . --branch main
```

（專案名稱與 Functions 路徑已寫入 `wrangler.toml`，不需額外參數）
