[CmdletBinding()]
param([switch]$Headed)
# Real browser + real handlers against a named isolated demo Firebase project.
# Reuse the installed Playwright runtime without the broken Python interpreter.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repoRoot
try {
  $runnerArgs = @('test/browser/run.mjs')
  if ($Headed) { $runnerArgs += '--headed' }
  & node @runnerArgs
  $testExitCode = $LASTEXITCODE
} finally { Pop-Location }
exit $testExitCode
