# Build host eip binary from the deployment-tool module into the repo root only.
#   .\scripts\deployment-tool\build-host.ps1
#   $env:EIP_CLI_VERSION='0.1.0'; .\scripts\deployment-tool\build-host.ps1
#   # Prerelease soak (matches publish-prerelease ldflags):
#   $env:EIP_CLI_VERSION='0.0.0-prerelease.swarm-hard-cutover.local'
#   $env:EIP_CHANNEL='prerelease-swarm-hard-cutover'
#   $env:EIP_KIT_BRANCH='swarm/hard-cutover'
#   .\scripts\deployment-tool\build-host.ps1
#
# If the install target is locked: ALERT, stop running eip processes, wait briefly,
# retry. Never write an alternate binary name. No dist/ output.

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Tag = if ($env:EIP_CLI_VERSION) { $env:EIP_CLI_VERSION } else { "0.0.0-dev" }
$Ld = "-s -w -X eve-industry-planner/deployment-tool/internal/kit.Version=$Tag"
if ($env:EIP_CHANNEL) {
  $Ld += " -X eve-industry-planner/deployment-tool/internal/kit.Channel=$($env:EIP_CHANNEL)"
}
if ($env:EIP_KIT_BRANCH) {
  $Ld += " -X eve-industry-planner/deployment-tool/internal/kit.KitBranch=$($env:EIP_KIT_BRANCH)"
}

function Stop-EipProcesses {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq "eip" } |
    ForEach-Object {
      Write-Host "ALERT: stopping locked eip (pid $($_.Id))…"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

function Install-EipBinary([string]$Src, [string]$Dest) {
  try {
    Copy-Item -Force $Src $Dest
    Write-Host "wrote $Dest"
    return
  } catch {
    # fall through
  }

  Write-Host "ALERT: $Dest is locked (eip TUI/CLI still running)."
  Write-Host "Stopping eip processes and waiting to install…"
  Stop-EipProcesses
  Start-Sleep -Milliseconds 600

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    try {
      Copy-Item -Force $Src $Dest
      Write-Host "wrote $Dest"
      return
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }

  Write-Error @"
ALERT: still cannot update $Dest after stopping eip / waiting.
Quit eip manually (q), then re-run this script.
Do not use an alternate output name.
"@
  exit 1
}

Push-Location (Join-Path $Root "deployment-tool")
try {
  $env:CGO_ENABLED = "0"
  # Match published Release assets (eip-windows-amd64.exe). A 32-bit Go host
  # defaults GOARCH=386 and SelfUpdate then looks for a non-existent asset.
  if (-not $env:GOARCH) {
    if ($IsWindows -or $env:OS -match "Windows") {
      $env:GOARCH = "amd64"
    }
  }
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("eip-build-" + $PID + $(if ($IsWindows -or $env:OS -match "Windows") { ".exe" } else { "" }))
  try {
    go build -ldflags $Ld -trimpath -o $tmp .
    if ($IsWindows -or $env:OS -match "Windows") {
      Install-EipBinary $tmp (Join-Path $Root "eip.exe")
    } else {
      Install-EipBinary $tmp (Join-Path $Root "eip")
    }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  }
} finally {
  Pop-Location
}
