# pre_warmer.ps1
# MaatlaKebs - MT5 Terminal Pre-Warmer (EA Slave Architecture)
# ============================================================
# Launches ONLY active/assigned MT5 terminals.
# Copies Slave EA to each terminal.
# DOES NOT launch empty/unassigned slots.
#
# USAGE:
#   .\pre_warmer.ps1
#
# REQUIREMENTS:
#   - PowerShell 5.1+
#   - Supabase service key in $env:SUPABASE_SERVICE_KEY
#   - Slave EA compiled at C:\MT5Terminals\MaatlaKebs_Slave_v2.ex5
#   - Signal/Result folders are the MetaQuotes Common\Files shared directory
#     so MT5's FILE_COMMON flag resolves to the same location as Python.
# ============================================================

param(
    [string]$SupabaseUrl = "https://yrnjemftbqwvbvknlxol.supabase.co",
    [string]$SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g",
    [string]$EaSource = "C:\MT5Terminals\MaatlaKebs_Slave_v2.ex5",
    # MetaQuotes Common\Files — this is where FILE_COMMON resolves in ALL portable terminals
    [string]$CommonFiles = "$env:APPDATA\MetaQuotes\Terminal\Common\Files",
    [string]$SignalFolder = "",   # auto-resolved below if empty
    [string]$ResultFolder = "",   # auto-resolved below if empty
    [int]$LaunchDelaySec = 3
)

# --- Resolve signal/result folders to MetaQuotes Common\Files if not overridden ---
if (-not $SignalFolder) { $SignalFolder = Join-Path $CommonFiles "MaatlaKebs\signals" }
if (-not $ResultFolder) { $ResultFolder = Join-Path $CommonFiles "MaatlaKebs\results" }

Write-Host "Common\Files path: $CommonFiles" -ForegroundColor DarkGray
Write-Host "Signal folder:     $SignalFolder" -ForegroundColor DarkGray
Write-Host "Result folder:     $ResultFolder" -ForegroundColor DarkGray

# --- Validation ------------------------------------------------

# Supabase key now defaults to hardcoded value above

if (-not (Test-Path $EaSource)) {
    Write-Error "Slave EA not found at: $EaSource. Compile it in MetaEditor first (F7)."
    exit 1
}

# --- Create directories ----------------------------------------

New-Item -ItemType Directory -Path $SignalFolder -Force | Out-Null
New-Item -ItemType Directory -Path $ResultFolder -Force | Out-Null
Write-Host "Signal/Result folders ready." -ForegroundColor Green

# --- Fetch active students from Supabase -----------------------

$headers = @{
    "apikey"        = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
}

$url = "$SupabaseUrl/rest/v1/student_accounts?is_active=eq.true&folder_path=not.is.null&select=folder_path,mt5_login,encrypted_password,mt5_server"

try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop
    if ($response.Count -gt 0) {
        $cols = $response[0] | Get-Member -MemberType NoteProperty | ForEach-Object { $_.Name }
        Write-Host "DIAGNOSTIC: Found columns in Supabase: $($cols -join ', ')" -ForegroundColor Gray
    }
} catch {
    Write-Error "Failed to fetch students from Supabase: $_"
    exit 1
}

if (-not $response) {
    Write-Error "No active students with folder_path found in Supabase."
    exit 1
}

# Extract unique folder paths
$folders = $response | ForEach-Object { $_.folder_path } | Select-Object -Unique
Write-Host "Found $($folders.Count) active terminal folder(s)." -ForegroundColor Cyan

# --- Kill existing terminals -----------------------------------

Write-Host "Stopping existing terminal64.exe processes..." -ForegroundColor Yellow
Get-Process -Name "terminal64" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# --- Copy EA and launch each terminal --------------------------

$launched = 0
$failed = 0

foreach ($folder in $folders) {
    $terminalPath = Join-Path $folder "terminal64.exe"
    $expertsPath = Join-Path $folder "MQL5\Experts"
    $slaveEaPath = Join-Path $expertsPath "MaatlaKebs_Slave_v2.ex5"

    if (-not (Test-Path $terminalPath)) {
        Write-Warning "terminal64.exe not found in: $folder - skipping"
        $failed++
        continue
    }

    # Copy Slave EA
    try {
        New-Item -ItemType Directory -Path $expertsPath -Force | Out-Null
        Copy-Item -Path $EaSource -Destination $slaveEaPath -Force -ErrorAction Stop
        Write-Host "  [OK] EA copied to $slaveEaPath" -ForegroundColor DarkGray
    } catch {
        Write-Warning "Failed to copy EA to $folder : $_"
    }

    # Get credentials for this specific folder
    $account = $response | Where-Object { $_.folder_path -eq $folder } | Select-Object -First 1
    $login = $account.mt5_login
    $pass  = $account.encrypted_password
    $srv   = $account.mt5_server

    $hasPass = if ($pass) { "YES (len:$($pass.Length))" } else { "NO (EMPTY)" }
    Write-Host "DIAGNOSTIC: Folder $folder -> Login: $login, Password: $hasPass, Server: $srv" -ForegroundColor Gray

    # Launch terminal with portable mode and auto-login
    try {
        # Using an array for arguments is the most robust way to handle special characters
        $argList = @("/portable", "/login:$login", "/password:$pass", "/server:$srv")
        
        Start-Process -FilePath $terminalPath -ArgumentList $argList -WorkingDirectory $folder -WindowStyle Normal
        Write-Host "  [LAUNCHED] $folder (Login: $login)" -ForegroundColor Green
        $launched++
        
        # Small delay to prevent resource contention during bulk launch
        Start-Sleep -Milliseconds 500
    } catch {
        Write-Error "Failed to launch $folder : $_"
        $failed++
        continue
    }

    # Stagger launches to avoid Windows resource contention
    if ($LaunchDelaySec -gt 0) {
        Start-Sleep -Seconds $LaunchDelaySec
    }
}

# --- Summary ---------------------------------------------------

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PRE-WARMER COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Launched:  $launched terminals" -ForegroundColor Green
Write-Host "  Failed:    $failed terminals" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "  EA copied: $launched terminals" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Wait 30-60 seconds for all terminals to fully load" -ForegroundColor White
Write-Host "  2. Open a chart in EACH terminal (e.g., Volatility 75 Index)" -ForegroundColor White
Write-Host "  3. Attach MaatlaKebs_Slave_v2 EA to each chart" -ForegroundColor White
Write-Host "  4. Verify: Experts tab shows '[MaKebs] Slave EA v2.0 - INITIALIZED'" -ForegroundColor White
Write-Host "  5. Signals path: $SignalFolder" -ForegroundColor White
Write-Host "  6. Start mt5_manager.py" -ForegroundColor White
Write-Host ""
