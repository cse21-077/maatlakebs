param(
    [string]$FinalDirectory = $PSScriptRoot,
    [string]$MasterDirectory = $(if ($env:SKUD_TERMINAL_MASTER) { $env:SKUD_TERMINAL_MASTER } else { 'C:\skud\mt5-master' }),
    [string]$TerminalsDirectory = $(if ($env:SKUD_TERMINALS_DIR) { $env:SKUD_TERMINALS_DIR } else { 'C:\skud\terminals' }),
    [switch]$NoPause
)

$ErrorActionPreference = 'Continue'
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
    param(
        [ValidateSet('PASS', 'WARN', 'FAIL')][string]$Status,
        [string]$Area,
        [string]$Detail
    )

    $script:checks.Add([PSCustomObject]@{
        Status = $Status
        Area = $Area
        Detail = $Detail
    })
}

function Test-RequiredFile {
    param([string]$Path, [string]$Area)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Add-Check 'PASS' $Area $Path
    } else {
        Add-Check 'FAIL' $Area "Missing: $Path"
    }
}

Write-Host ''
Write-Host 'SkuD MT5 VPS read-only audit' -ForegroundColor Cyan
Write-Host "Final directory: $FinalDirectory"
Write-Host "MT5 master:     $MasterDirectory"
Write-Host "Terminal slots: $TerminalsDirectory"
Write-Host 'No files, settings, or MT5 processes will be changed.'
Write-Host ''

if (Test-Path -LiteralPath $FinalDirectory -PathType Container) {
    Add-Check 'PASS' 'Upload folder' "Found $FinalDirectory"
} else {
    Add-Check 'FAIL' 'Upload folder' "Folder not found: $FinalDirectory"
}

$requiredBridgeFiles = @(
    'bridge.py',
    'terminal_manager.py',
    'start-all.ps1',
    'start-bridge.ps1',
    'start-caddy.ps1',
    'Caddyfile',
    'SkuDTurboStudentCore.mqh',
    'SkuDTurboMentorEA.mq5',
    'SkuDTurboStudentEA.mq5',
    'test_bridge.py'
)
foreach ($name in $requiredBridgeFiles) {
    Test-RequiredFile (Join-Path $FinalDirectory $name) 'Bridge bundle'
}

$python = Get-Command python.exe -ErrorAction SilentlyContinue
$pythonArguments = @()
if (-not $python) {
    $python = Get-Command py.exe -ErrorAction SilentlyContinue
    $pythonArguments = @('-3')
}
if ($python) {
    $pythonVersion = & $python.Source @pythonArguments --version 2>&1 | Out-String
    if ($pythonVersion -match 'Python\s+(\d+)\.(\d+)') {
        $pythonMajor = [int]$Matches[1]
        $pythonMinor = [int]$Matches[2]
        if ($pythonMajor -gt 3 -or ($pythonMajor -eq 3 -and $pythonMinor -ge 10)) {
            Add-Check 'PASS' 'Python' "$($pythonVersion.Trim()) via $($python.Name)"
        } else {
            Add-Check 'FAIL' 'Python' "$($pythonVersion.Trim()) is too old. Python 3.10 or newer is required."
        }
    } else {
        Add-Check 'FAIL' 'Python' "Could not identify version: $($pythonVersion.Trim())"
    }
} else {
    Add-Check 'FAIL' 'Python' 'Neither python.exe nor the Windows py.exe launcher was found. Python 3.10 or newer is required.'
}

$caddyCandidates = @(
    (Join-Path $FinalDirectory 'caddy.exe'),
    'C:\Caddy\caddy.exe'
)
$caddyCommand = Get-Command caddy.exe -ErrorAction SilentlyContinue
$caddyPath = $caddyCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $caddyPath -and $caddyCommand) { $caddyPath = $caddyCommand.Source }
if ($caddyPath) {
    Add-Check 'PASS' 'Caddy executable' $caddyPath
} else {
    Add-Check 'FAIL' 'Caddy executable' 'caddy.exe not found beside the scripts, at C:\Caddy\caddy.exe, or on PATH.'
}

$caddyFile = Join-Path $FinalDirectory 'Caddyfile'
if (Test-Path -LiteralPath $caddyFile -PathType Leaf) {
    $caddyText = Get-Content -LiteralPath $caddyFile -Raw
    if ($caddyText -match '(?m)^\s*skud\.toporapula\.dev\s*\{') {
        Add-Check 'PASS' 'Caddy hostname' 'Caddyfile contains skud.toporapula.dev.'
    } else {
        Add-Check 'FAIL' 'Caddy hostname' 'Caddyfile does not contain the expected skud.toporapula.dev site block.'
    }
    if ($caddyText -match 'reverse_proxy\s+127\.0\.0\.1:8765') {
        Add-Check 'PASS' 'Caddy upstream' 'Proxies to the loopback-only bridge on port 8765.'
    } else {
        Add-Check 'FAIL' 'Caddy upstream' 'Expected reverse_proxy 127.0.0.1:8765.'
    }
}

$masterExe = Join-Path $MasterDirectory 'terminal64.exe'
$masterEa = Join-Path $MasterDirectory 'MQL5\Experts\SkuDTurboStudentEA.ex5'
$masterChart = Join-Path $MasterDirectory 'MQL5\Profiles\Charts\SkuD\chart01.chr'
Test-RequiredFile $masterExe 'MT5 master terminal'
Test-RequiredFile $masterEa 'Compiled student EA'
Test-RequiredFile $masterChart 'Saved master chart template'

if (Test-Path -LiteralPath $TerminalsDirectory -PathType Container) {
    $slotDirectories = @(Get-ChildItem -LiteralPath $TerminalsDirectory -Directory -ErrorAction SilentlyContinue)
    $portableSlots = @($slotDirectories | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'terminal64.exe') })
    Add-Check 'PASS' 'Student terminal slots' "Found terminal directory; $($portableSlots.Count) existing portable slot(s)."
} else {
    Add-Check 'WARN' 'Student terminal slots' "Not created yet: $TerminalsDirectory. The bridge creates this directory when it starts."
}

$metaEditor = @(
    'C:\Program Files\MetaTrader 5\MetaEditor64.exe',
    'C:\Program Files (x86)\MetaTrader 5\MetaEditor64.exe',
    (Join-Path $MasterDirectory 'MetaEditor64.exe')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if ($metaEditor) {
    Add-Check 'PASS' 'MetaEditor' $metaEditor
} else {
    Add-Check 'WARN' 'MetaEditor' 'Not found in common locations or the master folder. Needed to compile the EA on this VPS.'
}

$localHealth = $null
try {
    $localHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 3
} catch {
    $localHealth = $null
}
if ($localHealth -and $localHealth.status -eq 'ok') {
    Add-Check 'PASS' 'Local bridge health' 'http://127.0.0.1:8765/health responds healthy.'
} else {
    Add-Check 'WARN' 'Local bridge health' 'No local bridge health response. Expected before starting the bridge.'
}

try {
    $dns = [System.Net.Dns]::GetHostAddresses('skud.toporapula.dev') |
        ForEach-Object { $_.IPAddressToString } |
        Select-Object -Unique
    if ($dns -contains '46.224.112.35') {
        Add-Check 'PASS' 'Bridge DNS' 'skud.toporapula.dev resolves to 46.224.112.35.'
    } else {
        Add-Check 'WARN' 'Bridge DNS' "Resolves to $($dns -join ', '); expected 46.224.112.35."
    }
} catch {
    Add-Check 'WARN' 'Bridge DNS' "Could not resolve skud.toporapula.dev: $($_.Exception.Message)"
}

foreach ($port in @(80, 443)) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        Add-Check 'PASS' "Local listener :$port" "A process is listening on TCP port $port."
    } else {
        Add-Check 'WARN' "Local listener :$port" "Nothing is listening locally on TCP port $port. Start Caddy after setup."
    }
}

Write-Host ''
$checks | Format-Table -AutoSize -Wrap
$failCount = @($checks | Where-Object Status -eq 'FAIL').Count
$warnCount = @($checks | Where-Object Status -eq 'WARN').Count
$passCount = @($checks | Where-Object Status -eq 'PASS').Count
Write-Host "Summary: $passCount pass, $warnCount warning(s), $failCount missing/failed check(s)." -ForegroundColor Cyan
Write-Host ''
Write-Host 'Portable MT5 readiness requires all three master items: terminal64.exe, compiled SkuDTurboStudentEA.ex5, and the saved SkuD chart01.chr.'
Write-Host 'The SkuD Student EA and chart template are copied into each student account slot. The Mentor EA runs separately on the mentor laptop; the Python bridge relays events.'
Write-Host 'This script does not inspect or print credentials, bridge keys, EA tokens, or startup.ini contents.'

if (-not $NoPause) {
    Read-Host 'Audit complete. Press Enter to close this window' | Out-Null
}
