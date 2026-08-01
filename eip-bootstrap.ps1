# Eve Industry Planner - fresh install (Windows).
# Empty folder → host eip.exe (CLI+TUI) + stack YAML.
# eip.exe lives in this folder; that directory is project home (shortcuts OK).
# Operator docs (.env / eip.config.yaml): run .\eip.exe (TUI Setup) or .\eip.exe init.
#
# Prefer not writing this script into the deploy home — run from temp or pipe:
#   irm …/Development/eip-bootstrap.ps1 -OutFile $env:TEMP\eip-bootstrap.ps1
#   & $env:TEMP\eip-bootstrap.ps1 -Path D:\eip
# If it was saved inside the home, it deletes itself after a successful run.
#
# Per-branch: set EIP_KIT_BRANCH + EIP_CLI_DOWNLOAD_BASE to that branch's prerelease-* Release.
#
# Overrides:
#   EIP_KIT_BRANCH          raw GitHub branch for stack YAML (default: Development)
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
foreach ($name in @("docker-stack.yml", "docker-stack.data.yml", "docker-stack.obs.yml")) {
  Get-StackMissing $name $deploy $srcDir $PublicRaw
}

$hostDest = Join-Path $deploy "eip.exe"
if (Test-Path $hostDest) {
  Write-Host "  eip.exe already present (unchanged)"
} else {
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
}

if (-not (Test-Path $hostDest)) {
  Write-Error "No eip.exe in deploy home. Publish a prerelease (publish-prerelease.yml), or build with .\scripts\admintool\build-host.ps1, then re-run bootstrap."
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "  note: Docker not on PATH - eip needs Docker Desktop running for doctor/stack commands"
}

Write-Host ""
Write-Host "Done. This folder is your EIP home."
Write-Host "  cd `"$deploy`""
Write-Host "  .\eip.exe          # TUI Setup writes .env / eip.config.yaml"
Write-Host "  # or: .\eip.exe init"
Write-Host "  # optional: .\eip.exe add-path   # bare eip on PATH"
Write-Host "  `$env:EIP_UPDATE_TAG = 'prerelease'   # for eip update-binary on this channel"
Write-Host "  .\eip.exe up"

# Drop this installer if it lives inside the deploy home (not when run from the repo).
$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath) {
  $scriptFull = [System.IO.Path]::GetFullPath($scriptPath)
  $deployPrefix = $deploy.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if ($scriptFull.StartsWith($deployPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
      ([System.IO.Path]::GetDirectoryName($scriptFull) -eq $deploy)) {
    try {
      Remove-Item -Force -LiteralPath $scriptFull
      Write-Host "  removed bootstrap script from deploy home"
    } catch {
      Write-Host "  note: could not remove bootstrap script ($($_.Exception.Message))"
    }
  }
}
