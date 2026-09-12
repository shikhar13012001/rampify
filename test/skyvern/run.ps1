[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://127.0.0.1:5173',
  [switch]$Headed,
  [switch]$SkipAI,
  [int]$SlowMo = 0
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pythonPath = Join-Path $repoRoot '.venv-skyvern\Scripts\python.exe'
$runnerPath = Join-Path $PSScriptRoot 'run_ui_tests.py'
$artifactsPath = Join-Path $PSScriptRoot 'artifacts'
$viteProcess = $null
$targetUri = [Uri]$BaseUrl

if ($targetUri.Scheme -ne 'http' -or $targetUri.Host -ne '127.0.0.1') {
  throw 'BaseUrl must be an http://127.0.0.1 URL; the harness intentionally blocks non-local targets.'
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw 'Skyvern is not set up. Run npm run test:ui:setup first.'
}

New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

Push-Location $repoRoot
try {
  if (-not (Test-AppReady)) {
    $npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
    $stdoutPath = Join-Path $artifactsPath 'vite.stdout.log'
    $stderrPath = Join-Path $artifactsPath 'vite.stderr.log'
    $viteProcess = Start-Process -FilePath $npmCommand `
      -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', $targetUri.Port) `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -PassThru

    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-AppReady) -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 500
    }
    if (-not (Test-AppReady)) {
      throw "Rampify did not become ready at $BaseUrl. See $stderrPath."
    }
  }

  $runnerArgs = @($runnerPath, '--base-url', $BaseUrl)
  if ($Headed) { $runnerArgs += '--headed' }
  if ($SkipAI) { $runnerArgs += '--skip-ai' }
  if ($SlowMo -gt 0) { $runnerArgs += @('--slow-mo', $SlowMo) }

  & $pythonPath @runnerArgs
  $testExitCode = $LASTEXITCODE
} finally {
  if ($null -ne $viteProcess -and -not $viteProcess.HasExited) {
    & taskkill.exe /PID $viteProcess.Id /T /F *> $null
  }
  Pop-Location
}

exit $testExitCode
