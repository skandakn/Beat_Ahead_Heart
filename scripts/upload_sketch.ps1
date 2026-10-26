# BeatAhead - Auto Upload Arduino Sketch (No IDE Required)
# Run this in PowerShell as Administrator:
#   cd c:\ischemic
#   .\scripts\upload_sketch.ps1

param(
    [string]$Port = "COM7",
    [string]$Board = "arduino:avr:uno"
)

$ErrorActionPreference = "Stop"
$SketchPath = "$PSScriptRoot\..\hardware\arduino_ad8232_beatahead"
$ArduinoCli = "$env:USERPROFILE\bin\arduino-cli.exe"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  BeatAhead - Arduino Sketch Auto-Uploader" -ForegroundColor Cyan
Write-Host "  No Arduino IDE required!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target port : $Port"
Write-Host "Board       : $Board"
Write-Host "Sketch      : $SketchPath"
Write-Host ""

# ── Step 1: Install arduino-cli if not present ──────────────────────────────
if (-not (Test-Path $ArduinoCli)) {
    Write-Host "[1/4] Downloading arduino-cli..." -ForegroundColor Yellow
    $null = New-Item -ItemType Directory -Force "$env:USERPROFILE\bin"
    $zipUrl = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
    $zipPath = "$env:TEMP\arduino-cli.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:USERPROFILE\bin" -Force
    Remove-Item $zipPath
    Write-Host "    [+] arduino-cli installed at $ArduinoCli" -ForegroundColor Green
} else {
    Write-Host "[1/4] arduino-cli already installed." -ForegroundColor Green
}

# ── Step 2: Install AVR board core ──────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Installing Arduino AVR board core (first time takes ~1 min)..." -ForegroundColor Yellow
& $ArduinoCli core update-index 2>&1 | Out-Null
& $ArduinoCli core install arduino:avr 2>&1 | ForEach-Object { Write-Host "    $_" }
Write-Host "    [+] AVR core ready." -ForegroundColor Green

# ── Step 3: Compile sketch ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Compiling sketch..." -ForegroundColor Yellow
$compileOutput = & $ArduinoCli compile --fqbn $Board $SketchPath 2>&1
$compileOutput | ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[!] Compilation FAILED. Check sketch file." -ForegroundColor Red
    exit 1
}
Write-Host "    [+] Compiled successfully!" -ForegroundColor Green

# ── Step 4: Upload to Arduino ────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Uploading to Arduino on $Port..." -ForegroundColor Yellow
$uploadOutput = & $ArduinoCli upload --fqbn $Board --port $Port $SketchPath 2>&1
$uploadOutput | ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[!] Upload FAILED." -ForegroundColor Red
    Write-Host "    Make sure nothing else is using $Port (close browser connection first)" -ForegroundColor Red
    Write-Host "    If port is wrong, run: .\scripts\upload_sketch.ps1 -Port COM??" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Sketch uploaded to Arduino on $Port" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run diagnostic:  python scripts/serial_debug.py --port $Port"
Write-Host "  2. Open Chrome:     https://beataheadheart-l4x4.vercel.app/monitor"
Write-Host "  3. Click 'Connect Arduino USB' and select $Port"
Write-Host "  4. Put electrode pads on chest and watch live ECG!"
Write-Host ""
