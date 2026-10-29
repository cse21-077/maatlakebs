# One-time setup for a fresh SkuD bridge VPS (Windows).
# Idempotent — safe to re-run; finished steps are skipped.
#
# Run from the uploaded final folder (e.g. C:\skud\final):
#   powershell -ExecutionPolicy Bypass -File .\setup-new-vps.ps1 -BridgeHost skud.toporapula.dev
#
# What it does: layout folders, checks Python, downloads Caddy, opens firewall
# 80/443, persists SKUD_BRIDGE_HOST, initializes the bridge key.
# What it cannot do (manual, listed at the end): MT5 master terminal prep,
# MetaEditor EA compile, DNS A record, Vercel env vars.

param(
    [string]$BridgeHost = "skud.toporapula.dev",
    [string]$InstallDir = "C:\skud\final"
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) { Write-Host "`n=== $Message ===" -ForegroundColor Cyan }

# --- 1. Place files at C:\skud\final --------------------------------------
Write-Step "Installing bridge files to $InstallDir"
$currentDir = (Get-Location).Path
if ($currentDir.TrimEnd('\') -ieq $InstallDir.TrimEnd('\')) {
    Write-Host "Already running from $InstallDir."
} else {
    New-Item -ItemType Directory -Force $InstallDir | Out-Null
    Copy-Item -Path (Join-Path $currentDir '*') -Destination $InstallDir -Recurse -Force
    Write-Host "Copied files from $currentDir to $InstallDir" -ForegroundColor Green
    Set-Location $InstallDir
}

New-Item -ItemType Directory -Force 'C:\skud\terminals' | Out-Null
New-Item -ItemType Directory -Force 'C:\skud\mt5-master' | Out-Null

# --- 2. Python --------------------------------------------------------------
Write-Step "Checking Python"
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "Python not found. Install Python 3.10+ from https://www.python.org/downloads/windows/" -ForegroundColor Yellow
    Write-Host "(Check 'Add python.exe to PATH' in the installer), then re-run this script."
    exit 1
}
$pythonVersion = & python --version 2>&1
Write-Host "Found $pythonVersion" -ForegroundColor Green

# --- 3. Caddy ---------------------------------------------------------------
Write-Step "Checking Caddy"
$caddy = Join-Path $InstallDir 'caddy.exe'
if (Test-Path $caddy) {
    Write-Host "caddy.exe already present."
} else {
    $caddyZip = Join-Path $env:TEMP 'caddy-windows.zip'
    $caddyUrl = 'https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip'
    Write-Host "Downloading Caddy from $caddyUrl ..."
    try {
        Invoke-RestMethod -Uri $caddyUrl -OutFile $caddyZip
        Expand-Archive -Path $caddyZip -DestinationPath $env:TEMP -Force
        Copy-Item (Join-Path $env:TEMP 'caddy.exe') $caddy -Force
        Remove-Item $caddyZip -Force -ErrorAction SilentlyContinue
        Write-Host "caddy.exe installed." -ForegroundColor Green
    } catch {
        Write-Host "Caddy download failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Download manually from https://caddyserver.com/download and place caddy.exe in $InstallDir"
    }
}

# --- 4. Firewall ------------------------------------------------------------
Write-Step "Firewall rules (80/443 inbound)"
foreach ($rule in @(
    @{ DisplayName = 'SkuD Caddy HTTP'; LocalPort = 80 },
    @{ DisplayName = 'SkuD Caddy HTTPS'; LocalPort = 443 }
)) {
    $existing = Get-NetFirewallRule -DisplayName $rule.DisplayName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Rule '$($rule.DisplayName)' already exists."
    } else {
        New-NetFirewallRule -DisplayName $rule.DisplayName -Direction Inbound -Protocol TCP -LocalPort $rule.LocalPort -Action Allow | Out-Null
        Write-Host "Created rule '$($rule.DisplayName)'." -ForegroundColor Green
    }
}

# --- 5. Hostname env var ----------------------------------------------------
Write-Step "Persisting SKUD_BRIDGE_HOST=$BridgeHost"
[Environment]::SetEnvironmentVariable('SKUD_BRIDGE_HOST', $BridgeHost, 'Machine')
$env:SKUD_BRIDGE_HOST = $BridgeHost
Write-Host "Set for new shells via setx/Machine env. Current shell updated too." -ForegroundColor Green

# --- 6. Bridge key ----------------------------------------------------------
Write-Step "Initializing the bridge key"
& (Join-Path $InstallDir 'start-bridge.ps1') -InitializeKey
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    throw "start-bridge.ps1 -InitializeKey failed."
}

# --- Manual checklist -------------------------------------------------------
Write-Host "`n================ SETUP COMPLETE ================" -ForegroundColor Green
Write-Host @"

Remaining manual steps (see README.md):

1. DNS: point the A record for $BridgeHost at THIS VPS public IP.
2. Master terminal: robocopy MetaTrader 5 into C:\skud\mt5-master, run portable,
   log in to a Deriv demo once to cache the server (README section 1).
3. MetaEditor: open SkuDTurboStudentEA.mq5, set EaToken to the bridge key
   printed above, compile (F7), attach to a chart, save profile as 'SkuD'
   (README section 2). Repeat compile for SkuDTurboMentorEA.mq5.
4. Vercel: set SKUD_BRIDGE_URL=https://$BridgeHost and SKUD_BRIDGE_KEY to the
   key printed above, then redeploy.
5. Start services:  .\start-all.ps1
6. Verify:  Invoke-RestMethod https://$BridgeHost/health
7. Register the mentor and enroll a demo student (README section 6).

NOTE: this is a NEW bridge with a NEW key and an EMPTY database.
- Any previously compiled EAs contain the OLD key — recompile them.
- Mentor tokens from the old VPS are invalid here — re-register mentors.
- Optional: copy data\skud.sqlite3 from the old VPS to keep enrolled
  accounts (MT5 passwords are stored in it — handle with care).
"@ -ForegroundColor Yellow
