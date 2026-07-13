---
type: spec
status: stable
version: 3
created: 2026-07-13
updated: 2026-07-13
author: Eric
tags: [ai-hardware-checker, cloudflare, pages, deployment, static-site, custom-domain]
---

# 003 — Cloudflare Pages 免費靜態部署

> 將 AI 硬體檢測工具部署到 Cloudflare Pages 免費方案，讓模型查詢與分析功能可透過公網 URL 存取。

---

## 前期經驗參考

本次部署參考先前 Cloudflare 實戰記錄（位於 `S:\projects\share\cloudflare\`）：

| 文件 | 核心教訓 |
|------|----------|
| `001-log-Cloudflare構建失敗.md` | Cloudflare Pages **禁止輸出目錄中有無效符號連結**，會導致 Build Failed。確保專案無 broken symlink。 |
| `002-log-Cloudflare_DNS_與_Workers_路由配置.md` | Workers/Pages 搭配自訂網域的 DNS CNAME + Route 配置方式；日後如需綁自訂網域可參照。 |

---

## 背景

目前專案只能在本機以 `file://` 協議開啟，或透過 FastAPI（`main.py`）提供 HTTP 服務。優點是 PowerShell 檢測硬體可以運作，缺點是：

- 無法分享給其他人使用
- 需要本機 PowerShell + LibreHardwareMonitor
- 每次都要手動執行 `run-detection.bat`

**雲端部署的取捨**：硬體檢測（GPU/VRAM/RAM/磁碟）必須依賴本機 PowerShell + nvidia-smi，雲端無法做到。但瀏覽器 API（WebGL/WebGPU）仍可做基本偵測，模型資料庫查詢、相容性分析、快速選擇 chips 等功能完全可雲端化，且 Cloudflare Pages 免費方案已足夠支撐。

### #cloudflare-free-tier

Cloudflare Pages 免費方案限制：

| 項目 | 額度 |
|------|------|
| 站點數 | 無限 |
| 月請求數 | 500,000 次 |
| 月建置數 | 500 次 |
| 頻寬 | 無限（全球 CDN） |
| 儲存空間 | 1 GB |
| 單檔大小 | 25 MB |
| HTTPS | 自動（免費憑證） |
| 自訂網域 | 支援（最多 10 個） |
| 自訂 Header / Redirect | 支援 `_headers` / `_redirects` |

本專案所有靜態檔案總和約 200 KB，遠低於免費上限。

---

## 核心設計

### #data-flow-cloud

使用者從雲端開啟頁面時的資料流：

```
瀏覽器 → Cloudflare CDN → index.html
                          ├── app.js（JS 邏輯）
                          └── models.json（模型資料庫）
                          （本機硬體數據存在 _local/ 子目錄，不上傳雲端）
```

需要本機偵測的功能：
- GPU / VRAM 即時偵測（WebGL / WebGPU 瀏覽器降級）
- OS / CPU / RAM / 磁碟詳細數據
- 感測器（LibreHardwareMonitor）

雲端可運作的功能：
- 模型資料庫查詢（MODELS from models.json）
- 相容性分析報告
- 快速選擇 chips + 分類篩選
- 手動 GPU 選單選擇
- 量化版本分析
- 購買連結

### #files-to-deploy

部署時僅包含以下檔案：

```
index.html          入口頁面
app.js              主邏輯
models.json         模型資料庫
models.js           模型資料庫（JS 格式 fallback）
styles.css          CSS（目前未使用，保留）
_redirects          路由規則（選填）
_headers            安全標頭（選填）
.wranglerignore     排除本機硬體數據（_local/ 、.env 等）
```

**不部署**的檔案（已在 `.gitignore` 或專案根目錄但應排除）：

```
detect-hardware.ps1      本機 PowerShell 腳本
run-detection.bat        本機批次檔
main.py / hardware_monitor.py    FastAPI 後端
_local/                  本機硬體數據子目錄（.wranglerignore + .gitignore 雙重排除）
librehardware/           LibreHardwareMonitor DLL
__remo__/                開發文件
__pycache__/             Python cache
.env                     機密憑證
```

---

## 環境變數與憑證

### #env-vars

`.env` 只需 2 個變數，其餘都是 CLI 參數，**不需**放在 `.env` 中：

| 變數 | 必要性 | 用途 | 哪裡取得 |
|------|--------|------|----------|
| `CLOUDFLARE_ACCOUNT_ID` | ✅ 必要 | 識別你的 Cloudflare 帳戶 | 儀表板右側「Account ID」 |
| `CLOUDFLARE_API_TOKEN` | ✅ 必要 | 讓 wrangler 有權限部署 | 手動建立（步驟見下方） |

**不需要**的變數（已從 `.env` 移除）：
- `CLOUDFLARE_PROJECT_NAME` — 只是 `--project-name` CLI 參數，不是預先設定的東西。專案名稱在首次 `npx wrangler pages project create` 或 `npx wrangler pages deploy` 時自動建立，Cloudflare 儀表板會自動出現。
- `CLOUDFLARE_ENVIRONMENT` — wrangler 預設就是 `production`；preview 用 `--branch` flag 控制。

### #token-creation-steps

> **正確連結**：https://dash.cloudflare.com/profile/api-tokens

建立 API Token 的步驟：

1. 開啟 https://dash.cloudflare.com/profile/api-tokens
2. 點 **Create Token**
3. 找到 **Edit Cloudflare Pages** 模板，點右側 **Use template**（自動填入 Pages 權限）
4. 如果沒有模板，手動設定：

   | 欄位 | 填入值 |
   |------|--------|
   | Token name | `ai-hardware-checker` |
   | Permissions — Account → Cloudflare Pages | **Edit** |
   | Account Resources | Include → **你的帳戶** |
   | Client IP Filtering | 留空（不限制） |
   | TTL | 建議 **Never Expire**（或依政策設 1 年） |

5. 點 **Continue to Summary** → **Create Token**
6. **立刻複製 Token**（畫面只顯示一次，關掉就找不回來了）
7. 貼到 `.env` 的 `CLOUDFLARE_API_TOKEN=` 後面

### #token-upgrade-dns

> **使用者實戰發現**：只給 Pages:Edit 權限的 Token，**無法自動建立自訂網域的 CNAME 記錄**。
>
> API 回傳 `"CNAME record not set"`，需要使用者手動去 DNS 儀表板補 CNAME。

解決方案有兩個：

| 方式 | 做法 | 適用情境 |
|------|------|----------|
| **A：手動加 CNAME**（推薦） | 去 Zone 的 DNS 儀表板加一筆 CNAME 記錄即可 | DNS 只改一次，不需給 Token 更多權限 |
| **B：Token 加 Zone:DNS:Edit** | 重新產生 Token，追加 Permissions → Zone → DNS → Edit | 需要 CC 全自動處理 DNS 時 |

方式 B 的操作步驟：
1. 回到 https://dash.cloudflare.com/profile/api-tokens
2. 找到現有 Token → **Edit**
3. 在 Permissions 區塊按 **Add More**
4. 新增：`Zone` → `DNS` → `Edit`
5. 儲存後複製新 Token 值更新 `.env`

### #find-account-id

- 開啟 https://dash.cloudflare.com
- 右側欄 **Account ID** 下方即一串 32 位元 hex

### #env-file-content

最終 `.env` 長這樣：

```ini
CLOUDFLARE_ACCOUNT_ID=f47bb84a7d1bd86038037679c132bb91
CLOUDFLARE_API_TOKEN=your-token-pasted-here
```

### #token-permissions

最小權限（純部署不需自訂網域自動化）：

| 資源 | 權限 | 說明 |
|------|------|------|
| Cloudflare Pages | Edit | 建立 + 部署 Pages 專案 |

若要全自動化（含自訂網域），追加：

| 資源 | 權限 |
|------|------|
| Zone → DNS | Edit |

### #security-notes

- `.env` 已加入 `.gitignore`，**不可**提交到 git
- API Token 有權限部署 / 刪除 Pages 專案，切勿外洩
- Token 過期後重新產生即可，CC 自動偵錯

---

## 工具鏈

### #wrangler-cli

Cloudflare 官方 CLI 工具，透過 npx 使用（無需全域安裝）：

```bash
# 確認版本
npx wrangler --version

# 登入（瀏覽器 OAuth，不需 Token）
npx wrangler login
```

> `npx wrangler login` 使用瀏覽器 OAuth 流程，可免除手動設定 API Token 的步驟。Token 方式則適合 CI/CD 或 CC 自動化腳本。

### #cloudflare-mcp

Cloudflare 官方提供 MCP server（模型上下文協議），可讓 CC 直接操作 Cloudflare API。

安裝方式：

```bash
npx @cloudflare/mcp-server-cloudflare
```

環境變數需要：

```ini
CLOUDFLARE_API_TOKEN=123-your-api-token
CLOUDFLARE_ACCOUNT_ID=123-your-account-id
```

MCP server 提供的功能：
- `pages_deploy` — 部署 Pages 專案
- `pages_list` — 列出 Pages 專案
- `pages_delete` — 刪除 Pages 專案
- `d1_query` — 查詢 D1 資料庫
- `kv_list` / `kv_get` / `kv_put` — KV 儲存操作

（本專案僅需要 `pages_deploy`）

---

## 部署步驟

### #step-1-deploy（首次）

不需預先建立 Pages 專案，`wrangler pages deploy` 會自動建立：

```bash
npx wrangler pages deploy . --project-name=ai-hardware-checker
```

Wrangler 會自動忽略 `.gitignore` 中列出的檔案。

### #step-2-update

後續更新只需重複相同指令：

```bash
npx wrangler pages deploy . --project-name=ai-hardware-checker
```

Cloudflare 會自動建立新部署並切換流量，無停機時間。

### #step-3-verify

部署完成後，URL 格式：

```
https://ai-hardware-checker.pages.dev
```

驗證項目：
1. 首頁正常載入，無 JS 錯誤
2. 模型查詢功能正常（輸入模型名稱 → 顯示分析結果）
3. 快速選擇 chips 可點擊
4. 分類篩選可切換
5. 手動 GPU 選單可展開
6. 主題切換按鈕正常

無法驗證（只有在 `file://` 或本機才有）：
- 硬體偵測按鈕（會顯示瀏覽器偵測降級）
- 感測器面板

### #step-4-custom-domain

綁定自訂網域（以 `hardware.tribe.org.tw` 為例）：

**方式一：手動 DNS（Token 無 DNS 權限時）**
1. 先去 Cloudflare Pages 儀表板加自訂網域（或者讓 CC 用 API 先註冊，狀態會變 pending）
2. 去 Zone DNS 儀表板手動加 CNAME：
   - Type: `CNAME`, Name: `hardware`, Target: `ai-hardware-checker-lz1.pages.dev`, Proxy: ✅ 橘色雲朵
3. 等待 1-5 分鐘自動佈署 SSL，狀態從 `pending` → `active`

**方式二：API 全自動（Token 已有 Zone:DNS:Edit 權限）**
```bash
# CC 用 Cloudflare API 一次完成註冊 + CNAME + SSL
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT/domains" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "hardware.tribe.org.tw"}'
```

### #actual-result

本次部署最終成果：

| 項目 | 值 |
|------|-----|
| 專案名稱 | `ai-hardware-checker` |
| Pages 固定網域 | `https://ai-hardware-checker-lz1.pages.dev` |
| 自訂網域 | `https://hardware.tribe.org.tw` |
| SSL | Cloudflare 自動（Google Trust Services） |
| 上傳檔案數 | 65 files |
| 首次部署指令 | `npx wrangler pages project create ai-hardware-checker --production-branch main` |
| | `npx wrangler pages deploy . --project-name=ai-hardware-checker` |

---

## 已知限制

### #cloud-limitations

| 功能 | 本機(`file://` + PowerShell) | 雲端(Cloudflare Pages) |
|------|------------------------------|------------------------|
| PowerShell 深度硬體偵測（nvidia-smi 精準 VRAM、溫度、風扇） | ✅ 完整 | ❌ 不可用 |
| 瀏覽器偵測（GPU 型號/VRAM 推估 via WebGL、RAM、CPU 核心） | ✅ | ✅ |
| 感測器（LibreHardwareMonitor） | ✅ | ❌ |
| 模型資料庫查詢 | ✅ | ✅ |
| 相容性分析 | ✅ | ✅ |
| 量化版本分析 | ✅ | ✅ |
| 主題切換 | ✅ | ✅ |
| 手動 GPU 選單 | ✅ | ✅ |

### #error-handling-cloud

雲端部署時，`autoLoadSystemConfig()` 的 fetch 無法讀取 `_local/hardware-config.json`（`.wranglerignore` 已排除 `_local/`），會回傳 fallback 值而非拋出錯誤，`systemConfigLoaded` 維持 `false`。

瀏覽器偵測（GPU via WebGL/WebGPU、RAM via `navigator.deviceMemory`、CPU via `navigator.hardwareConcurrency`）會正常運作。

不需要寫新舊相容代碼。

---

## Tasks

### Task 1: 建立 `.env`（已完成）

- 已建立 `S:\projects\ai-hardware-checker\.env`
- 僅含 2 個變數：`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`
- 使用者已填入 `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` 待使用者按照 [#token-creation-steps] 建立後填入

### Task 2: 更新 `.gitignore`（已完成）

- `.env`、`_local/`（本機硬體數據）已加入

### Task 3: 建立 API Token（使用者操作）

- 按 [#token-creation-steps] 在 Cloudflare 儀表板建立 Token
- 貼入 `.env` 的 `CLOUDFLARE_API_TOKEN=`

### Task 4: 發起部署（CC 執行）

- 使用者填入 Token 後，CC 執行：
  ```bash
  npx wrangler pages deploy . --project-name=ai-hardware-checker
  ```
- 部署完成後回傳 `.pages.dev` URL

### Task 5: 驗證

- 開啟 `.pages.dev` URL
- 檢查 console 無錯誤
- 確認模型查詢、chips、分類篩選、主題切換功能正常
- 確認硬體偵測按鈕顯示降級提示（非錯誤）

### Task 6: 綁定自訂網域

- 使用者決定是否綁自訂網域
- 如果 Token 有 DNS 權限 → CC 可以全自動
- 如果 Token 只有 Pages 權限 → 使用者手動在 DNS 儀表板加 CNAME
- 等待 SSL 佈署完成（1-5 分鐘）

---

## 相關文件

- Cloudflare Pages 文件：https://developers.cloudflare.com/pages/
- Wrangler CLI 參考：https://developers.cloudflare.com/workers/wrangler/
- Cloudflare MCP Server：https://github.com/cloudflare/mcp-server-cloudflare
- 本專案 CSS 變數設計：`__remo__/docs/spec/002-NVIDIA-Linear-主題切換與版面重新設計.md`
- 開發文件命名規範：`S:\projects\share\docs\spec\001-rule-SSOT-文件命名與撰寫規範.md`
- Cloudflare 上雲通用指南：`S:\projects\share\cloudflare\003-guide-Cloudflare一條龍上雲（cloudflare_one_stop_deploy）.md`
- 前期 Cloudflare 實戰記錄：`S:\projects\share\cloudflare\001-log-Cloudflare構建失敗（Build_failed）.md`
- 前期 Cloudflare DNS 配置記錄：`S:\projects\share\cloudflare\002-log-Cloudflare_DNS_與_Workers_路由配置專案實錄.md`
