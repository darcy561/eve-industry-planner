# Eve Industry Planner - fresh install (Windows).
# Empty folder → host eip.exe (CLI+TUI) + stack YAML + starter .env / eip.config.yaml.
#
# Development staging (generic prerelease tag — default):
#   irm …/Development/eip-bootstrap.ps1 -OutFile eip-bootstrap.ps1; .\eip-bootstrap.ps1 -Path D:\eip
#
# Per-branch: set EIP_KIT_BRANCH + EIP_CLI_DOWNLOAD_BASE to that branch's prerelease-* Release.
#
# Overrides:
#   EIP_KIT_BRANCH          raw GitHub branch for wrappers + stack YAML (default: Development)
#   EIP_CLI_DOWNLOAD_BASE   Release asset directory (default: …/releases/download/prerelease)
#   EIP_PUBLIC_RAW          full raw base URL (overrides EIP_KIT_BRANCH)

[CmdletBinding()]
param(
  [string]$Path = ""
)

$ErrorActionPreference = "Stop"
$Repo = if ($env:EIP_REPO) { $env:EIP_REPO } else { "darcy561/eve-industry-planner" }
$KitBranch = if ($env:EIP_KIT_BRANCH) { $env:EIP_KIT_BRANCH } else { "Development" }
$PublicRaw = if ($env:EIP_PUBLIC_RAW) {
  $env:EIP_PUBLIC_RAW
} else {
  "https://raw.githubusercontent.com/$Repo/refs/heads/$KitBranch"
}
$DownloadBase = if ($env:EIP_CLI_DOWNLOAD_BASE) {
  $env:EIP_CLI_DOWNLOAD_BASE
} else {
  "https://github.com/$Repo/releases/download/prerelease"
}

function Get-BootstrapDir {
  if ($PSScriptRoot) { return $PSScriptRoot }
  if ($MyInvocation.MyCommand.Path) {
    return (Split-Path -Parent $MyInvocation.MyCommand.Path)
  }
  return $null
}

function Find-LocalHostBinary([string]$srcDir) {
  if (-not $srcDir) { return $null }
  $p = Join-Path $srcDir "eip.exe"
  if (Test-Path $p) { return $p }
  return $null
}

function Get-OrCopyFile([string]$name, [string]$deploy, [string]$srcDir, [string]$rawBase) {
  $dest = Join-Path $deploy $name
  $local = if ($srcDir) { Join-Path $srcDir $name } else { $null }
  if ($local -and (Test-Path $local)) {
    Copy-Item -Force $local $dest
    Write-Host "  wrote $name (from local)"
    return
  }
  Write-Host "  downloading $name..."
  Invoke-WebRequest -Uri "$rawBase/$name" -OutFile $dest -UseBasicParsing
}

function Get-StackMissing([string]$name, [string]$deploy, [string]$srcDir, [string]$rawBase) {
  $dest = Join-Path $deploy $name
  if (Test-Path $dest) {
    Write-Host "  $name already present (unchanged)"
    return
  }
  $local = if ($srcDir) { Join-Path $srcDir $name } else { $null }
  if ($local -and (Test-Path $local)) {
    Copy-Item -Force $local $dest
    Write-Host "  wrote $name (from local)"
    return
  }
  Write-Host "  downloading $name..."
  Invoke-WebRequest -Uri "$rawBase/$name" -OutFile $dest -UseBasicParsing
  Write-Host "  wrote $name"
}

$deploy = if ($Path) { $Path } else { (Get-Location).Path }
$deploy = [System.IO.Path]::GetFullPath($deploy)
New-Item -ItemType Directory -Force -Path $deploy | Out-Null

Write-Host "EIP deploy home: $deploy"
Write-Host "  kit source: $PublicRaw"
Write-Host "  binary:     $DownloadBase"

$srcDir = Get-BootstrapDir
foreach ($name in @("eip.cmd", "eip.ps1", "eip.sh")) {
  Get-OrCopyFile $name $deploy $srcDir $PublicRaw
}
foreach ($name in @("docker-stack.yml", "docker-stack.data.yml", "docker-stack.obs.yml")) {
  Get-StackMissing $name $deploy $srcDir $PublicRaw
}

$hostDest = Join-Path $deploy "eip.exe"
$hostSrc = Find-LocalHostBinary $srcDir
if ($hostSrc) {
  Copy-Item -Force $hostSrc $hostDest
  Write-Host "  wrote eip.exe (from local)"
} elseif ($DownloadBase) {
  $url = "$($DownloadBase.TrimEnd('/'))/eip-windows-amd64.exe"
  if ($DownloadBase -match '\.exe$') { $url = $DownloadBase }
  try {
    Write-Host "  downloading eip-windows-amd64.exe..."
    Invoke-WebRequest -Uri $url -OutFile $hostDest -UseBasicParsing
    Write-Host "  wrote eip.exe (download)"
  } catch {
    Write-Host "  note: could not download host binary ($($_.Exception.Message))"
  }
} else {
  Write-Host "  note: no eip.exe yet - build with .\scripts\admintool\build-host.ps1, then re-run bootstrap"
}

$marker = Join-Path $deploy ".eip-home"
if (-not (Test-Path $marker)) {
  Set-Content -Path $marker -Value "Eve Industry Planner deploy home`n" -NoNewline
  Write-Host "  wrote .eip-home"
}

if (-not (Test-Path $hostDest)) {
  Write-Error "No eip.exe in deploy home. Publish a prerelease (publish-prerelease.yml), or build with .\scripts\admintool\build-host.ps1, then re-run bootstrap."
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
Write-Host "  edit .env   (EVE SSO; APP_VERSION defaults to prerelease)"
Write-Host "  `$env:EIP_UPDATE_TAG = 'prerelease'   # for eip update-binary on this channel"
Write-Host "  .\eip.exe up"
