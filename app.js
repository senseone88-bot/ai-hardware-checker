// ========================================================================
// XSS 安全輔助
// ========================================================================
function esc(str) {
  if (str == null) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ========================================================================
// 模型資料庫（從 models.json 載入）
// ========================================================================
let MODELS = {};

async function loadModels() {
  try {
    const resp = await fetch("models.json?_t=" + Date.now());
    if (resp.ok) { MODELS = await resp.json(); return; }
  } catch (e) {}
  // fallback: script tag for file:// protocol
  try {
    const data = await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; clearTimeout(t); document.head.removeChild(s); v ? resolve(v) : reject(); };
      const t = setTimeout(() => done(null), 5000);
      s.onload = () => done(window._MODELS || null);
      s.onerror = () => done(null);
      s.src = "models.js?_t=" + Date.now();
      document.head.appendChild(s);
    });
    if (data) { MODELS = data; return; }
  } catch (e) {}
  console.warn("Failed to load models.json");
}

// ========================================================================
// 硬體狀態
// ========================================================================
var pc = { os: "", cpu: "", cpuCores: navigator.hardwareConcurrency || 0, ramGB: 0, gpu: "", vramGB: 0, diskGB: 0, sensors: [], systemConfigLoaded: false };

// ========================================================================
// GPU 型號 → 顯存對照表（依型號精確匹配，更特定者優先）
// ========================================================================
const GPU_VRAM_DB = [
  // NVIDIA GeForce RTX 50 系列（筆電優先）
  [/rtx 5090 laptop\b/, 24], [/rtx 5080 laptop\b/, 16],
  [/rtx 5070 ti laptop\b/, 12], [/rtx 5070 laptop\b/, 8],
  [/rtx 5060 laptop\b/, 8],
  [/rtx 5090m\b/, 24], [/rtx 5080m\b/, 16],
  [/rtx 5070 ti m\b/, 12], [/rtx 5070m\b/, 8],
  [/rtx 5060m\b/, 8],
  // RTX 50 系列桌上型
  [/rtx 5090\b/, 32], [/rtx 5080\b/, 24], [/rtx 5070 ti\b/, 16], [/rtx 5070\b/, 12],
  [/rtx 5060 ti\b/, 8], [/rtx 5060\b/, 8],

  // NVIDIA GeForce RTX 40 系列（筆電優先）
  [/rtx 4090m\b/, 16], [/rtx 4090 laptop\b/, 16], [/rtx 4080 laptop\b/, 12],
  [/rtx 4070 laptop\b/, 8], [/rtx 4060 laptop\b/, 8], [/rtx 4050 laptop\b/, 6],
  [/rtx 4090 mobile\b/, 16], [/rtx 4080 mobile\b/, 12],
  [/rtx 4070 mobile\b/, 8], [/rtx 4060 mobile\b/, 8], [/rtx 4050 mobile\b/, 6],
  // RTX 40 系列桌上型
  [/rtx 4090\b/, 24], [/rtx 4080 super\b/, 16], [/rtx 4080\b/, 16],
  [/rtx 4070 ti super\b/, 16], [/rtx 4070 ti\b/, 12], [/rtx 4070 super\b/, 12], [/rtx 4070\b/, 12],
  [/rtx 4060 ti\s*16\b/, 16], [/rtx 4060 ti\b/, 8], [/rtx 4060\b/, 8],
  [/rtx 4050\b/, 6],

  // NVIDIA GeForce RTX 30 系列（筆電優先）
  [/rtx 3080 ti laptop\b/, 16], [/rtx 3080 laptop\b/, 8],
  [/rtx 3070 ti laptop\b/, 8], [/rtx 3070 laptop\b/, 8],
  [/rtx 3060 laptop\b/, 6],
  [/rtx 3050 ti laptop\b/, 4], [/rtx 3050 laptop\b/, 4],
  [/rtx 3080m\b/, 8], [/rtx 3070m\b/, 8],
  [/rtx 3060m\b/, 6], [/rtx 3050m\b/, 4],
  [/rtx 3080 mobile\b/, 8], [/rtx 3070 mobile\b/, 8],
  [/rtx 3060 mobile\b/, 6], [/rtx 3050 mobile\b/, 4],
  // RTX 30 系列桌上型
  [/rtx 3090 ti\b/, 24], [/rtx 3090\b/, 24],
  [/rtx 3080 ti\b/, 12], [/rtx 3080\b/, 10], [/rtx 3080\s+12g\b/, 12],
  [/rtx 3070 ti\b/, 8], [/rtx 3070\b/, 8],
  [/rtx 3060 ti\b/, 8],
  [/rtx 3060\s*12g\b/, 12], [/rtx 3060\s*8g\b/, 8],
  [/rtx 3060\b/, 12],
  [/rtx 3050\b/, 6],

  // NVIDIA GeForce RTX 20 系列（筆電優先）
  [/rtx 2080 super laptop\b/, 8], [/rtx 2080 laptop\b/, 8],
  [/rtx 2070 laptop\b/, 8], [/rtx 2060 laptop\b/, 6],
  [/rtx 2050 laptop\b/, 4],
  [/rtx 2080m\b/, 8], [/rtx 2070m\b/, 8], [/rtx 2060m\b/, 6],
  [/rtx 2080 mobile\b/, 8], [/rtx 2070 mobile\b/, 8],
  [/rtx 2060 mobile\b/, 6], [/rtx 2050 mobile\b/, 4],
  // RTX 20 系列桌上型
  [/rtx 2080 ti\b/, 11], [/rtx 2080 super\b/, 8], [/rtx 2080\b/, 8],
  [/rtx 2070 super\b/, 8], [/rtx 2070\b/, 8],
  [/rtx 2060 super\b/, 8], [/rtx 2060\b/, 6],
  [/rtx 2050\b/, 4],

  // NVIDIA GeForce GTX 16 / 10 系列
  [/gtx 1660 ti\b/, 6], [/gtx 1660 super\b/, 6], [/gtx 1660\b/, 6],
  [/gtx 1650 super\b/, 4], [/gtx 1650\b/, 4],
  [/gtx 1630\b/, 4],
  [/gtx 1080 ti\b/, 11], [/gtx 1080\b/, 8],
  [/gtx 1070 ti\b/, 8], [/gtx 1070\b/, 8],
  [/gtx 1060\s*6g\b/, 6], [/gtx 1060\s*5g\b/, 5], [/gtx 1060\s*3g\b/, 3], [/gtx 1060\b/, 6],
  [/gtx 1050 ti\b/, 4], [/gtx 1050\b/, 3],
  [/gtx 1030\b/, 2],
  [/gtx 980 ti\b/, 6], [/gtx 980\b/, 4],
  [/gtx 970\b/, 4], [/gtx 960\b/, 2],
  [/gtx 950\b/, 2],
  [/gtx 880m\b/, 4], [/gtx 870m\b/, 3], [/gtx 860m\b/, 2],
  [/gtx 780m\b/, 4], [/gtx 770m\b/, 3], [/gtx 765m\b/, 2],

  // NVIDIA Titan
  [/titan rtx\b/, 24], [/titan v\b/, 12], [/titan xp\b/, 12], [/titan x\b/, 12],

  // NVIDIA 專業卡 / 資料中心
  [/h100\b/, 80], [/h200\b/, 141],
  [/b100\b/, 80],
  [/a100\s*80/, 80], [/a100\b/, 40],
  [/a6000\b/, 48], [/a5000\b/, 24], [/a4500\b/, 20], [/a4000\b/, 16],
  [/rtx a6000\b/, 48], [/rtx a5000\b/, 24],
  [/quadro rtx 8000\b/, 48], [/quadro rtx 6000\b/, 24], [/quadro rtx 5000\b/, 16],
  [/quadro p?[0-9]{4}\b/, 8],
  [/nvidia rtx [0-9]{4,5} laptop\b/, 4],

  // AMD Radeon RX 7000 系列（筆電優先）
  [/7900m\b/, 16], [/7800m\b/, 12],
  [/7600m xt\b/, 8], [/7600m\b/, 8],
  [/7700s\b/, 8], [/7600s\b/, 6],
  // AMD Radeon RX 7000 系列桌上型
  [/7900 xtx\b/, 24], [/7900 xt\b/, 20], [/7900 gre\b/, 16],
  [/7800 xt\b/, 16], [/7700 xt\b/, 12], [/7600 xt\b/, 8], [/7600\b/, 8],
  [/7500\b/, 6],

  // AMD Radeon RX 6000 系列（筆電優先）
  [/6800m\b/, 12], [/6700m\b/, 10], [/6600m\b/, 8],
  // AMD Radeon RX 6000 系列桌上型
  [/6950 xt\b/, 16], [/6900 xt\b/, 16], [/6800 xt\b/, 16], [/6800\b/, 16],
  [/6750 xt\b/, 12], [/6700 xt\b/, 12], [/6700\b/, 10],
  [/6650 xt\b/, 8], [/6600 xt\b/, 8], [/6600\b/, 8],
  [/6500 xt\b/, 4], [/6400\b/, 4],

  // AMD Radeon RX 5000 系列
  [/5700 xt\b/, 8], [/5700\b/, 8], [/5600 xt\b/, 6], [/5500 xt\b/, 4],

  // AMD Radeon VII / Vega / 500M 系列
  [/radeon vii\b/, 16], [/vega 64\b/, 8], [/vega 56\b/, 8],
  [/vega 20\b/, 4], [/vega 11\b/, 2], [/vega 8\b/, 2],
  [/5500m\b/, 4], [/5300m\b/, 4],

  // Intel Arc
  [/arc a770\s*16/, 16], [/arc a770\b/, 16], [/arc a750\b/, 8], [/arc a580\b/, 8],
  [/arc a380\b/, 6], [/arc a310\b/, 4],

  // Intel Iris / UHD（內顯）
  [/iris xe\b/, 2], [/iris plus\b/, 2], [/uhd [0-9]{3}\b/, 2], [/hd graphics\b/, 1],

  // Apple Silicon
  [/m4\s*max\b/, 48], [/m4\s*pro\s*24/, 24], [/m4\s*pro/, 16], [/m4\b/, 16],
  [/m3\s*max\s*128/, 128], [/m3\s*max\s*96/, 96], [/m3\s*max\s*64/, 64], [/m3\s*max\s*48/, 48], [/m3\s*max\b/, 48],
  [/m3\s*pro\s*24/, 24], [/m3\s*pro\s*18/, 18], [/m3\s*pro\b/, 18],
  [/m3\b/, 8],
  [/m2\s*ultra\b/, 64], [/m2\s*max\s*96/, 96], [/m2\s*max\s*64/, 64], [/m2\s*max\s*48/, 48], [/m2\s*max\s*32/, 32], [/m2\s*max\b/, 32],
  [/m2\s*pro\s*24/, 24], [/m2\s*pro\s*16/, 16], [/m2\s*pro\b/, 16],
  [/m2\b/, 8],
  [/m1\s*ultra\b/, 64], [/m1\s*max\s*64/, 64], [/m1\s*max\s*32/, 32], [/m1\s*max\b/, 32],
  [/m1\s*pro\s*32/, 32], [/m1\s*pro\s*24/, 24], [/m1\s*pro\s*16/, 16], [/m1\s*pro\b/, 16],
  [/m1\b/, 8],

  // Qualcomm Snapdragon / Adreno
  [/adreno 7[0-9]{2}\b/, 4], [/adreno 6[0-9]{2}\b/, 2], [/adreno 5[0-9]{2}\b/, 1],
  [/snapdragon\b/, 2],
];

function lookupVRAM(gpuStr) {
  const s = gpuStr.toLowerCase().trim();
  if (!s) return 0;
  for (const [regex, vram] of GPU_VRAM_DB) {
    if (regex.test(s)) return vram;
  }
  const memMatch = s.match(/(\d+)\s*g[bb]\b/);
  if (memMatch) return parseInt(memMatch[1]);
  if (s.includes("nvidia") || s.includes("geforce")) {
    if (s.includes("rtx")) return 8;
    if (s.includes("gtx")) return 4;
    return 4;
  }
  if (s.includes("amd") || s.includes("radeon")) {
    if (s.includes("rx")) return 4;
    return 2;
  }
  if (s.includes("intel")) return 1;
  if (s.includes("apple")) return 8;
  return 0;
}

// ========================================================================
// UI 刷新（共用函數，消除重複）
// ========================================================================
function refreshSpecDisplay() {
  document.getElementById("spec_os").textContent  = pc.os     || "—";
  document.getElementById("spec_cpu").textContent = pc.cpu    || "—";
  document.getElementById("spec_ram").textContent  = pc.ramGB  > 0 ? pc.ramGB  + " GB" : "—";
  document.getElementById("spec_gpu").textContent  = pc.gpu    || "—";
  document.getElementById("spec_vram").textContent = pc.vramGB > 0 ? pc.vramGB + " GB" : "—";
  document.getElementById("spec_disk").textContent = pc.diskGB > 0 ? pc.diskGB + " GB" : "—";
}

function applyGPUResult(gpuInfo) {
  if (!gpuInfo || !gpuInfo.name) {
    document.getElementById("spec_gpu").textContent = "⚠️ 未能自動偵測";
    document.getElementById("spec_vram").textContent = "⚠️ 請手動選擇";
    return;
  }
  const dbVram = lookupVRAM(gpuInfo.name);
  document.getElementById("spec_gpu").textContent = gpuInfo.name;
  pc.gpu = gpuInfo.name;

  if (gpuInfo.vram > 0) {
    let finalVram = gpuInfo.vram;
    let methodLabel = "";
    if (gpuInfo.method === "NVIDIA_EXT") methodLabel = " 🔹 硬體偵測";
    else if (gpuInfo.method === "ALLOC_TEST") methodLabel = " 🔸 實測估算";
    else if (gpuInfo.method === "WEBGPU") methodLabel = " 🔹 WebGPU";
    else if (gpuInfo.method === "LOOKUP") methodLabel = "";
    else if (gpuInfo.method === "NAME_ONLY") methodLabel = " ⚠️ 名稱推測";
    if (dbVram > finalVram && dbVram <= 128) {
      finalVram = dbVram;
      methodLabel = " 🔹 型號校驗";
    }
    document.getElementById("spec_vram").textContent = finalVram + " GB" + methodLabel;
    pc.vramGB = finalVram;
  } else {
    document.getElementById("spec_vram").textContent = "⚠️ 無法自動判斷，請手動選擇";
  }
}

function renderSensors(sensors) {
  const panel = document.getElementById("sensorPanel");
  const cont  = document.getElementById("sensorContent");
  const dropdown = document.getElementById("sensorDropdown");
  if (!sensors || sensors.length === 0) { panel.style.display = "none"; return; }
  panel.style.display = "block";

  const categoryMap = {
    "CPU": "CPU", "GPU (NVIDIA)": "GPU", "GPU (AMD)": "GPU", "GPU (Intel)": "GPU",
    "RAM": "記憶體", "Storage": "儲存裝置", "Motherboard": "主機板",
    "Super I/O": "主機板", "Network": "網路", "Storage Controller": "儲存裝置"
  };
  const DROPDOWN_FILTERS = ["全部", "CPU", "GPU", "網路", "記憶體", "儲存裝置", "主機板"];
  const categories = new Set();
  const categorized = {};
  for (const hw of sensors) {
    const cat = categoryMap[hw.type];
    if (!cat) continue;
    categories.add(cat);
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(hw);
  }

  let activeFilter = "";
  window._sensorData = { sensors, categorized, activeFilter };

  // 建立下拉選單
  dropdown.innerHTML = `<option value="">— 請選擇 —</option>` + DROPDOWN_FILTERS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

  function renderGrid() {
    let html = "";
    const list = window._sensorData.activeFilter === "全部" ? sensors : (categorized[window._sensorData.activeFilter] || []);
    let idx = 0;
    for (const hw of list) {
      if (!hw.sensors || hw.sensors.length === 0) continue;
      const gid = "sg_" + (idx++);
      html += `<div class="sensor-group" style="margin-bottom:6px;">`;
      html += `<h4 onclick="const g=document.getElementById('${gid}');g.style.display=g.style.display==='none'?'block':'none';this.querySelector('.sg-arrow').textContent=g.style.display==='none'?'▼':'▲'" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border-radius:6px;background:var(--surface2);margin:0;font-size:0.85rem;user-select:none;">`;
      html += `<span class="sg-arrow" style="font-size:0.65rem;color:var(--text2);">▼</span>`;
      html += `${esc(hw.hardware)} <span style="font-size:0.75rem;color:var(--text2);font-weight:400;">(${esc(hw.type)})</span>`;
      html += `</h4>`;
      html += `<div id="${gid}" style="display:none;">`;
      html += `<div class="sensor-grid" style="padding:6px 0;">`;
      for (const s of hw.sensors) {
        let unit = "", cls = "s-value";
        const sv = (s.value != null && isFinite(s.value)) ? s.value : null;
        switch (s.type) {
          case "Temperature": unit = "°C"; break;
          case "Load":        unit = "%";  break;
          case "Clock":       unit = " MHz"; break;
          case "Fan":         unit = " RPM"; break;
          case "Power":       unit = " W"; break;
          case "Voltage":     unit = " V"; break;
          case "Data":        unit = " GB"; break;
          case "SmallData":   unit = " MB"; break;
          case "Flow":        unit = " L/h"; break;
          case "Control":     unit = " %"; break;
          case "Level":       unit = " %"; break;
          case "Factor":      unit = " 1"; break;
          case "Throughput":  unit = " B/s"; break;
          case "Frequency":   unit = " Hz"; break;
        }
        if (sv !== null) {
          if (s.type === "Temperature") {
            if (sv >= 80) cls += " temp-hot";
            else if (sv >= 60) cls += " temp-warm";
            else cls += " temp-ok";
          } else if (s.type === "Load" || s.type === "Control" || s.type === "Level") {
            if (sv >= 80) cls += " load-high";
            else if (sv >= 50) cls += " load-med";
            else cls += " load-low";
          }
        }
        html += `<div class="sensor-item"><span class="s-label">${esc(s.name)}</span><span class="${cls}">${sv != null ? sv : "—"}<span class="s-unit">${unit}</span></span></div>`;
      }
      html += "</div></div></div>";
    }
    cont.innerHTML = html;
  }

  renderGrid();
  window._sensorRenderGrid = renderGrid;
}

function onSensorFilterChange() {
  const dropdown = document.getElementById("sensorDropdown");
  const content = document.getElementById("sensorContent");
  if (!dropdown || !content) return;
  if (!window._sensorData) return;
  const val = dropdown.value;
  if (!val) {
    content.style.display = "none";
    return;
  }
  window._sensorData.activeFilter = val;
  content.style.display = "block";
  if (window._sensorRenderGrid) window._sensorRenderGrid();
}

// ========================================================================
// 硬體偵測（主入口）
// ========================================================================
function detectHardware() {
  if (typeof pc !== 'undefined' && pc.systemConfigLoaded) {
    refreshSpecDisplay();
    return;
  }
  pc.systemConfigLoaded = false;
  document.getElementById("spec_os").textContent = "偵測中...";
  const ua = navigator.userAgent;
  let os = "未知";
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
  else if (ua.includes("Mac OS X")) { const m = ua.match(/Mac OS X (\d+[._]\d+)/); os = "macOS" + (m ? " " + m[1].replace("_",".") : ""); }
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  pc.os = os;
  document.getElementById("spec_os").textContent = os;

  const cores = navigator.hardwareConcurrency || "?";
  pc.cpuCores = cores;
  let cpuStr = cores + " 核心";
  if (ua.includes("x64") || ua.includes("x86_64") || ua.includes("Win64")) { cpuStr += " (x86-64)"; pc.cpu = cores + " 核心"; }
  else if (ua.includes("arm64") || ua.includes("ARM64") || ua.includes("aarch64")) { cpuStr += " (ARM64)"; pc.cpu = cores + " 核心 (ARM)"; }
  else { pc.cpu = cores + " 核心"; }
  document.getElementById("spec_cpu").textContent = cpuStr;

  let ram = "未知";
  if (navigator.deviceMemory) { ram = navigator.deviceMemory + " GB"; pc.ramGB = navigator.deviceMemory; }
  else { ram = "⚠️ 瀏覽器不支援偵測（Chrome 可用）"; pc.ramGB = 0; }
  document.getElementById("spec_ram").textContent = ram;

  document.getElementById("spec_gpu").textContent = "🔄 偵測 GPU 中...";
  document.getElementById("spec_vram").textContent = "🔄 偵測中...";

  document.getElementById("spec_disk").textContent = "—";
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(e => { const gb = Math.round(e.quota / (1024**3)); if (gb > 0) { pc.diskGB = gb; document.getElementById("spec_disk").textContent = gb + " GB 可用"; } }).catch(() => {});
  }

  detectGPU().then(gpuInfo => {
    if (typeof pc !== 'undefined' && pc.systemConfigLoaded) return;
    applyGPUResult(gpuInfo);
  }).finally(() => {
    setTimeout(() => document.getElementById("manualGpu").classList.add("visible"), 800);
  });
}

// ========================================================================
// WebGL VRAM 偵測（修復 texture leak）
// ========================================================================
function detectVRAMByAllocation(gl) {
  try {
    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let step = 1024;
    let maxSuccess = 0;

    while (step <= maxTexSize) {
      let allocated = false;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, step, step, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const err = gl.getError();
      allocated = (err === 0);
      if (allocated) {
        maxSuccess = Math.max(maxSuccess, (step * step * 4) / (1024 * 1024));
      }
      gl.deleteTexture(tex);
      if (!allocated) break;
      const nextStep = Math.min(Math.floor(step * 1.5), maxTexSize);
      if (nextStep === step) break;
      step = nextStep;
    }

    if (maxSuccess > 100) return Math.round(maxSuccess * 4 / 1024);
    if (maxSuccess > 0) return Math.round(maxSuccess * 6 / 1024);
    return 0;
  } catch (e) { return 0; }
}

function detectVRAMNvidiaExt(gl) {
  try {
    const ext = gl.getExtension("GL_GPU_MEM_INFO_TOTAL_AVAILABLE_MEMORY_NVIDIA");
    if (ext) {
      const totalMemKb = gl.getParameter(ext.GPU_MEM_INFO_TOTAL_AVAILABLE_MEMORY_NVIDIA);
      if (totalMemKb && totalMemKb > 0) {
        return Math.round(totalMemKb / (1024 * 1024));
      }
    }
  } catch (e) {}
  return 0;
}

// ========================================================================
// 多層次 GPU 偵測
// ========================================================================
async function detectGPU() {
  let gpuName = "";
  let vramFromName = 0;

  // 第一步：WebGL
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      const nvVRAM = detectVRAMNvidiaExt(gl);
      if (nvVRAM > 0) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          const v = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
          gpuName = (v + " " + r).replace(/Google Inc\.\s*/i, "").replace(/\s+/g, " ").trim();
        } else {
          gpuName = gl.getParameter(gl.RENDERER) + " " + gl.getParameter(gl.VENDOR);
        }
        return { name: gpuName, vram: nvVRAM, method: "NVIDIA_EXT" };
      }

      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        const v = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        gpuName = (v + " " + r).replace(/Google Inc\.\s*/i, "").replace(/\s+/g, " ").trim();
      }
      if (!gpuName || gpuName.length < 3) {
        gpuName = (gl.getParameter(gl.RENDERER) + " " + gl.getParameter(gl.VENDOR)).replace(/\s+/g, " ").trim();
      }

      vramFromName = lookupVRAM(gpuName);

      if (vramFromName === 0) {
        const allocVRAM = detectVRAMByAllocation(gl);
        if (allocVRAM > 0) {
          return { name: gpuName || "Unknown GPU", vram: allocVRAM, method: "ALLOC_TEST" };
        }
      }
    }
  } catch (e) {}

  // 第二步：WebGPU
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || {};
        gpuName = info.description || info.device || info.vendor || "";
        if (gpuName) {
          vramFromName = lookupVRAM(gpuName);
          if (info.memory) {
            return { name: gpuName.trim(), vram: Math.round(info.memory / (1024**3)), method: "WEBGPU" };
          }
          return { name: gpuName.trim(), vram: vramFromName, method: vramFromName > 0 ? "LOOKUP" : "NAME_ONLY" };
        }
      }
    }
  } catch (e) {}

  // 第三步：User-Agent（Apple Silicon）
  try {
    const ua = navigator.userAgent;
    if (ua.includes("Mac ARM") || ua.includes("Apple M")) {
      const m = ua.match(/Apple\s*(M\d+)\s*(Pro|Max|Ultra)?\s*/i);
      if (m) {
        const name = "Apple " + (m[1] || "") + " " + (m[2] || "");
        return { name: name.trim(), vram: lookupVRAM(name), method: "UA_PARSE" };
      }
    }
  } catch (e) {}

  if (gpuName) {
    return { name: gpuName, vram: vramFromName, method: vramFromName > 0 ? "LOOKUP" : "NAME_ONLY" };
  }

  return null;
}

// ========================================================================
// 手動 GPU
// ========================================================================
function onGpuSelect() {
  pc.systemConfigLoaded = false;
  const val = document.getElementById("gpuSelect").value;
  if (!val) return;
  const parts = val.split("|");
  document.getElementById("spec_gpu").textContent = parts[0];
  document.getElementById("spec_vram").textContent = parts[1] + " GB";
  pc.gpu = parts[0]; pc.vramGB = parseInt(parts[1]);
}

function applyManualGpu() {
  pc.systemConfigLoaded = false;
  const sel = document.getElementById("gpuSelect").value;
  const manual = document.getElementById("vramManual").value;
  if (sel) {
    const parts = sel.split("|");
    document.getElementById("spec_gpu").textContent = parts[0];
    document.getElementById("spec_vram").textContent = parts[1] + " GB";
    pc.gpu = parts[0]; pc.vramGB = parseInt(parts[1]);
  } else if (manual) {
    const v = parseInt(manual);
    if (v > 0) {
      document.getElementById("spec_vram").textContent = v + " GB";
      pc.vramGB = v;
      if (!pc.gpu) {
        pc.gpu = "手動設置";
        document.getElementById("spec_gpu").textContent = "手動設置";
      }
    }
  }
  document.getElementById("manualGpu").classList.remove("visible");
}

// ========================================================================
// 快速重新偵測 GPU（使用共用 applyGPUResult）
// ========================================================================
function quickDetectGPU() {
  document.getElementById("spec_gpu").textContent = "🔄 偵測 GPU 中...";
  document.getElementById("spec_vram").textContent = "🔄 偵測中...";
  detectGPU().then(gpuInfo => {
    if (typeof pc !== 'undefined' && pc.systemConfigLoaded) return;
    applyGPUResult(gpuInfo);
  }).finally(() => {
    setTimeout(() => document.getElementById("manualGpu").classList.add("visible"), 500);
  });
}

// ========================================================================
// 演示配置
// ========================================================================
function fillDemoConfig() {
  pc.systemConfigLoaded = false;
  pc.os = "Windows 11"; pc.cpu = "16 核心"; pc.cpuCores = 16; pc.ramGB = 32; pc.gpu = "NVIDIA RTX 4090"; pc.vramGB = 24; pc.diskGB = 500;
  document.getElementById("spec_os").textContent = "Windows 11";
  document.getElementById("spec_cpu").textContent = "16 核心 (x86-64)";
  document.getElementById("spec_ram").textContent = "32 GB";
  document.getElementById("spec_gpu").textContent = "NVIDIA RTX 4090";
  document.getElementById("spec_vram").textContent = "24 GB";
  document.getElementById("spec_disk").textContent = "500 GB+";
  document.getElementById("manualGpu").classList.add("visible");
}

// ========================================================================
// 系統級硬體偵測 — 彈窗 + 輪詢
// ========================================================================
let detectPollTimer = null;

function updateDetectStep(id, status, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const icon = el.querySelector(".step-icon");
  if (status === "done") { el.className = "detect-step done"; if (icon) icon.textContent = "✅"; }
  else if (status === "active") { el.className = "detect-step active"; if (icon) icon.textContent = "⏳"; }
  else if (status === "fail") { el.className = "detect-step fail"; if (icon) icon.textContent = "❌"; }
  else { el.className = "detect-step"; if (icon) icon.textContent = "⏳"; }
  if (msg) {
    const textNode = el.childNodes[el.childNodes.length - 1];
    if (textNode) textNode.textContent = " " + msg;
  }
}

function showDetectModal(state) {
  const overlay = document.getElementById("detectOverlay");
  if (!overlay) return;
  if (state === "show") {
    overlay.classList.add("visible");
    ["step1","step2","step3","step4"].forEach(id => updateDetectStep(id, "", ""));
    updateDetectStep("step1", "active", "啟動 PowerShell 偵測腳本...");
  } else {
    overlay.classList.remove("visible");
  }
}

function closeDetectModal() {
  if (detectPollTimer) { clearInterval(detectPollTimer); detectPollTimer = null; }
  showDetectModal("hide");
}

function showDetectError(msg) {
  const content = document.getElementById("detectModalContent");
  if (!content) return;
  content.innerHTML = `
    <div style="font-size:3rem;margin-bottom:8px;">😅</div>
    <h2>偵測需要你幫忙</h2>
    <p style="font-size:0.85rem;color:var(--text2);">瀏覽器無法直接執行系統腳本。<br>請手動執行偵測，只需 3 秒：</p>
    <div class="detect-steps" style="text-align:center;">
      <div style="background:var(--surface2);border-radius:10px;padding:12px;margin:8px 0;">
        <div style="font-size:1.2rem;font-weight:600;">📁 雙擊執行</div>
        <code style="display:block;background:var(--bg);padding:8px 12px;border-radius:6px;margin:8px 0;font-size:0.85rem;">run-detection.bat</code>
        <div style="font-size:0.8rem;color:var(--text2);">或在終端機執行：</div>
        <code style="display:block;background:var(--bg);padding:8px 12px;border-radius:6px;margin:8px 0;font-size:0.75rem;">powershell -File detect-hardware.ps1</code>
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--green);">🔄 偵測完成後會自動載入結果...</p>
    <div style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;">
      <button class="detect-retry-btn" onclick="retryDetect()">🔄 重新偵測</button>
      <button class="detect-browser-btn" onclick="fallbackBrowserDetect()">🌐 改為瀏覽器偵測（較不準）</button>
      <button class="detect-close-btn" onclick="closeDetectModal()">✕ 關閉</button>
    </div>
    ${msg ? `<p style="margin-top:8px;font-size:0.78rem;color:var(--red);">${esc(msg)}</p>` : ""}
  `;
  startDetectPolling();
}

function startDetectPolling() {
  if (detectPollTimer) clearInterval(detectPollTimer);
  let lastContent = "";
  let polling = false;

  const doPoll = async () => {
    if (polling) return;
    polling = true;
    try {
      let data = null;
      try {
        const resp = await fetch("hardware-config.json?_t=" + Date.now());
        if (resp.ok) data = await resp.json();
      } catch (e) {}
      if (!data) {
        try { data = await _loadScript("hardware-config.js?_t=" + Date.now()); } catch (e) {}
      }
      if (data && !data.error && data.vram_gb > 0) {
        const content = JSON.stringify(data);
        if (content !== lastContent) {
          lastContent = content;
          clearInterval(detectPollTimer);
          detectPollTimer = null;
          applySystemConfig(data);
          closeDetectModal();
          return true;
        }
      }
    } catch (e) {}
    polling = false;
    return false;
  };

  detectPollTimer = setInterval(doPoll, 1500);
  doPoll();
}

function fallbackBrowserDetect() {
  if (detectPollTimer) { clearInterval(detectPollTimer); detectPollTimer = null; }
  closeDetectModal();
  detectHardware();
  document.getElementById("sysDetectBanner").style.display = "block";
  document.getElementById("sysDetectBanner").innerHTML = "🌐 使用瀏覽器偵測（數據有限）。若要更精準請雙擊 <code>run-detection.bat</code>";
}

function retryDetect() {
  if (detectPollTimer) { clearInterval(detectPollTimer); detectPollTimer = null; }
  loadSystemConfig();
}

async function loadSystemConfig() {
  if (window.location.protocol !== 'file:') {
    showDetectModal("show");
    const content = document.getElementById("detectModalContent");
    if (content) {
      content.innerHTML = `
        <div style="font-size:3rem;margin-bottom:8px;">📥</div>
        <h2>需要在本機執行偵測</h2>
        <p style="font-size:0.85rem;color:var(--text2);">從雲端網頁無法直接啟動本機 PowerShell。<br>請下載 <strong>一個檔案</strong> 到本機執行：</p>
        <div class="detect-steps" style="text-align:center;">
          <div style="background:var(--surface2);border-radius:10px;padding:12px;margin:8px 0;">
            <div style="font-size:1.2rem;font-weight:600;">📁 雙擊執行</div>
            <code style="display:block;background:var(--bg);padding:8px 12px;border-radius:6px;margin:8px 0;font-size:0.85rem;">run-detection.bat</code>
            <div style="font-size:0.8rem;color:var(--text2);">內建偵測腳本，無需網路連線</div>
          </div>
          <div style="margin-top:8px;font-size:0.82rem;">
            📥 <a href="run-detection.bat" download="run-detection.bat" style="color:#7c5cfc;">下載 run-detection.bat</a>
            🎯 一個檔案搞定，內建偵測腳本
          </div>
        </div>
        <p style="font-size:0.8rem;color:var(--green);">⏳ 執行後重新整理此頁面即可載入結果</p>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;">
          <button class="detect-close-btn" onclick="closeDetectModal()">✕ 關閉</button>
        </div>
      `;
    }
    return;
  }

  let checkData = null;
  try {
    const checkResp = await fetch("hardware-config.json?_t=" + Date.now());
    if (checkResp.ok) checkData = await checkResp.json();
  } catch (e) {}
  if (!checkData) {
    try { checkData = await _loadScript("hardware-config.js?_t=" + Date.now()); } catch (e) {}
  }

  if (checkData && !checkData.error && checkData.vram_gb > 0) {
    const now = new Date();
    const detected = new Date(checkData.detected_at?.replace(" ", "T") || 0);
    const ageSec = (now - detected) / 1000;
    if (ageSec < 30) {
      applySystemConfig(checkData);
      document.getElementById("sysDetectBanner").style.display = "block";
      document.getElementById("sysDetectBanner").innerHTML = "✅ 已載入最新的系統偵測結果（" + Math.round(ageSec) + " 秒前）";
      return;
    }
  }
  showDetectModal("show");
  updateDetectStep("step1", "fail", "無法自動啟動，請手動執行");
  showDetectError("請手動執行 run-detection.bat");
}

function applySystemConfig(data) {
  if (!data || data.error) return;

  pc.systemConfigLoaded = true;

  document.getElementById("sysDetectBanner").style.display = "block";
  let bannerMsg = "✅ 已載入系統級硬體偵測結果（來自 ";
  bannerMsg += data.vram_source === "nvidia-smi" ? "nvidia-smi" : "PowerShell";
  bannerMsg += "）";
  if (data.gpu_list && data.gpu_list.length > 1) {
    bannerMsg += ` 偵測到 ${data.gpu_list.length} 個 GPU`;
  }
  if (data.detected_at) {
    bannerMsg += `<span class="json-modified-badge">${esc(data.detected_at)}</span>`;
  }
  document.getElementById("sysDetectBanner").innerHTML = bannerMsg;

  if (data.gpu) {
    pc.gpu = data.gpu;
    document.getElementById("spec_gpu").textContent = data.gpu;
  }

  if (data.vram_gb > 0) {
    const lv = typeof lookupVRAM === "function" ? lookupVRAM(data.gpu || "") : 0;
    let fv = data.vram_gb, lb = " 🔹 系統偵測";
    if (data.vram_source === "nvidia-smi") lb = " 🔹 nvidia-smi";
    else if (data.vram_source === "wmi") lb = " 🔹 WMI";
    if (lv > data.vram_gb && lv <= 128 && data.vram_source !== "nvidia-smi") { fv = lv; lb = " 🔹 系統+型號校驗"; }
    pc.vramGB = fv;
    document.getElementById("spec_vram").textContent = fv + " GB" + lb;
  }

  if (data.gpu && data.gpu_list && data.gpu_list.length > 0) {
    const gpuSelect = document.getElementById("gpuSelect");
    if (gpuSelect) {
      const gpuNameLower = data.gpu.toLowerCase();
      let bestOption = null;
      let bestScore = 0;
      for (const opt of gpuSelect.options) {
        if (!opt.value) continue;
        const optName = opt.value.split("|")[0].toLowerCase();
        let score = 0;
        if (optName === gpuNameLower) score = 100;
        else if (gpuNameLower.includes(optName) || optName.includes(gpuNameLower)) {
          score = Math.max(gpuNameLower.includes(optName) ? optName.length : 0,
                           optName.includes(gpuNameLower) ? gpuNameLower.length : 0);
          if (optName.includes("laptop") && gpuNameLower.includes("laptop")) score += 10;
          if (optName.includes("mobile") && gpuNameLower.includes("mobile")) score += 10;
          if (optName.includes("laptop") !== gpuNameLower.includes("laptop")) score -= 20;
          if (optName.includes("mobile") !== gpuNameLower.includes("mobile")) score -= 20;
        }
        if (score > bestScore) { bestScore = score; bestOption = opt; }
      }
      if (bestOption && bestScore > 0) {
        bestOption.selected = true;
      }
    }
  }

  if (data.cpu) {
    pc.cpu = data.cpu;
    let s = data.cpu;
    if (data.cpu_cores) {
      s += " (" + data.cpu_cores + "核";
      if (data.cpu_logical && data.cpu_logical !== data.cpu_cores) s += "/" + data.cpu_logical + "執行緒";
      s += ")";
    }
    pc.cpuCores = data.cpu_logical || data.cpu_cores || 0;
    document.getElementById("spec_cpu").textContent = s;
  }

  if (data.ram_gb > 0) {
    pc.ramGB = data.ram_gb;
    document.getElementById("spec_ram").textContent = data.ram_gb + " GB";
  }

  if (data.disk_gb > 0) {
    pc.diskGB = data.disk_gb;
    document.getElementById("spec_disk").textContent = data.disk_gb + " GB";
  }

  if (data.os) {
    pc.os = data.os;
    document.getElementById("spec_os").textContent = data.os;
  }

  if (data.sensors) {
    pc.sensors = data.sensors;
    renderSensors(data.sensors);
  }

  document.getElementById("manualGpu").classList.remove("visible");
}

// ========================================================================
// 通用 script 標籤載入（修復 onload 重複綁定 bug）
// ========================================================================
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    let settled = false;
    const done = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      document.head.removeChild(s);
      if (data) resolve(data);
      else reject(new Error("No data"));
    };
    const timer = setTimeout(() => done(null), 5000);
    s.onload = () => {
      const data = window._HARDWARE_CONFIG;
      delete window._HARDWARE_CONFIG;
      done(data);
    };
    s.onerror = () => done(null);
    s.src = src;
    document.head.appendChild(s);
  });
}

async function autoLoadSystemConfig() {
  // 方法1: fetch
  try {
    const resp = await fetch("hardware-config.json?_t=" + Date.now());
    if (resp.ok) {
      const data = await resp.json();
      if (data && (data.source === "wmi" || data.source === "powershell_wmi" || data.source === "nvidia-smi") && !data.error) {
        applySystemConfig(data);
        _showAutoBanner(data);
        return;
      }
    }
  } catch (e) {}

  // 方法2: script 標籤
  try {
    const data = await _loadScript("hardware-config.js?_t=" + Date.now());
    if (data && !data.error && data.vram_gb > 0) {
      applySystemConfig(data);
      _showAutoBanner(data);
    }
  } catch (e) {}
}

function _showAutoBanner(data) {
  let bannerMsg = "✅ 已自動載入系統級硬體偵測結果";
  if (data.vram_source === "nvidia-smi") bannerMsg += "（nvidia-smi）";
  else bannerMsg += "（PowerShell WMI）";
  if (data.gpu_list && data.gpu_list.length > 1) bannerMsg += ` 偵測到 ${data.gpu_list.length} 個 GPU`;
  if (data.detected_at) bannerMsg += `<span class="json-modified-badge">${esc(data.detected_at)}</span>`;
  document.getElementById("sysDetectBanner").innerHTML = bannerMsg;
}

// ========================================================================
// 快速選擇 chips
// ========================================================================
const MODEL_CHIPS = [
  "LTX 2.3", "WAN 2.2", "FLUX.1", "SD 3.5",
  "Stable Diffusion XL", "Qwen 2.5 7B", "Qwen 2.5 32B",
  "DeepSeek R1", "Llama 3 8B", "CogVideoX", "Kolors",
  "IC-Light", "Whisper Large v3", "Phi-4 14B",
  "HeyGem", "SoulX-Singer", "Matanyone", "AI短視頻引擎",
  "Codex+DeepSeek",
  "RunningHub", "Qwen3.6-Plus", "Stable Audio 3", "RVC",
  "DiffRhythm", "FireRed-Image-Edit", "LongCat-Image-Turbo",
  "IMAGDressing", "Anydoor", "One To All-Animation",
  "Flux.2-Klein-9B-EA", "Pony Diffusion X",
  "Qwen-Image-Edit-AIO", "DreamOmni2",
  "AI換臉工具三合一", "FacePoke", "IDM-VTON",
  "Wan2.2_SmoothMixV20", "Audiocraft",
  "Roop Unleashed", "StableAvatar", "F5-TTS",
  "ProPainter", "Bernini-v1", "Omni Voice",
  "Ideogram 4", "FASHN VTON", "ERNIE-Image-Turbo",
  "MatAnyone2", "GLM-Image", "Kandinsky 5",
  "VisoMaster", "Deep-Live-Cam Pro", "FaceFusion 4.5",
  "GPT-SoVITS V4", "Hallo V2", "LTX 2.3 AIO",
  "Wan2.2 AIO Mega1", "SVI 2.0Pro", "Framepack",
  "ACE-Step音樂生成", "PilotTTS", "indexTTS V2",
  "Sora2去浮水印", "照片說話唱歌APP", "OpenCode",
];
const CHIP_COLLAPSE_LIMIT = 24;
let chipsExpanded = false;
let activeCategory = "全部";

const CATEGORIES = {
  "全部":  { icon: "📋", color: "" },
  "video": { icon: "🎬", label: "視頻生成" },
  "image": { icon: "🖼️", label: "圖像生成" },
  "llm":   { icon: "🧠", label: "大語言模型" },
  "audio": { icon: "🎵", label: "音頻/語音" },
  "edit":  { icon: "✂️", label: "圖像編輯/工具" },
};

function buildCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  container.innerHTML = "";
  const usedCats = new Set(["全部"]);
  for (const key of Object.keys(MODELS)) {
    const cat = MODELS[key].cat;
    if (cat && CATEGORIES[cat]) usedCats.add(cat);
  }
  const order = ["全部", "video", "image", "llm", "audio", "edit"];
  for (const c of order) {
    if (!usedCats.has(c)) continue;
    const def = CATEGORIES[c];
    const label = def.label || c;
    const btn = document.createElement("button");
    btn.className = "chip" + (c === "全部" ? " active" : "");
    btn.textContent = `${def.icon || "📋"} ${label}`;
    btn.dataset.cat = c;
    btn.onclick = () => {
      document.querySelectorAll("#categoryFilters .chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = c;
      filterModels();
    };
    container.appendChild(btn);
  }
}

function buildModelDatalist() {
  const datalist = document.getElementById("modelList");
  if (!datalist) return;
  datalist.innerHTML = "";
  const seen = new Set();
  for (const key of Object.keys(MODELS)) {
    if (!seen.has(key)) {
      const opt = document.createElement("option");
      opt.value = key;
      datalist.appendChild(opt);
      seen.add(key);
    }
  }
  for (const name of MODEL_CHIPS) {
    if (!seen.has(name)) {
      const opt = document.createElement("option");
      opt.value = name;
      datalist.appendChild(opt);
      seen.add(name);
    }
  }
}

function buildChips() {
  const c = document.getElementById("modelChips");
  c.innerHTML = "";
  MODEL_CHIPS.forEach((n, i) => {
    const ch = document.createElement("span");
    ch.className = "chip";
    ch.textContent = n;
    ch.dataset.index = i;
    if (i >= CHIP_COLLAPSE_LIMIT) ch.classList.add("chip-hidden");
    ch.onclick = () => { document.getElementById("modelSearch").value = n; analyzeModel(n); };
    c.appendChild(ch);
  });
  updateChipToggleText();
}

function toggleChips() {
  chipsExpanded = !chipsExpanded;
  const q = document.getElementById("modelSearch").value.trim().toLowerCase();
  document.querySelectorAll("#modelChips .chip").forEach(ch => {
    if (q && !ch.textContent.toLowerCase().includes(q)) return;
    const idx = parseInt(ch.dataset.index);
    if (chipsExpanded) {
      ch.classList.remove("chip-hidden");
    } else {
      if (idx >= CHIP_COLLAPSE_LIMIT) ch.classList.add("chip-hidden");
    }
  });
  updateChipToggleText();
}

function updateChipToggleText() {
  const btn = document.getElementById("chipToggleBtn");
  if (!btn) return;
  btn.textContent = chipsExpanded ? "📌 收合全部" : `📌 展開全部 (${MODEL_CHIPS.length}個)`;
}

function filterModels() {
  const q = document.getElementById("modelSearch").value.trim().toLowerCase();
  document.querySelectorAll("#modelChips .chip").forEach(ch => {
    const name = ch.textContent.trim();
    const catMatch = activeCategory === "全部" || (MODELS[name] && MODELS[name].cat === activeCategory);
    const textMatch = !q || name.toLowerCase().includes(q);
    const match = catMatch && textMatch;
    if (!match) {
      ch.classList.add("chip-hidden");
      return;
    }
    const idx = parseInt(ch.dataset.index);
    if (chipsExpanded || idx < CHIP_COLLAPSE_LIMIT || q) {
      ch.classList.remove("chip-hidden");
    } else {
      ch.classList.add("chip-hidden");
    }
  });
}

// ========================================================================
// 核心分析函數
// ========================================================================
function analyzeModel(overrideName) {
  const name = overrideName || document.getElementById("modelSearch").value.trim();
  if (!name) {
    document.getElementById("resultSection").classList.add("visible");
    document.getElementById("resultContent").innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);">⚠️ 請先輸入模型名稱</div>';
    return;
  }

  let key = null;
  if (MODELS[name]) key = name;
  else {
    const lower = name.toLowerCase().replace(/[\s\-_]+/g, "");
    for (const k of Object.keys(MODELS)) {
      if (k.toLowerCase().replace(/[\s\-_]+/g, "") === lower) { key = k; break; }
    }
    if (!key) {
      for (const k of Object.keys(MODELS)) {
        if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) { key = k; break; }
      }
    }
  }

  if (!key) {
    document.getElementById("resultSection").classList.add("visible");
    document.getElementById("resultContent").innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--red);">
        ⚠️ 未找到模型「${esc(name)}」<br>
        <span style="font-size:0.85rem;color:var(--text2);">試試從快速選擇中點擊，或輸入準確的模型名稱</span>
      </div>`;
    return;
  }

  const model = MODELS[key];
  const hasHardware = pc.vramGB > 0 || pc.ramGB > 0;

  let html = `<div class="model-detail"><strong>${key}</strong>
    <span class="badge badge-${model.cat === 'llm' ? 'blue' : model.cat === 'video' ? 'purple' : model.cat === 'image' ? 'green' : model.cat === 'edit' ? 'orange' : model.cat === 'audio' ? 'green' : 'orange'}">${model.type}</span>
    ${model.params && model.params !== "—" ? `<span style="color:var(--text2);">· 參數量 ${model.params}</span>` : ""}
  </div>`;

  if (model.cloud) {
    html += `<div class="verdict pass">🎉 <strong>${key}</strong> 是雲端服務，無需本地 GPU！
      <div style="margin-top:8px;font-size:0.85rem;">${model.note}</div>
    </div>`;
    document.getElementById("resultSection").classList.add("visible");
    document.getElementById("resultContent").innerHTML = html;
    return;
  }

  if (!hasHardware) {
    html += `<div class="verdict warn">⚠️ 尚未檢測硬體。請先點擊「檢測本機硬體」或手動選擇 GPU。</div>`;
    html += `<div style="margin-top:12px;"><button class="btn btn-primary" onclick="detectHardware()">🔍 檢測硬體</button></div>`;
    document.getElementById("resultSection").classList.add("visible");
    document.getElementById("resultContent").innerHTML = html;
    return;
  }

  const items = [];
  let passCount = 0, totalCount = 0;
  function ci(label, cur, min, rec, unit) {
    totalCount++;
    const st = cur === 0 ? "unknown" : cur < min ? "fail" : cur < rec ? "warn" : "ok";
    if (st === "ok") passCount++;
    const icon = st === "ok" ? "✅" : st === "warn" ? "⚠️" : st === "fail" ? "❌" : "❓";
    const tag = st === "ok" ? '<span class="tag tag-ok">滿足</span>'
              : st === "warn" ? '<span class="tag tag-warn">最低可跑</span>'
              : st === "fail" ? '<span class="tag tag-fail">不足</span>'
              : '<span class="tag tag-warn">未檢測</span>';
    items.push({ label, cur: cur > 0 ? cur + unit : "未檢測", need: `${min}-${rec}${unit}`, icon, tag });
  }
  ci("VRAM (顯存)", pc.vramGB, model.vram_min, model.vram_rec, " GB");
  ci("RAM (記憶體)", pc.ramGB, model.ram_min, model.ram_rec, " GB");

  html += `<table class="comparison-table">
    <tr><th>項目</th><th>你的配置</th><th>模型需求</th><th>狀態</th></tr>`;
  items.forEach(it => {
    html += `<tr><td>${it.label}</td><td>${it.cur}</td><td>${it.need}</td><td>${it.icon} ${it.tag}</td></tr>`;
  });
  html += `</table>`;

  html += `<div style="font-size:0.88rem;color:var(--text2);margin:4px 0 12px;">💿 模型檔案占用: <strong>~${model.disk} GB</strong></div>`;

  const ratio = totalCount > 0 ? passCount / totalCount : 0;
  if (ratio >= 1) {
    html += `<div class="verdict pass">🎉 <strong>你的配置完全滿足 ${key} 的推薦需求！</strong>
      <div style="margin-top:6px;font-size:0.85rem;">當前配置可以流暢運行此模型。</div>
    </div>`;
  } else if (ratio >= 0.5) {
    html += `<div class="verdict warn">🌐 <strong>基礎可跑，但可能需要降低設置</strong>
      <div style="margin-top:6px;font-size:0.85rem;">配置基本滿足最低需求。建議降低解析度/使用量化版/啟用 CPU offload。</div>
    </div>`;
  } else {
    html += `<div class="verdict fail">❌ <strong>當前配置不足以運行 ${key}</strong>
      <div style="margin-top:6px;font-size:0.85rem;">顯存或記憶體不足，需要升級硬體或使用雲端服務。</div>
    </div>`;
  }

  // 量化版本分析
  (function() {
    const paramsStr = model.params || "";
    const paramMatch = paramsStr.match(/(\d+(?:\.\d+)?)\s*B/);
    if (paramMatch && pc.vramGB > 0) {
      const paramsB = parseFloat(paramMatch[1]);
      const quants = [
        { name: "FP16 (原始)", bits: 16, bytesPerParam: 2.0 },
        { name: "Q8_0",       bits: 8,  bytesPerParam: 1.0 },
        { name: "Q6_K",       bits: 6,  bytesPerParam: 0.75 },
        { name: "Q5_K_M",     bits: 5,  bytesPerParam: 0.625 },
        { name: "Q4_K_M",     bits: 4,  bytesPerParam: 0.5 },
        { name: "Q3_K_M",     bits: 3,  bytesPerParam: 0.375 },
        { name: "Q2_K",       bits: 2,  bytesPerParam: 0.25 },
      ];
      const overheadRatio = paramsB >= 30 ? 1.25 : paramsB >= 7 ? 1.3 : 1.4;

      let quantHtml = `<div class="quant-section" style="margin-top:16px;padding:14px;background:var(--bg);border-radius:10px;">
        <div style="font-weight:600;margin-bottom:10px;">📉 量化版本分析（約 ${paramsB}B 參數）</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead><tr style="color:var(--text2);border-bottom:1px solid var(--border);">
            <th style="padding:6px 8px;text-align:left;">量化</th>
            <th style="padding:6px 8px;text-align:right;">位元</th>
            <th style="padding:6px 8px;text-align:right;">估 VRAM</th>
            <th style="padding:6px 8px;text-align:center;">你 ${pc.vramGB}GB</th>
          </tr></thead><tbody>`;

      for (const q of quants) {
        const vramEst = Math.ceil(paramsB * q.bytesPerParam * overheadRatio);
        let status = "✅ 順跑";
        if (vramEst <= pc.vramGB) {
          status = pc.vramGB >= vramEst * 1.15 ? "✅ 順跑" : "⚠️ 可跑";
        } else {
          status = vramEst <= pc.vramGB * 1.25 && q.bits <= 6 ? "⚠️ 勉強" : "❌ 不足";
        }
        const note = (q.bits === 4 && paramsB <= 7) ? " 推薦!" : q.bits === 2 ? " 品質較差" : "";
        const color = status.includes("✅") ? "var(--green)" : status.includes("⚠") ? "var(--yellow)" : "var(--red)";

        quantHtml += `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:5px 8px;">${q.name}${note}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text2);">${q.bits}-bit</td>
          <td style="padding:5px 8px;text-align:right;font-weight:600;">~${vramEst} GB</td>
          <td style="padding:5px 8px;text-align:center;color:${color};font-weight:500;">${status}</td>
        </tr>`;
      }

      quantHtml += `</tbody></table>
        <div style="margin-top:8px;font-size:0.75rem;color:var(--text2);line-height:1.4;">
          ⚡ 約估值，含模型權重 + KV cache + 運算暫存。實際用量依實作而異。
          ${model.cat === 'llm' ? 'LLM 建議使用 GGUF/Q4_K_M 格式以獲得最佳性價比。' : ''}
          ${model.cat === 'video' || model.cat === 'image' ? '擴散模型量化支援較有限，請確認框架相容性。' : ''}
        </div>
      </div>`;

      const lastVerdictIdx = html.lastIndexOf('</div>');
      if (lastVerdictIdx > 0) {
        html = html.slice(0, lastVerdictIdx) + quantHtml + html.slice(lastVerdictIdx);
      }
    }
  })();

  html += `<div style="font-size:0.85rem;color:var(--text2);margin:8px 0;line-height:1.5;">💡 ${model.note}</div>`;

  const suggestions = [];
  if (pc.vramGB > 0 && pc.vramGB < model.vram_min) {
    suggestions.push(`<strong>顯存不足</strong>：當前 ${pc.vramGB}GB，最低需求 ${model.vram_min}GB。建議升級到 ${model.vram_rec}GB+ 的顯卡。`);
    if (model.vram_rec >= 24) suggestions.push(`推薦：RTX 4090 24GB、RTX 5090 32GB 或 RX 7900 XTX 24GB。`);
    else if (model.vram_rec >= 16) suggestions.push(`推薦：RTX 4070 Ti Super 16GB、RTX 4080 Super 16GB 或 RX 7800 XT 16GB。`);
    else suggestions.push(`推薦：RTX 4060 Ti 16GB 或 RTX 4070 12GB。`);
  }
  if (pc.ramGB > 0 && pc.ramGB < model.ram_min) {
    suggestions.push(`<strong>記憶體不足</strong>：當前 ${pc.ramGB}GB，建議升級到 ${model.ram_rec}GB+。`);
  }
  if (pc.vramGB > 0 && pc.vramGB >= model.vram_min && pc.vramGB < model.vram_rec) {
    suggestions.push(`<strong>顯存剛好達標</strong>：當前 ${pc.vramGB}GB，已達最低要求。建議使用 Int4/FP8 量化版或升級到 ${model.vram_rec}GB+。`);
  }
  if (model.cat === "llm" && pc.vramGB > 0 && pc.vramGB < model.vram_min + 4) {
    suggestions.push(`💡 嘗試使用 <strong>Int4/GGUF 量化版</strong>，可降低約 60% 顯存占用。`);
  }
  if (model.cat === "video" && pc.vramGB > 0 && pc.vramGB < model.vram_min + 4) {
    suggestions.push(`🎬 影片生成很吃顯存。可嘗試 <strong>降低輸出解析度</strong>（如 512→256）或減少幀數。`);
  }
  if (pc.ramGB > 0 && pc.ramGB < 16) {
    suggestions.push(`💵 <strong>記憶體偏小</strong>：建議至少 16GB，推薦 32GB+。升級記憶體是性價比最高的提升之一。`);
  }
  if (pc.diskGB > 0 && pc.diskGB < model.disk + 10) {
    suggestions.push(`💿 <strong>磁碟空間可能不足</strong>：模型檔案約 ${model.disk}GB，請確保有足夠空間。`);
  }
  if (!suggestions.length) {
    suggestions.push(`🎉 你的配置已經足夠，無需額外升級。可使用量化版進一步提升速度。`);
  }

  html += `<div class="suggestions"><strong>💡 建議：</strong><ul>`;
  suggestions.forEach(s => html += `<li>${s}</li>`);
  html += `</ul></div>`;

  const shopeeNote = model.note || "";
  if (shopeeNote.includes("蝦皮") || shopeeNote.includes("AI夢幻工廠")) {
    const searchUrl = "https://shopee.tw/search?shop=25204842&keyword=" + encodeURIComponent(key);
    html += `<div style="margin-top:14px;text-align:center;">
      <a href="${searchUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:20px;background:var(--surface2);border:1px solid var(--border);color:var(--accent2);text-decoration:none;font-size:0.9rem;transition:all 0.2s;">
        🛒 <strong>✨ AI夢幻工廠</strong> 查看此商品 <span style="font-size:0.72rem;">↗</span>
      </a>
    </div>`;
  }

  document.getElementById("resultSection").classList.add("visible");
  document.getElementById("resultContent").innerHTML = html;
  document.getElementById("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========================================================================
// 伺服器即時偵測 — 透過 FastAPI + LibreHardwareMonitor
// ========================================================================
async function loadBackendConfig() {
  const banner = document.getElementById("sysDetectBanner");
  banner.style.display = "block";
  banner.innerHTML = "⏳ 正在連線至本地伺服器 (localhost:8000)...";

  try {
    const resp = await fetch("/api/hardware");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const result = await resp.json();
    if (result.status !== "success") throw new Error(result.message || "後端回傳錯誤");

    const summary = result.summary;
    const allHw = result.hardware;

    // 填入 pc 對象
    if (summary.cpu && summary.cpu.name) {
      pc.cpu = summary.cpu.name;
      document.getElementById("spec_cpu").textContent = summary.cpu.name;
      if (summary.cpu.load != null) {
        document.getElementById("spec_cpu").textContent += " (" + summary.cpu.load + "%)";
      }
    }

    if (summary.ram && summary.ram.total != null) {
      pc.ramGB = Math.round(summary.ram.total);
      let ramText = summary.ram.total + " GB";
      if (summary.ram.used != null) ramText += " (已用 " + summary.ram.used + " GB)";
      if (summary.ram.load != null) ramText += " [" + summary.ram.load + "%]";
      document.getElementById("spec_ram").textContent = ramText;
    }

    if (summary.gpu && summary.gpu.name) {
      pc.gpu = summary.gpu.name;
      document.getElementById("spec_gpu").textContent = summary.gpu.name;

      // VRAM: 後端傳回 MB，需除以 1024 轉 GB
      if (summary.gpu.vram_total != null) {
        pc.vramGB = Math.round(summary.gpu.vram_total / 1024 * 10) / 10;
        let vramText = pc.vramGB + " GB";
        if (summary.gpu.vram_usage != null) {
          vramText += " (已用 " + (summary.gpu.vram_usage / 1024).toFixed(1) + " GB)";
        }
        vramText += " 🔹 LibreHardwareMonitor";
        document.getElementById("spec_vram").textContent = vramText;
      } else {
        const lv = typeof lookupVRAM === "function" ? lookupVRAM(summary.gpu.name) : 0;
        if (lv > 0) { pc.vramGB = lv; document.getElementById("spec_vram").textContent = lv + " GB 🔹 型號查表"; }
      }

      // 更新手動下拉選單
      const gpuSelect = document.getElementById("gpuSelect");
      if (gpuSelect) {
        for (const opt of gpuSelect.options) {
          if (!opt.value) continue;
          const optName = opt.value.split("|")[0].toLowerCase();
          if (summary.gpu.name.toLowerCase().includes(optName) || optName.includes(summary.gpu.name.toLowerCase())) {
            gpuSelect.value = opt.value;
            break;
          }
        }
      }
    }

    if (summary.storage && summary.storage.length > 0) {
      // 優先過濾出 C 槽，或取第一個
      let drive = summary.storage.find(d => d.name.toUpperCase().includes("C:"));
      if (!drive) drive = summary.storage[0];

      if (drive && drive.total != null) {
        pc.diskGB = Math.round(drive.total);
        let diskText = pc.diskGB + " GB";
        if (drive.used != null) diskText += " (已用 " + Math.round(drive.used) + " GB)";
        if (drive.load != null) diskText += " [" + Math.round(drive.load) + "%]";
        diskText += " 🔹 System.IO.DriveInfo";
        document.getElementById("spec_disk").textContent = diskText;
      }
    }

    pc.systemConfigLoaded = true;

    // 顯示感測器資料
    if (allHw && allHw.length > 0) {
      renderSensors(allHw.map(hw => ({
        type: hw.type,
        hardware: hw.name,
        sensors: hw.sensors.concat(...(hw.sub_hardware || []).map(sub => sub.sensors.map(s => ({...s, name: sub.name + " → " + s.name}))))
      })));
    }

    // 狀態摘要
    let statusMsg = "✅ 已從本地伺服器載入即時硬體感測（LibreHardwareMonitor）";
    const parts = [];
    if (summary.cpu && summary.cpu.temperature != null) parts.push("CPU " + summary.cpu.temperature + "°C");
    if (summary.gpu && summary.gpu.temperature != null) parts.push("GPU " + summary.gpu.temperature + "°C");
    if (summary.cpu && summary.cpu.load != null) parts.push("CPU " + summary.cpu.load + "%");
    if (summary.gpu && summary.gpu.load != null) parts.push("GPU " + summary.gpu.load + "%");
    if (summary.gpu && summary.gpu.power != null) parts.push("GPU " + summary.gpu.power + "W");
    if (parts.length > 0) statusMsg += " | " + parts.join(" | ");
    banner.innerHTML = statusMsg;

  } catch (err) {
    banner.innerHTML = "❌ 無法連線至本地伺服器（localhost:8000）<br>" +
      "<span style='font-size:0.82rem;color:var(--text2);'>" +
      "請先執行：<code style='background:var(--surface);padding:2px 8px;border-radius:4px;'>python main.py</code>" +
      "（需系統管理員權限才能讀取感測器）</span>";
  }
}

// ========================================================================
// 啟動
// ========================================================================
window.addEventListener("DOMContentLoaded", async () => {
  await loadModels();
  buildCategoryFilters();
  buildModelDatalist();
  buildChips();
  setTimeout(detectHardware, 300);
  setTimeout(autoLoadSystemConfig, 600);
  window.addEventListener("scroll", () => {
    document.getElementById("backToTop").classList.toggle("visible", window.scrollY > 400);
  });
});
