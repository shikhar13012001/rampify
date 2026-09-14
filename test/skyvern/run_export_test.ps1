[CmdletBinding()]
param(
  [switch]$Headed
)

# Runs the ONE test in this harness that actually signs in and performs a
# real export — see run_export_test.py's own docstring for why it's kept
# separate from run.ps1/run_ui_tests.py (whose default suite promises it
# never does either). Everything here is local-only and reversible:
#   - Firebase Auth + Firestore emulators (fake test user, emulator data)
#   - `vercel dev` pointed at those emulators via FIRESTORE_EMULATOR_HOST /
#     FIREBASE_AUTH_EMULATOR_HOST, so the real /api/check-subscription and
#     /api/record-export handlers run against them, never production.
# Nothing here touches a real Google account or production Firestore.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pythonPath = Join-Path $repoRoot '.venv-skyvern\Scripts\python.exe'
$runnerPath = Join-Path $PSScriptRoot 'run_export_test.py'
$artifactsPath = Join-Path $PSScriptRoot 'artifacts'
$jdkBin = Join-Path $repoRoot '.jdk-emulator\jdk-21.0.12.1+1\bin'
$baseUrl = 'http://127.0.0.1:3000'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw 'Skyvern is not set up. Run npm run test:ui:setup first.'
}
if (-not (Test-Path -LiteralPath $jdkBin)) {
  throw ".jdk-emulator is missing a JDK 21 (firebase-tools requires it; system Java may be older). " +
        "Download a portable Temurin 21 zip and extract it to $jdkBin — see docs/validation/STATUS.md."
}

New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
$env:PATH = "$jdkBin;$env:PATH"

$emulatorProcess = $null
$vercelProcess = $null

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
  # ── Firebase emulators (Auth :9099, Firestore :8085 — see firebase.json) ──
  $emulatorLog = Join-Path $artifactsPath 'firebase-emulators.log'
  $emulatorProcess = Start-Process -FilePath (Get-Command npx.cmd).Source `
    -ArgumentList @('firebase-tools', 'emulators:start', '--only', 'auth,firestore', '--project', 'rampify-720b4') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $emulatorLog `
    -RedirectStandardError $emulatorLog `
    -Environment @{ CI = '1' } `
    -PassThru

  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-PortOpen 9099) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  while (-not (Test-PortOpen 8085) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-PortOpen 9099) -or -not (Test-PortOpen 8085)) {
    throw "Firebase emulators did not come up in time. See $emulatorLog."
  }
  Write-Host "Firebase emulators ready (auth :9099, firestore :8085)."

  # ── vercel dev — real frontend + real /api routes, pointed at the emulators ──
  $vercelLog = Join-Path $artifactsPath 'vercel-dev.log'
  $vercelProcess = Start-Process -FilePath (Join-Path $repoRoot 'node_modules\.bin\vercel.cmd') `
    -ArgumentList @('dev', '--listen', '3000', '--yes') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $vercelLog `
    -RedirectStandardError $vercelLog `
    -Environment @{
      VITE_USE_FIREBASE_EMULATOR  = 'true'
      FIRESTORE_EMULATOR_HOST     = '127.0.0.1:8085'
      FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
    } `
    -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-PortOpen 3000) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-PortOpen 3000)) {
    throw "vercel dev did not come up in time. See $vercelLog."
  }
  # vercel dev opens the port slightly before the Vite child under it is
  # actually ready to serve — give it a moment rather than racing the first request.
  Start-Sleep -Seconds 2
  Write-Host "vercel dev ready on $baseUrl."

  $runnerArgs = @($runnerPath)
  if ($Headed) { $runnerArgs += '--headed' }
  $env:RAMPIFY_BASE_URL = $baseUrl

  & $pythonPath @runnerArgs
  $testExitCode = $LASTEXITCODE
} finally {
  if ($null -ne $vercelProcess -and -not $vercelProcess.HasExited) {
    & taskkill.exe /PID $vercelProcess.Id /T /F *> $null
  }
  if ($null -ne $emulatorProcess -and -not $emulatorProcess.HasExited) {
    & taskkill.exe /PID $emulatorProcess.Id /T /F *> $null
  }
}

exit $testExitCode
