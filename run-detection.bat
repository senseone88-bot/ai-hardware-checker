@echo off
chcp 65001 >nul 2>&1

REM ── Auto-elevate to admin (required for LibreHardwareMonitor) ──
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting administrator privileges for sensor access...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title AI Hardware Detector

echo ========================================
echo  AI Model Hardware Checker
echo  System-Level Detection Tool
echo ========================================
echo.

cd /d "%~dp0"

REM -- Check that detect-hardware.ps1 exists --
if not exist "detect-hardware.ps1" (
    echo [FAIL] detect-hardware.ps1 not found.
    pause
    exit /b 1
)

REM -- Download LibreHardwareMonitor sensor library if needed --
if not exist "librehardware\LibreHardwareMonitorLib.dll" (
    echo [INFO] LibreHardwareMonitor not found. Downloading sensor library...
    if not exist "librehardware" mkdir librehardware 2>nul
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.6/LibreHardwareMonitor.zip' -OutFile '%TEMP%\lhm.zip'"
    powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\lhm.zip' -DestinationPath '%CD%\librehardware' -Force"
    del "%TEMP%\lhm.zip" 2>nul
    if exist "librehardware\LibreHardwareMonitorLib.dll" (
        echo [OK] Sensor library ready.
    ) else (
        echo [FAIL] Sensor library download failed.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Running PowerShell hardware detection...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO; $p = Join-Path $PWD 'detect-hardware.ps1'; $b = [System.IO.File]::ReadAllBytes($p); if ($b.Length -ge 3 -and ($b[0] -ne 239 -or $b[1] -ne 187 -or $b[2] -ne 191)) { $c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8); [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($true))) }; & $p"

REM -- Generate models.js for file:// protocol fallback --
if exist "models.json" if not exist "models.js" (
    powershell -NoProfile -Command "$m = [IO.File]::ReadAllText('models.json', [Text.Encoding]::UTF8); [IO.File]::WriteAllText('models.js', 'window._MODELS = ' + $m + ';', (New-Object Text.UTF8Encoding($true)))"
    echo [OK] models.js generated.
)

if exist "hardware-config.json" (
    echo.
    echo [OK] Detection complete!
    if exist "ai-hardware-checker.html" (
        echo [INFO] Opening local webpage...
        start "" "ai-hardware-checker.html"
    ) else (
        echo [INFO] Please open ai-hardware-checker.html in your browser.
    )
) else (
    echo.
    echo [FAIL] Detection failed.
    pause
)
