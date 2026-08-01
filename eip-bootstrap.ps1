# Eve Industry Planner - fresh install (Windows).
# Empty folder → host eip.exe only. Stack YAML / .env come from eip init (or TUI Setup).
# eip.exe lives in this folder; that directory is project home (shortcuts OK).
#
# Prefer not writing this script into the deploy home - run from temp:
#   irm https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/eip-bootstrap.ps1 -OutFile $env:TEMP\eip-bootstrap.ps1
#   & $env:TEMP\eip-bootstrap.ps1 -Path D:\eip
#   & $env:TEMP\eip-bootstrap.ps1 -Path D:\eip -Release prerelease-swarm-hard-cutover
#
# -Release / EIP_RELEASE: exact GitHub Release tag for the host binary (e.g. cli, cli-v1.0.0, prerelease-…).
#   Omit for Public floating tag "cli". Fails if that Release/asset is missing.
# -Force re-downloads eip.exe.
#
# Low-level override: EIP_CLI_DOWNLOAD_BASE

[CmdletBinding()]
param(
  [string]$Path = "",
  [string]$Release = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Repo = if ($env:EIP_REPO) { $env:EIP_REPO } else { "darcy561/eve-industry-planner" }

$ReleaseTag = if ($Release) { $Release.Trim() } elseif ($env:EIP_RELEASE) { $env:EIP_RELEASE.Trim() } else { "" }

if ($ReleaseTag -match '[\s\\/]') {
  Write-Error "Invalid -Release '$ReleaseTag' (use the exact GitHub Release tag, e.g. prerelease-swarm-hard-cutover)."
  exit 1
}

# Explicit -Release always wins (so a missing tag fails instead of a leftover EIP_CLI_DOWNLOAD_BASE).
if ($ReleaseTag) {
  $DownloadBase = "https://github.com/$Repo/releases/download/$ReleaseTag"
} elseif ($env:EIP_CLI_DOWNLOAD_BASE) {
  $DownloadBase = $env:EIP_CLI_DOWNLOAD_BASE
} else {
  $DownloadBase = "https://github.com/$Repo/releases/download/cli"
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

$deploy = if ($Path) { $Path } else { (Get-Location).Path }
$deploy = [System.IO.Path]::GetFullPath($deploy)
New-Item -ItemType Directory -Force -Path $deploy | Out-Null

Write-Host "EIP deploy home: $deploy"
if ($ReleaseTag) {
  Write-Host "  release: $ReleaseTag"
} else {
  Write-Host "  release: cli (Public)"
}
Write-Host "  binary:  $DownloadBase"
if ($Force) { Write-Host "  force:   re-download eip.exe" }

$srcDir = Get-BootstrapDir
$hostDest = Join-Path $deploy "eip.exe"
if ((Test-Path $hostDest) -and -not $Force) {
  Write-Host "  eip.exe already present (unchanged)"
} else {
  $hostSrc = Find-LocalHostBinary $srcDir
  if ($hostSrc -and -not $Force) {
    Copy-Item -Force $hostSrc $hostDest
    Write-Host "  wrote eip.exe (from local)"
  } elseif ($DownloadBase) {
    $url = "$($DownloadBase.TrimEnd('/'))/eip-windows-amd64.exe"
    if ($DownloadBase -match '\.exe$') { $url = $DownloadBase }
    $staging = Join-Path $deploy "eip.exe.new"
    Write-Host "  downloading eip-windows-amd64.exe..."
    try {
      Invoke-WebRequest -Uri $url -OutFile $staging -UseBasicParsing
    } catch {
      Remove-Item -Force -ErrorAction SilentlyContinue $staging
      if ($ReleaseTag) {
        Write-Error "No host binary for Release '$ReleaseTag' ($url). Publish that tag or omit -Release for Public cli."
      } else {
        Write-Error "Could not download Public host binary ($url): $($_.Exception.Message)"
      }
      exit 1
    }
    if (Test-Path $hostDest) {
      $old = Join-Path $deploy "eip.exe.old"
      Remove-Item -Force -ErrorAction SilentlyContinue $old
      try {
        Move-Item -Force -LiteralPath $hostDest -Destination $old
      } catch {
        Write-Error "Existing eip.exe is in use. Quit eip, then re-run with -Force (binary saved as eip.exe.new)."
        exit 1
      }
    }
    Move-Item -Force -LiteralPath $staging -Destination $hostDest
    Write-Host "  wrote eip.exe (download)"
  } else {
    Write-Error "No download URL for host binary."
    exit 1
  }
}

if (-not (Test-Path $hostDest)) {
  Write-Error "No eip.exe in deploy home."
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "  note: Docker not on PATH - eip needs Docker Desktop running for doctor/stack commands"
}

Write-Host ""
Write-Host "Done. This folder is your EIP home."
Write-Host "  cd `"$deploy`""
Write-Host "  .\eip.exe init   # stack YAML + .env + eip.config.yaml"
Write-Host "  .\eip.exe        # or TUI Setup"
Write-Host "  .\eip.exe up"
if ($ReleaseTag) {
  Write-Host "  # release: $ReleaseTag (switch: re-run with -Release <tag> -Force, or omit for Public cli)"
} else {
  Write-Host "  # release: cli (Public floating)"
}

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
