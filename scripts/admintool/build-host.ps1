# Build host eip binary from the admintool module into the repo root only.
#   .\scripts\admintool\build-host.ps1
#   $env:EIP_CLI_VERSION='0.1.0'; .\scripts\admintool\build-host.ps1
#
# If the install target is locked: ALERT, stop running eip processes, wait briefly,
# retry. Never write an alternate binary name. No dist/ output.

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Tag = if ($env:EIP_CLI_VERSION) { $env:EIP_CLI_VERSION } else { "0.0.0-dev" }
$Ld = "-s -w -X eve-industry-planner/admintool/cmd/commands.Version=$Tag"

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

Push-Location (Join-Path $Root "admintool")
try {
  $env:CGO_ENABLED = "0"
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
