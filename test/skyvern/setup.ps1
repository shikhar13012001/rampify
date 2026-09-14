[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$venvPath = Join-Path $repoRoot '.venv-skyvern'
$pythonPath = Join-Path $venvPath 'Scripts\python.exe'
$playwrightPath = Join-Path $venvPath 'Scripts\playwright.exe'
$requirementsPath = Join-Path $PSScriptRoot 'requirements.txt'
$modelfilePath = Join-Path $PSScriptRoot 'Modelfile'
$model = 'qwen3-vl:2b'

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  throw 'uv is required. Install it from https://docs.astral.sh/uv/getting-started/installation/'
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw 'Ollama is required. Install it from https://ollama.com/download'
}

try {
  $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 5
} catch {
  throw 'Ollama is installed but its local service is not reachable at http://127.0.0.1:11434.'
}

Push-Location $repoRoot
try {
  uv venv $venvPath --python 3.12
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python 3.12 Skyvern environment.' }

  uv pip install --python $pythonPath --requirements $requirementsPath
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the Skyvern test dependencies.' }

  & $playwrightPath install chromium
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the Chromium runtime used by Skyvern.' }

  ollama pull $Model
  if ($LASTEXITCODE -ne 0) { throw "Could not pull Ollama model '$Model'." }

  ollama create rampcut-skyvern --file $modelfilePath
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the high-context Rampcut model alias.' }
} finally {
  Pop-Location
}

Write-Host "Skyvern UI test environment is ready with rampcut-skyvern (based on $Model)."
