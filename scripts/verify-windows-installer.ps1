# Runs only on a disposable GitHub Actions Windows runner.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'Installer verification requires a disposable GitHub Actions Windows runner.'
}

function Run-Checked([string]$File, [string]$Arguments) {
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
  if (-not $process.WaitForExit(120000)) {
    $process.Kill($true)
    throw "Process timed out: $File"
  }
  if ($process.ExitCode -ne 0) { throw "Process failed ($($process.ExitCode)): $File" }
}

$installers = @(Get-ChildItem -LiteralPath 'release' -Filter '*.exe' -File)
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows installer in release/.' }
$testRoot = Join-Path $env:RUNNER_TEMP ('MusicBank Install Smoke ' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $testRoot 'Application With Spaces'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'MusicBank.lnk'
$menuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'MusicBank.lnk'
$sentinel = Join-Path $env:APPDATA ('MusicBank/data/installer-smoke-' + [guid]::NewGuid().ToString('N') + '.txt')
$token = [guid]::NewGuid().ToString('N')
$uninstallCopy = Join-Path $testRoot 'uninstall-smoke.exe'
try {
  # NSIS requires /D as the last parameter, with the path unquoted.
  Run-Checked $installers[0].FullName "/S /currentuser /D=$installDir"
  $app = Join-Path $installDir 'MusicBank.exe'
  $archive = Join-Path $installDir 'resources/app.asar'
  foreach ($file in @($app, $archive, $desktopLink, $menuLink)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Installation did not create: $file" }
  }
  $uninstallers = @(Get-ChildItem -LiteralPath $installDir -Filter '*Uninstall*.exe' -File)
  if ($uninstallers.Count -ne 1) { throw 'Installed uninstaller is missing or ambiguous.' }
  $entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSObject.Properties['UninstallString'] -and $_.UninstallString.Contains($installDir) })
  if ($entries.Count -ne 1) { throw 'Windows uninstall registration is missing or ambiguous.' }
  $registryPath = $entries[0].PSPath
  $probe = (Resolve-Path 'scripts/package-smoke.cjs').Path
  $previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $stdout = Join-Path $testRoot 'probe.stdout'
    $stderr = Join-Path $testRoot 'probe.stderr'
    $process = Start-Process -FilePath $app -ArgumentList "`"$probe`" `"$archive`"" -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $process.WaitForExit(120000)) { $process.Kill($true); throw 'Installed application database probe timed out.' }
    if ($process.ExitCode -ne 0 -or (Get-Content -LiteralPath $stdout -Raw) -notmatch 'musicbank-application-db-ok') {
      throw "Installed application database probe failed: $(Get-Content -LiteralPath $stderr -Raw)"
    }
  } finally { $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode }

  # A real file in the application's data folder must survive uninstall.
  New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
  Set-Content -LiteralPath $sentinel -Value $token -NoNewline
  Copy-Item -LiteralPath $uninstallers[0].FullName -Destination $uninstallCopy
  # _?= prevents NSIS spawning a detached temporary uninstaller, so exit can be awaited.
  Run-Checked $uninstallCopy "/S /currentuser _?=$installDir"
  foreach ($file in @($app, $archive, $desktopLink, $menuLink, $registryPath)) {
    if (Test-Path -LiteralPath $file) { throw "Uninstall left application state behind: $file" }
  }
  if (-not (Test-Path -LiteralPath $sentinel) -or (Get-Content -LiteralPath $sentinel -Raw) -ne $token) {
    throw 'Uninstall removed or changed application user data.'
  }
  Write-Output 'MusicBank Windows install, installed database, shortcuts, uninstall registration, uninstall and user-data retention passed.'
} finally {
  # Only test-owned paths; never remove the whole application data folder.
  if (Test-Path -LiteralPath $sentinel) { Remove-Item -LiteralPath $sentinel -Force }
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
