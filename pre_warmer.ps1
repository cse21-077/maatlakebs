# pre_warmer.ps1
# MaatlaKebs - MT5 Terminal Pre-Warmer v2.0 (EA Slave Architecture)
# ============================================================
# Launches ONLY active/assigned MT5 terminals that are NOT already running.
# Copies Slave EA to each terminal.
# DOES NOT launch empty/unassigned slots.
#
# USAGE:
#   .\pre_warmer.ps1                    # Normal: only start missing terminals
#   .\pre_warmer.ps1 -ForceRestart      # Kill ALL and restart (old behaviour)
#   .\pre_warmer.ps1 -CheckOnly         # Just report status, don't start anything
# ============================================================

param(
    [string]$SupabaseUrl = "https://yrnjemftbqwvbvknlxol.supabase.co",
    [string]$SupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g",
    [string]$EaSource = "C:\MT5Terminals\MaatlaKebs_Slave_v2.ex5",
    [string]$CommonFiles = "$env:APPDATA\MetaQuotes\Terminal\Common\Files",
    [string]$SignalFolder = "",
    [string]$ResultFolder = "",
    [int]$LaunchDelaySec = 5,
    [switch]$ForceRestart,
    [switch]$CheckOnly
)

# --- Resolve signal/result folders ---
if (-not $SignalFolder) { $SignalFolder = Join-Path $CommonFiles "MaatlaKebs\signals" }
if (-not $ResultFolder) { $ResultFolder = Join-Path $CommonFiles "MaatlaKebs\results" }

Write-Host "Common\Files path: $CommonFiles" -ForegroundColor DarkGray
Write-Host "Signal folder:     $SignalFolder" -ForegroundColor DarkGray
Write-Host "Result folder:     $ResultFolder" -ForegroundColor DarkGray
if ($ForceRestart) { Write-Host "MODE: ForceRestart (will kill ALL terminals first)" -ForegroundColor Magenta }
if ($CheckOnly)    { Write-Host "MODE: CheckOnly (report only, no launches)" -ForegroundColor Magenta }

# --- Validation ---
if (-not (Test-Path $EaSource)) {
    Write-Error "Slave EA not found at: $EaSource. Compile it in MetaEditor first (F7)."
    exit 1
}

# --- Create directories ---
New-Item -ItemType Directory -Path $SignalFolder -Force | Out-Null
New-Item -ItemType Directory -Path $ResultFolder -Force | Out-Null
Write-Host "Signal/Result folders ready." -ForegroundColor Green

# --- Fetch active students from Supabase ---
$headers = @{
    "apikey"        = $SupabaseKey
    "Authorization" = "Bearer $SupabaseKey"
}

$url = "$SupabaseUrl/rest/v1/student_accounts?is_active=eq.true&folder_path=not.is.null&select=folder_path,mt5_login,encrypted_password,mt5_server"

try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop
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
Write-Host "Found $($folders.Count) active terminal folder(s) in Supabase." -ForegroundColor Cyan

# --- Get currently running terminals by executable path ---
$runningPaths = @()
try {
    $procs = Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
    if ($procs) {
        $runningPaths = $procs | ForEach-Object {
            if ($_.Path) { $_.Path.Replace("/", "\") }
        } | Where-Object { $_ } | Select-Object -Unique
    }
} catch {
    Write-Warning "Could not query running terminals: $_"
}

Write-Host "Currently running terminals: $($runningPaths.Count)" -ForegroundColor Cyan

# Helper to check if a folder's terminal is running (case-insensitive)
function IsTerminalRunning($folderPath) {
    $folderNormalized = ($folderPath.Replace("/", "\") + "\")[0..($folderPath.Length)] -join ''
    $folderNormalized = $folderPath.Replace("/", "\")
    if ($folderNormalized.EndsWith("\")) { $folderNormalized = $folderNormalized.Substring(0, $folderNormalized.Length - 1) }
    $folderNormalized = $folderNormalized.ToLower()

    foreach ($rp in $runningPaths) {
        $rpLower = $rp.ToLower()
        $pattern = $folderNormalized + "\*"
        $exact   = $folderNormalized + "\terminal64.exe"
        if ($rpLower -like $pattern -or $rpLower -eq $exact) {
            return $true
        }
    }
    return $false
}

# Build a list of what's running vs. what's missing BEFORE doing anything
$terminalReport = @()
foreach ($folder in $folders) {
    $terminalPath = Join-Path $folder "terminal64.exe"
    $account = $response | Where-Object { $_.folder_path -eq $folder } | Select-Object -First 1
    $login = ([string]$account.mt5_login).Trim()
    $isRunning = IsTerminalRunning $folder
    $exists = Test-Path $terminalPath

    $terminalReport += [PSCustomObject]@{
        Folder    = $folder
        Login     = $login
        IsRunning = $isRunning
        Exists    = $exists
    }
}

$missing = $terminalReport | Where-Object { -not $_.IsRunning -and $_.Exists }
$running = $terminalReport | Where-Object { $_.IsRunning }
$broken  = $terminalReport | Where-Object { -not $_.Exists }

Write-Host ""
Write-Host "=== TERMINAL STATUS REPORT ===" -ForegroundColor Cyan
Write-Host "Active students in Supabase: $($terminalReport.Count)" -ForegroundColor White
Write-Host "Already running:             $($running.Count)" -ForegroundColor Green
Write-Host "Missing / stopped:           $($missing.Count)" -ForegroundColor $(if ($missing.Count -gt 0) { "Yellow" } else { "Green" })
if ($broken.Count -gt 0) {
    Write-Host "Missing terminal.exe:        $($broken.Count)" -ForegroundColor Red
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "MISSING terminals (will be launched):" -ForegroundColor Yellow
    foreach ($m in $missing) {
        Write-Host "  - $($m.Folder) (Login: $($m.Login))" -ForegroundColor Yellow
    }
}
if ($broken.Count -gt 0) {
    Write-Host ""
    Write-Host "BROKEN folders (no terminal64.exe found):" -ForegroundColor Red
    foreach ($b in $broken) {
        Write-Host "  - $($b.Folder) (Login: $($b.Login))" -ForegroundColor Red
    }
}
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# --- CheckOnly mode: stop here ---
if ($CheckOnly) {
    Write-Host "CheckOnly mode - no terminals were started." -ForegroundColor Magenta
    exit 0
}

# --- ForceRestart mode: kill everything first ---
if ($ForceRestart) {
    Write-Host "ForceRestart: Stopping ALL terminal64.exe processes..." -ForegroundColor Magenta
    $terminals = Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
    if ($terminals) {
        $terminals | Stop-Process -Force -ErrorAction SilentlyContinue
        $terminals | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
    # Re-check after killing
    $runningPaths = @()
    foreach ($t in $terminalReport) { $t.IsRunning = $false }
    $missing = $terminalReport | Where-Object { $_.Exists }
    $running = @()
}

# --- Process each terminal ---
$launched = 0
$failed   = 0
$alreadyRunning = 0

foreach ($t in $terminalReport) {
    $folder       = $t.Folder
    $terminalPath = Join-Path $folder "terminal64.exe"
    $expertsPath  = Join-Path $folder "MQL5\Experts"
    $slaveEaPath  = Join-Path $expertsPath "MaatlaKebs_Slave_v2.ex5"
    $isRunning    = $t.IsRunning
    $login        = $t.Login

    if (-not $t.Exists) {
        Write-Warning "terminal64.exe not found in: $folder - skipping"
        $failed++
        continue
    }

    # Skip EA copy for already-running terminals (avoids access denied)
    if (-not $isRunning) {
        try {
            New-Item -ItemType Directory -Path $expertsPath -Force | Out-Null
            Copy-Item -Path $EaSource -Destination $slaveEaPath -Force -ErrorAction Stop
        } catch {
            Write-Warning "Failed to copy EA to $folder : $_"
        }
    }

    if ($isRunning -and -not $ForceRestart) {
        Write-Host "  [RUNNING] $folder (Login: $login) - skipping launch" -ForegroundColor DarkGray
        $alreadyRunning++
        continue
    }

    # Get credentials for this folder
    $account = $response | Where-Object { $_.folder_path -eq $folder } | Select-Object -First 1
    $pass  = ([string]$account.encrypted_password).Trim()
    $srv   = ([string]$account.mt5_server).Trim()

    # Ensure chart profile directory exists (MT5 creates proper chr files on first chart open)
    $chrDir = Join-Path $folder "MQL5\Profiles\Charts\Default"
    New-Item -ItemType Directory -Path $chrDir -Force | Out-Null

    # Launch terminal with portable mode and auto-login via config file
    try {
        $iniPath = Join-Path $folder "startup.ini"
        $iniContent = "[Common]`r`nLogin=$login`r`nPassword=$pass`r`nServer=$srv`r`n"
        Set-Content -Path $iniPath -Value $iniContent -Encoding Ascii -Force

        $argList = @("/portable", "/config:$iniPath")

        Start-Process -FilePath $terminalPath -ArgumentList $argList -WorkingDirectory $folder -WindowStyle Normal
        Write-Host "  [LAUNCHED] $folder (Login: $login)" -ForegroundColor Green
        $launched++
    } catch {
        Write-Error "Failed to launch $folder : $_"
        $failed++
        continue
    }

    if ($LaunchDelaySec -gt 0) {
        Start-Sleep -Seconds $LaunchDelaySec
    }
}

# --- Final verification (accounts for LiveUpdate restarts) ---
if ($launched -gt 0 -and -not $CheckOnly) {
    # Wait: all terminals must finish launching + 90s buffer for LiveUpdate
    $totalLaunchTime = $launched * $LaunchDelaySec
    $verifyWait = $totalLaunchTime + 90
    Write-Host ""
    Write-Host "Waiting $verifyWait seconds ($totalLaunchTime s launches + 90s LiveUpdate buffer)..." -ForegroundColor DarkGray
    Start-Sleep -Seconds $verifyWait

    $finalRunning = @()
    try {
        $finalProcs = Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
        if ($finalProcs) {
            $finalRunning = $finalProcs | ForEach-Object {
                if ($_.Path) { $_.Path.Replace("/", "\") }
            } | Where-Object { $_ } | Select-Object -Unique
        }
    } catch { }

    $actuallyRunning = 0
    $stillMissing = @()
    foreach ($t in $terminalReport) {
        if (-not $t.Exists) { continue }
        $folderNormalized = $t.Folder.Replace("/", "\")
        if ($folderNormalized.EndsWith("\")) { $folderNormalized = $folderNormalized.Substring(0, $folderNormalized.Length - 1) }
        $folderNormalized = $folderNormalized.ToLower()
        $isUp = $false
        foreach ($rp in $finalRunning) {
            if ($rp.ToLower() -like "$folderNormalized\*") { $isUp = $true; break }
        }
        if ($isUp) { $actuallyRunning++ } else { $stillMissing += $t }
    }

    Write-Host ""
    Write-Host "=== POST-LAUNCH VERIFICATION ===" -ForegroundColor Cyan
    Write-Host "Terminals actually running: $actuallyRunning / $($terminalReport.Count)" -ForegroundColor Green
    if ($stillMissing.Count -gt 0) {
        Write-Host "Still missing after LiveUpdate:" -ForegroundColor Red
        foreach ($m in $stillMissing) {
            Write-Host "  - $($m.Folder) (Login: $($m.Login))" -ForegroundColor Red
        }
    }
    Write-Host "================================" -ForegroundColor Cyan
}

# --- Summary ---
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PRE-WARMER COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Already running: $alreadyRunning" -ForegroundColor Green
Write-Host "  Launched:        $launched" -ForegroundColor Green
Write-Host "  Failed:          $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
if ($launched -gt 0) {
    Write-Host "NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Open a chart in EACH new terminal" -ForegroundColor White
    Write-Host "  2. Attach MaatlaKebs_Slave_v2 EA to each chart" -ForegroundColor White
    Write-Host "  3. Verify: Experts tab shows INITIALIZED" -ForegroundColor White
    Write-Host "  4. Start mt5_manager.py" -ForegroundColor White
}
