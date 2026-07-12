# ============================================================
# AI 模型硬體體檢 - 系統級硬體偵測
# 使用 nvidia-smi + LibreHardwareMonitor + WMI 讀取真實硬體規格
# ============================================================
$outputPath = Join-Path $PSScriptRoot "hardware-config.json"

Write-Host "[*] 正在偵測硬體規格..." -ForegroundColor Cyan

try {
    # ---- GPU（取 VRAM 最大的，通常是獨立顯卡）----
    $gpus = Get-WmiObject Win32_VideoController
    $gpu = $gpus | Sort-Object AdapterRAM -Descending | Select-Object -First 1

    $gpuName = $(if ($gpu) { $gpu.Name.Trim() } else { "未知" })

    # ──── VRAM 檢測策略 ────
    # 策略 1: nvidia-smi（NVIDIA 專用，最準確）
    # 策略 2: WMI Win32_VideoController.AdapterRAM（nvidia-smi 失敗時的最後降級）
    $vramGB = 0
    $vramSource = "wmi"
    $gpuList = @()
    $nvidiaSmiWorked = $false

    # ── 策略 1: 檢測 nvidia-smi ──
    try {
        $nvidiaSmi = Get-Command "nvidia-smi" -ErrorAction Stop
        $nvidiasmiOut = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>&1
        if ($nvidiasmiOut -and $nvidiasmiOut.Count -gt 0) {
            $primaryName = $null
            $primaryVram = 0
            $matchedCount = 0
            foreach ($line in $nvidiasmiOut) {
                if ($line -match '(.+),\s*(\d+(?:\.\d+)?)') {
                    $matchedCount++
                    $ngpuName = $Matches[1].Trim()
                    $ngpuVramRaw = [double]$Matches[2]
                    # nvidia-smi 回傳單位是 MiB，轉換為 GB（除以 1024）
                    if ($ngpuVramRaw -gt 1024) {
                        $ngpuVram = [Math]::Round($ngpuVramRaw / 1024, 1)
                    } else {
                        $ngpuVram = $ngpuVramRaw
                    }
                    $gpuList += @{ name = $ngpuName; vram_gb = $ngpuVram; source = "nvidia-smi" }
                    Write-Host "  [GPU] nvidia-smi: $ngpuName - ${ngpuVram}GB" -ForegroundColor Green
                    if ($ngpuVram -gt $primaryVram) {
                        $primaryName = $ngpuName
                        $primaryVram = $ngpuVram
                    }
                }
            }
            if ($matchedCount -gt 0) {
                Write-Host "  [OK] nvidia-smi 輸出驗證通過，使用 NVIDIA 官方數據" -ForegroundColor Cyan
                $nvidiaSmiWorked = $true
                $gpuName = $primaryName
                $vramGB = $primaryVram
                $vramSource = "nvidia-smi"
            } else {
                Write-Host "  [!] nvidia-smi 輸出無效: $($nvidiasmiOut -join '; ')" -ForegroundColor DarkYellow
                Write-Host "     [>>] 跳過 nvidia-smi，改用 WMI" -ForegroundColor DarkYellow
            }
        }
    } catch {
        Write-Host "  [!] nvidia-smi 不可用" -ForegroundColor DarkYellow
    }

    # ── 策略 2: WMI（nvidia-smi 失敗時的最後降級）──
    if ($vramSource -eq "wmi") {
        $vramBytes = $(if ($gpu.AdapterRAM -and $gpu.AdapterRAM -gt 0) { $gpu.AdapterRAM } else { 0 })
        $vramGB = $(if ($vramBytes -gt 0) { [Math]::Round($vramBytes / 1GB, 1) } else { 0 })
        Write-Host "  [>>] VRAM(WMI): ${vramGB}GB [!]（可能不準確）" -ForegroundColor Yellow
    }

    Write-Host "  [GPU] GPU: $gpuName" -ForegroundColor Green
    Write-Host "  [>>] VRAM($vramSource): ${vramGB}GB" -ForegroundColor Green

    # ── 補充 WMI 列表（nvidia-smi 缺的 GPU，模糊比對避免重複）──
    # 正規化函數：去除品牌前綴/後綴差異，讓 "RTX 4090 Laptop GPU" 與 "RTX 4090m" 可比對
    function Normalize-GpuName($n) {
        return ($n.ToLower() -replace 'nvidia\s+geforce\s+','' -replace '\s*laptop\s+gpu\s*',' ' -replace 'with\s+','' -replace '[\(\)]','' -replace '\s+',' ').Trim()
    }
    $seenNames = @{}; $seenNorm = @{}
    foreach ($g in $gpuList) {
        $n = $g.name.ToLower()
        $seenNames[$n] = $true
        $_norm = Normalize-GpuName $n
        $seenNorm[$_norm] = $true
    }
    foreach ($g in $gpus) {
        $name = $g.Name.Trim()
        $nameLower = $name.ToLower()
        $normName = Normalize-GpuName $name
        # 檢查 1: 原始名稱模糊比對
        $isDuplicate = $false
        foreach ($existing in $seenNames.Keys) {
            if ($existing -eq $nameLower -or $existing.Contains($nameLower) -or $nameLower.Contains($existing)) {
                $isDuplicate = $true; break
            }
        }
        # 檢查 2: 正規化名稱比對（捕獲 "RTX 4090 Laptop GPU" vs "RTX 4090m" 這類）
        if (-not $isDuplicate) {
            foreach ($norm in $seenNorm.Keys) {
                if ($norm -eq $normName -or $norm.Contains($normName) -or $normName.Contains($norm)) {
                    $isDuplicate = $true; break
                }
            }
        }
        # 檢查 3: 同型號但 VRAM 差異過大 → WMI 數據不準，跳過
        if (-not $isDuplicate) {
            $modelRx = [regex]'(\d{3,4})'
            $wmiModel = $modelRx.Match($normName).Groups[1].Value
            if ($wmiModel) {
                $wmiVram = $(if ($g.AdapterRAM -gt 0) { [Math]::Round($g.AdapterRAM / 1GB, 1) } else { 0 })
                foreach ($gpu in $gpuList) {
                    $gpuNorm = Normalize-GpuName $gpu.name
                    $gpuModel = $modelRx.Match($gpuNorm).Groups[1].Value
                    if ($gpuModel -eq $wmiModel -and $wmiVram -gt 0 -and $gpu.vram_gb -gt 0) {
                        $ratio = [Math]::Abs($wmiVram - $gpu.vram_gb) / $gpu.vram_gb
                        if ($ratio -gt 0.3) {
                            $isDuplicate = $true
                            Write-Host "     [>>] $name : ${wmiVram}GB (WMI 重複，與 $($gpu.name) VRAM 差異 ${ratio:P0})" -ForegroundColor DarkGray
                            break
                        }
                    }
                }
            }
        }
        if (-not $isDuplicate) {
            $v = $(if ($g.AdapterRAM -gt 0) { [Math]::Round($g.AdapterRAM / 1GB, 1) } else { 0 })
            # 過濾 WMI 幽靈 GPU：VRAM < 4GB 或名稱含內顯關鍵字視為無專用 VRAM
            if ($v -lt 4) {
                Write-Host "     [>>] $name : ${v}GB (WMI 內顯/幽靈卡，跳過)" -ForegroundColor DarkGray
                continue
            }
            $gpuList += @{ name = $name; vram_gb = $v; source = "wmi" }
            Write-Host "     +-- $name : ${v}GB (WMI)" -ForegroundColor DarkGray
        }
    }

    # ---- CPU ----
    $cpu = Get-WmiObject Win32_Processor | Select-Object -First 1
    $cpuName = $(if ($cpu) { $cpu.Name.Trim() } else { "未知" })
    $cpuCores = $(if ($cpu) { $cpu.NumberOfCores } else { 0 })
    $cpuLogical = $(if ($cpu) { $cpu.NumberOfLogicalProcessors } else { 0 })

    Write-Host "  [CPU] CPU: $cpuName" -ForegroundColor Green
    Write-Host "  [CPU] 核心: ${cpuCores} 實體 / ${cpuLogical} 邏輯" -ForegroundColor Green

    # ---- RAM ----
    $cs = Get-WmiObject Win32_ComputerSystem
    $ramBytes = $(if ($cs.TotalPhysicalMemory) { $cs.TotalPhysicalMemory } else { 0 })
    $ramGB = [Math]::Round($ramBytes / 1GB, 1)
    Write-Host "  [RAM] RAM: ${ramGB}GB" -ForegroundColor Green

    # ---- 磁碟 ----
    $disk = Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | Where-Object { $_.DeviceID -eq "C:" } | Select-Object -First 1
    $diskGB = $(if ($disk) { [Math]::Round($disk.Size / 1GB, 0) } else { 0 })
    Write-Host "  [DISK] C槽: ${diskGB}GB" -ForegroundColor Green

    # ---- 作業系統 ----
    $os = Get-WmiObject Win32_OperatingSystem | Select-Object -First 1
    $osName = $(if ($os) { $os.Caption.Trim() } else { "Windows" })
    Write-Host "  [OS]  OS: $osName" -ForegroundColor Green

    # ──── LibreHardwareMonitor 感測器讀取（可選）────
    $sensors = @()
    $libDir = Join-Path $PSScriptRoot "librehardware"
    $libPath = Join-Path $libDir "LibreHardwareMonitorLib.dll"

    if (Test-Path $libPath) {
        Write-Host "  [LHM] 讀取 LibreHardwareMonitor 完整感測器..." -ForegroundColor Cyan
        try {
            if (-not ("LibreHardwareMonitor.Hardware.Computer" -as [type])) {
                Add-Type -Path $libPath
            }
            $computer = New-Object LibreHardwareMonitor.Hardware.Computer
            $computer.IsCpuEnabled = $true
            $computer.IsGpuEnabled = $true
            $computer.Open()

            foreach ($hardware in $computer.Hardware) {
                $hardware.Update()
                $hwSensors = @()
                $isGpu = $hardware.HardwareType.ToString() -match "Gpu"
                foreach ($sensor in $hardware.Sensors) {
                    # LHM 顯存覆寫：nvidia-smi 失敗降級 WMI 時，用精確數值覆寫
                    if ($isGpu -and ($vramSource -eq "wmi") -and ($sensor.Name -eq "GPU Memory Total") -and ($sensor.SensorType.ToString() -eq "SmallData") -and ($sensor.Value -ne $null)) {
                        $lhmVramGb = [Math]::Round([double]$sensor.Value / 1024, 1)
                        if ($lhmVramGb -gt 0) {
                            $vramGB     = $lhmVramGb
                            $vramSource = "librehardware"
                            Write-Host "  [LHM] VRAM: ${vramGB}GB (LibreHardwareMonitor)" -ForegroundColor Green
                        }
                    }
                    if ($sensor.Value -ne $null) {
                        $sMin = $null; if ($sensor.Min -ne $null) { $sMin = [Math]::Round([double]$sensor.Min, 2) }
                        $sMax = $null; if ($sensor.Max -ne $null) { $sMax = [Math]::Round([double]$sensor.Max, 2) }
                        $hwSensors += @{
                            name = $sensor.Name
                            type = $sensor.SensorType.ToString()
                            value = [Math]::Round([double]$sensor.Value, 2)
                            min   = $sMin
                            max   = $sMax
                        }
                    }
                }
                if ($hwSensors.Count -gt 0) {
                    $sensors += @{
                        hardware = $hardware.Name
                        type = $hardware.HardwareType.ToString()
                        sensors = $hwSensors
                    }
                    Write-Host "     +-- $($hardware.Name) ($($hardware.HardwareType)) - $($hwSensors.Count) 個感測器" -ForegroundColor Gray
                }
            }
            $computer.Close()
            Write-Host "  [OK] 感測器數據已讀取" -ForegroundColor Green
        } catch {
            Write-Host "  [!] 感測器讀取失敗: $_" -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "  [>>] LibreHardwareMonitor 未安裝，跳過感測器讀取" -ForegroundColor DarkGray
        Write-Host "     [DL] 執行 run-detection.bat 時會自動下載" -ForegroundColor DarkGray
    }

    # ---- 輸出 JSON ----
    $result = @{
        source = $vramSource
        detected_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        gpu = $gpuName
        vram_gb = $vramGB
        vram_source = $vramSource
        cpu = $cpuName
        cpu_cores = $cpuCores
        cpu_logical = $cpuLogical
        ram_gb = $ramGB
        disk_gb = $diskGB
        os = $osName
        gpu_list = $gpuList
        sensors = $sensors
    }

    $json = $result | ConvertTo-Json -Compress -Depth 5
    Set-Content -Path $outputPath -Value $json -Encoding UTF8

    # ---- 同時輸出 JS 格式（供 file:// 瀏覽器讀取）----
    $jsOutputPath = Join-Path $PSScriptRoot "hardware-config.js"
    $jsContent = "// Auto-generated by detect-hardware.ps1`nwindow._HARDWARE_CONFIG = $json;"
    Set-Content -Path $jsOutputPath -Value $jsContent -Encoding UTF8

    Write-Host ""
    Write-Host "[OK] 硬體資訊已寫入: $outputPath" -ForegroundColor Green
    Write-Host "   VRAM 數據來源: $vramSource" -ForegroundColor Cyan

    return $json

} catch {
    Write-Host "❌ 錯誤: $_" -ForegroundColor Red
    $result = @{
        source = "powershell_wmi"; error = $_.ToString();
        gpu = ""; vram_gb = 0; vram_source = "error";
        cpu = ""; cpu_cores = 0; cpu_logical = 0;
        ram_gb = 0; disk_gb = 0; os = ""
    }
    Set-Content -Path $outputPath -Value ($result | ConvertTo-Json -Compress) -Encoding UTF8
}
