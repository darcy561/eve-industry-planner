# Eve Industry Planner - fresh install (Windows).
# Deploy home gets host eip.exe (CLI + TUI in one binary) + starter config.
# Source module folder is admintool/; command prefix is eip.
#
#   .\scripts\admintool\build-host.ps1
#   .\eip-bootstrap.ps1 -Path D:\my-eip
#   cd D:\my-eip
#   .\eip.exe

[CmdletBinding()]
param(
  [string]$Path = ""
)

$ErrorActionPreference = "Stop"
$PublicRaw = "https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public"
$DownloadBase = if ($env:EIP_CLI_DOWNLOAD_BASE) { $env:EIP_CLI_DOWNLOAD_BASE } else { "" }

function Get-BootstrapDir {
  if ($PSScriptRoot) { return $PSScriptRoot }
  if ($MyInvocation.MyCommand.Path) {
    return (Split-Path -Parent $MyInvocation.MyCommand.Path)
  }
  return $null
}

function Find-LocalHostBinary([string]$srcDir) {
  if (-not $srcDir) { return $null }
  foreach ($rel in @("eip.exe")) {
    $p = Join-Path $srcDir $rel
    if (Test-Path $p) { return $p }
  }
  return $null
}

$deploy = if ($Path) { $Path } else { (Get-Location).Path }
$deploy = [System.IO.Path]::GetFullPath($deploy)
New-Item -ItemType Directory -Force -Path $deploy | Out-Null

Write-Host "EIP deploy home: $deploy"

$srcDir = Get-BootstrapDir
$files = @("eip.cmd", "eip.ps1", "eip.sh")
foreach ($name in $files) {
  $dest = Join-Path $deploy $name
  $local = if ($srcDir) { Join-Path $srcDir $name } else { $null }
  if ($local -and (Test-Path $local)) {
    Copy-Item -Force $local $dest
    Write-Host "  wrote $name (from local)"
  } else {
    Write-Host "  downloading $name..."
    Invoke-WebRequest -Uri "$PublicRaw/$name" -OutFile $dest -UseBasicParsing
  }
}

$hostDest = Join-Path $deploy "eip.exe"
$hostSrc = Find-LocalHostBinary $srcDir
if ($hostSrc) {
  Copy-Item -Force $hostSrc $hostDest
  Write-Host "  wrote eip.exe (from local)"
} elseif ($DownloadBase) {
  $url = "$DownloadBase/eip-windows-amd64.exe"
  if ($DownloadBase -match '\.exe$') { $url = $DownloadBase }
  try {
    Write-Host "  downloading eip.exe..."
    Invoke-WebRequest -Uri $url -OutFile $hostDest -UseBasicParsing
    Write-Host "  wrote eip.exe (download)"
  } catch {
    Write-Host "  note: could not download host binary ($($_.Exception.Message))"
  }
} else {
  Write-Host "  note: no eip.exe yet - build with .\scripts\admintool\build-host.ps1 or bake admintool-windows, then re-run bootstrap"
}

$marker = Join-Path $deploy ".eip-home"
if (-not (Test-Path $marker)) {
  Set-Content -Path $marker -Value "Eve Industry Planner deploy home`n" -NoNewline
  Write-Host "  wrote .eip-home"
}

if (-not (Test-Path $hostDest)) {
  Write-Error "No eip.exe in deploy home. Build with .\scripts\admintool\build-host.ps1 (or bake admintool-windows), then re-run bootstrap."
  exit 1
}

Push-Location $deploy
try {
  Write-Host "  writing starter config from bundled templates (eip init)..."
  & $hostDest init
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "  note: Docker not on PATH - eip needs Docker Desktop running for doctor/stack commands"
}

Write-Host ""
Write-Host "Done. This folder is your EIP home."
Write-Host "  cd `"$deploy`""
Write-Host "  edit .env   (and eip.config.yaml if you want)"
Write-Host "  .\eip.exe            # TUI (same binary)"
Write-Host "  .\eip.exe doctor     # CLI"
