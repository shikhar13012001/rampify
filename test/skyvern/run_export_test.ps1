[CmdletBinding()]
param(
  [switch]$Headed
)

# Runs the ONE test in this harness that actually signs in and performs a
# real export - see run_export_test.py's own docstring for why it's kept
# separate from run.ps1/run_ui_tests.py (whose default suite promises it
# never does either). Everything here is local-only and reversible:
#   - Firebase Auth + Firestore emulators (fake test user, emulator data)
#   - a plain `vite` dev server for the frontend (port 5173, same as
#     run_ui_tests.py) - the emulator connection itself is injected by
#     run_export_test.py via Playwright's add_init_script, not an env var
#   - a SEPARATE `vercel dev` instance serving ONLY /api/* (port 3001),
#     pointed at the emulators via FIRESTORE_EMULATOR_HOST /
#     FIREBASE_AUTH_EMULATOR_HOST so the real check-subscription/
#     record-export handlers run against them, never production. vite.config.
#     ts's existing /api proxy forwards requests from 5173 to 3001.
#     (Routing /api through vercel dev directly on the SAME port as the
#     frontend was tried first - vercel dev's proxy made Vite's own dev
#     module graph hang. Splitting the two servers avoided it.)
# Nothing here touches a real Google account or production Firestore.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pythonPath = Join-Path $repoRoot '.venv-skyvern\Scripts\python.exe'
$runnerPath = Join-Path $PSScriptRoot 'run_export_test.py'
$artifactsPath = Join-Path $PSScriptRoot 'artifacts'
$jdkBin = Join-Path $repoRoot '.jdk-emulator\jdk-21.0.12.1+1\bin'
$baseUrl = 'http://127.0.0.1:5173'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw 'Skyvern is not set up. Run npm run test:ui:setup first.'
}
if (-not (Test-Path -LiteralPath $jdkBin)) {
  throw ".jdk-emulator is missing a JDK 21 (firebase-tools requires it; system Java may be older). Download a portable Temurin 21 zip and extract it to $jdkBin - see docs/validation/STATUS.md."
}

New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
$env:PATH = "$jdkBin;$env:PATH"

$emulatorProcess = $null
$vercelProcess = $null
$viteProcess = $null

function Test-PortOpen($port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $port)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

try {
  # Firebase emulators (Auth :9099, Firestore :8085 - see firebase.json)
  # Start-Process has no -Environment parameter on Windows PowerShell 5.1
  # (this project's target - it's a PowerShell 7+ addition), so custom env
  # vars are set on the current session first; Start-Process inherits it.
  $emulatorLog = Join-Path $artifactsPath 'firebase-emulators.log'
  $emulatorErrLog = Join-Path $artifactsPath 'firebase-emulators.err.log'
  $env:CI = '1'
  $emulatorProcess = Start-Process -FilePath (Get-Command npx.cmd).Source `
    -ArgumentList @('firebase-tools', 'emulators:start', '--only', 'auth,firestore', '--project', 'rampify-720b4') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $emulatorLog `
    -RedirectStandardError $emulatorErrLog `
    -PassThru

  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-PortOpen 9099) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  while (-not (Test-PortOpen 8085) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-PortOpen 9099) -or -not (Test-PortOpen 8085)) {
    throw "Firebase emulators did not come up in time. See $emulatorLog."
  }
  Write-Host "Firebase emulators ready (auth :9099, firestore :8085)."

  # vercel dev - /api/* ONLY (port 3001), pointed at the emulators
  $vercelLog = Join-Path $artifactsPath 'vercel-dev.log'
  $vercelErrLog = Join-Path $artifactsPath 'vercel-dev.err.log'
  $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
  $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  $vercelProcess = Start-Process -FilePath (Join-Path $repoRoot 'node_modules\.bin\vercel.cmd') `
    -ArgumentList @('dev', '--listen', '3001', '--yes') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $vercelLog `
    -RedirectStandardError $vercelErrLog `
    -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-PortOpen 3001) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-PortOpen 3001)) {
    throw "vercel dev did not come up in time. See $vercelLog."
  }
  Write-Host "vercel dev ready on :3001 (api only)."

  # plain vite - the real frontend (port 5173). --host is required: without
  # it Vite can bind IPv6-only on this machine, and every 127.0.0.1 request
  # (including from Playwright) silently fails or hits a stale process
  # squatting on the IPv4 socket instead.
  $viteLog = Join-Path $artifactsPath 'vite-dev.log'
  $viteErrLog = Join-Path $artifactsPath 'vite-dev.err.log'
  $viteProcess = Start-Process -FilePath (Join-Path $repoRoot 'node_modules\.bin\vite.cmd') `
    -ArgumentList @('--host', '127.0.0.1', '--port', '5173') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $viteLog `
    -RedirectStandardError $viteErrLog `
    -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-PortOpen 5173) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-PortOpen 5173)) {
    throw "vite did not come up in time. See $viteLog."
  }
  # First request after a config/lockfile change can trigger Vite's
  # dependency re-optimization, which is slow enough to time out the test
  # script's own navigation - warm it up here instead of racing it.
  try { Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 60 | Out-Null } catch {}
  Write-Host "vite ready on $baseUrl."

  $runnerArgs = @($runnerPath)
  if ($Headed) { $runnerArgs += '--headed' }
  $env:RAMPCUT_BASE_URL = $baseUrl

  & $pythonPath @runnerArgs
  $testExitCode = $LASTEXITCODE
} finally {
  if ($null -ne $viteProcess -and -not $viteProcess.HasExited) {
    & taskkill.exe /PID $viteProcess.Id /T /F *> $null
  }
  if ($null -ne $vercelProcess -and -not $vercelProcess.HasExited) {
    & taskkill.exe /PID $vercelProcess.Id /T /F *> $null
  }
  if ($null -ne $emulatorProcess -and -not $emulatorProcess.HasExited) {
    & taskkill.exe /PID $emulatorProcess.Id /T /F *> $null
  }
}

exit $testExitCode
