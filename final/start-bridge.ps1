param([switch]$RefreshTerminals, [switch]$InitializeKey)

$ErrorActionPreference = 'Stop'
try {
Set-Location $PSScriptRoot

$secretsDirectory = Join-Path $env:ProgramData 'SkuD'
New-Item -ItemType Directory -Force -Path $secretsDirectory | Out-Null

function Get-OrCreateProtectedToken([string]$Name) {
    $path = Join-Path $secretsDirectory "$Name.dpapi"
    $legacyPath = Join-Path (Join-Path $PSScriptRoot 'secrets') "$Name.dpapi"
    if (Test-Path $path) {
        try {
            $protectedValue = (Get-Content -Raw -Path $path).Trim()
            $secure = ConvertTo-SecureString -String $protectedValue
        } catch {
            throw "Saved $Name at $path cannot be decrypted for Windows user $env:USERNAME. Start the bridge under the same Windows account that first created it; the key was not changed. Details: $($_.Exception.Message)"
        }
    } elseif (Test-Path $legacyPath) {
        try {
            $protectedValue = (Get-Content -Raw -Path $legacyPath).Trim()
            $secure = ConvertTo-SecureString -String $protectedValue
            $secure | ConvertFrom-SecureString | Set-Content -Encoding ASCII -Path $path
            Write-Host "Migrated the saved $Name to $path. Future app-folder updates will keep using this key." -ForegroundColor Green
        } catch {
            $backupPath = "$legacyPath.invalid.$(Get-Date -Format 'yyyyMMddHHmmss').bak"
            Move-Item -LiteralPath $legacyPath -Destination $backupPath
            Write-Warning "The old $Name file could not be decrypted. It was backed up to $backupPath; a new persistent key will be created once. Update the Vercel server key and SkuD EA chart input to match it."
        }
    }

    if (-not $secure) {
        $plain = ([guid]::NewGuid().ToString('N')) + ([guid]::NewGuid().ToString('N'))
        $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force
        $secure | ConvertFrom-SecureString | Set-Content -Encoding ASCII -Path $path
    }

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

# Initialize the key before MT5 setup so it can be entered into the Student EA.
$bridgeKey = Get-OrCreateProtectedToken 'bridge-key'
if ($InitializeKey) {
    Write-Host ''
    Write-Host 'Persistent SkuD bridge key (copy to Vercel as server-only SKUD_BRIDGE_KEY and into the Student EA EaToken input):' -ForegroundColor Yellow
    Write-Host $bridgeKey
    Write-Host ''
    Write-Host "Key saved for Windows user $env:USERNAME at $secretsDirectory\bridge-key.dpapi. Keep using this same Windows account."
    return
}

$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
$pythonArguments = @()
if (-not $pythonCommand) {
    $pythonCommand = Get-Command py.exe -ErrorAction SilentlyContinue
    $pythonArguments = @('-3')
}
if (-not $pythonCommand) {
    throw 'Python 3.10 or newer was not found. Install Python with PATH enabled, or install the Windows py launcher.'
}
$pythonVersionText = & $pythonCommand.Source @pythonArguments --version 2>&1 | Out-String
if ($pythonVersionText -notmatch 'Python\s+(\d+)\.(\d+)') {
    throw "Could not identify the Python version from: $($pythonVersionText.Trim())"
}
$pythonMajor = [int]$Matches[1]
$pythonMinor = [int]$Matches[2]
if ($pythonMajor -lt 3 -or ($pythonMajor -eq 3 -and $pythonMinor -lt 10)) {
    throw "Python 3.10 or newer is required; detected $($pythonVersionText.Trim())."
}
Write-Host "Using $($pythonVersionText.Trim()) via $($pythonCommand.Name)." -ForegroundColor Green

# --- SkuD terminal infrastructure (seed once on the VPS, see README) ---
# Defaults match the runbook: master terminal at C:\skud\mt5-master.
# Override any of them with environment variables before running this script.
$terminalsDir    = if ($env:SKUD_TERMINALS_DIR)    { $env:SKUD_TERMINALS_DIR }    else { 'C:\skud\terminals' }
$terminalMaster  = if ($env:SKUD_TERMINAL_MASTER)  { $env:SKUD_TERMINAL_MASTER }  else { 'C:\skud\mt5-master' }
$eaSource        = if ($env:SKUD_EA_SOURCE)        { $env:SKUD_EA_SOURCE }        else { 'C:\skud\mt5-master\MQL5\Experts\SkuDTurboStudentEA.ex5' }
$chartTemplate   = if ($env:SKUD_CHART_TEMPLATE)   { $env:SKUD_CHART_TEMPLATE }   else { 'C:\skud\mt5-master\MQL5\Profiles\Charts\SkuD\chart01.chr' }

New-Item -ItemType Directory -Force -Path $terminalsDir | Out-Null
if (-not (Test-Path (Join-Path $terminalMaster 'terminal64.exe'))) {
    throw "Master terminal not found at $terminalMaster. Copy MT5 there, launch it once with /portable, then rerun after compiling the Student EA and saving its SkuD chart. The persistent bridge key is already initialized."
}
if (-not (Test-Path $eaSource)) {
    throw "Compiled Student EA not found at $eaSource. Copy SkuDTurboStudentEA.mq5 and SkuDTurboStudentCore.mqh into the master terminal's MQL5\Experts, compile SkuDTurboStudentEA.mq5 with F7, attach it, and save the SkuD chart. The persistent bridge key is already initialized."
}
if (-not (Test-Path $chartTemplate)) {
    throw "Student chart template not found at $chartTemplate. Attach SkuDTurboStudentEA to a master chart and save the profile as SkuD before starting student terminals. The persistent bridge key is already initialized."
}

$env:SKUD_TERMINALS_DIR   = $terminalsDir
$env:SKUD_TERMINAL_MASTER = $terminalMaster
$env:SKUD_EA_SOURCE       = $eaSource
$env:SKUD_CHART_TEMPLATE  = $chartTemplate

# One shared key protects the bridge and EA. It is created once, DPAPI-protected
# for this Windows user, and stored outside the app folder for reuse after updates.
$env:SKUD_BRIDGE_KEY = $bridgeKey
$env:SKUD_EA_TOKEN = $bridgeKey
$env:SKUD_ALLOWED_ORIGIN = 'https://skudturbo.vercel.app'
$env:SKUD_HOST = '127.0.0.1'
$env:SKUD_PORT = '8765'
$env:SKUD_DB_PATH = Join-Path $PSScriptRoot 'data\skud.sqlite3'
New-Item -ItemType Directory -Force -Path (Split-Path $env:SKUD_DB_PATH) | Out-Null

Write-Host ''
Write-Host 'SkuD MT5 bridge is starting.' -ForegroundColor Green
Write-Host "Persistent SkuD bridge key loaded for Windows user $env:USERNAME."
Write-Host ''
Write-Host 'Re-launching terminals for active accounts that are not running...' -ForegroundColor DarkGray
if ($RefreshTerminals) {
    Write-Warning 'Refresh requested: all terminal64.exe processes under the managed SkuD slots directory will be closed, refreshed from the master EA/chart files, and restarted. Positions already held by the broker remain open, but monitoring is interrupted briefly.'
}
$refreshValue = if ($RefreshTerminals) { 'True' } else { 'False' }
& $pythonCommand.Source @pythonArguments -c "import bridge; bridge.reconcile_on_boot(force_refresh=$refreshValue)"
if ($LASTEXITCODE -ne 0) {
    throw "Terminal reconciliation failed with exit code $LASTEXITCODE. Check the Python installation and bridge files."
}
Write-Host ''
Write-Host 'Bridge is loopback-only at http://127.0.0.1:8765; Caddy serves it over HTTPS. Do not expose port 8765.'
Write-Host 'Keep this window open.'
Write-Host ''

& $pythonCommand.Source @pythonArguments .\bridge.py
if ($LASTEXITCODE -ne 0) {
    throw "Bridge exited with code $LASTEXITCODE."
}
} catch {
    Write-Host ''
    Write-Host 'Bridge startup failed:' -ForegroundColor Red
    Write-Host ($_ | Out-String) -ForegroundColor Red
    Read-Host 'Press Enter to close this window'
    exit 1
}
