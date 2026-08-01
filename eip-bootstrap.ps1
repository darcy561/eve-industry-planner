# Eve Industry Planner - fresh install (Windows).
# Empty folder → host eip.exe (CLI+TUI) + stack YAML.
# eip.exe lives in this folder; that directory is project home (shortcuts OK).
#
# Prefer not writing this script into the deploy home — run from temp:
#   irm …/eip-bootstrap.ps1 -OutFile $env:TEMP\eip-bootstrap.ps1
#   & $env:TEMP\eip-bootstrap.ps1 -Path D:\eip -Channel swarm/hard-cutover
#
# Channels (-Channel / EIP_CHANNEL):
#   Development | prerelease     → kit: Development, binary: prerelease
#   swarm/my-feature             → kit: that branch, binary: prerelease-<slug>
#   prerelease-swarm-my-feature  → same (tag form)
#   Public | latest              → kit: Public, binary: /releases/latest
# -Force re-downloads stacks + eip.exe (use when switching channels).
#
# Low-level overrides still work: EIP_KIT_BRANCH, EIP_CLI_DOWNLOAD_BASE, EIP_PUBLIC_RAW

[CmdletBinding()]
param(
  [string]$Path = "",
  [string]$Channel = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Repo = if ($env:EIP_REPO) { $env:EIP_REPO } else { "darcy561/eve-industry-planner" }

function Get-BranchSlug([string]$branch) {
  $s = $branch.ToLowerInvariant() -replace '/', '-'
  $s = $s -replace '[^a-z0-9._-]', '-'
  $s = $s -replace '-+', '-'
  return $s.Trim('-')
}

function Resolve-BootstrapChannel([string]$ch) {
  $ch = if ($ch) { $ch.Trim() } elseif ($env:EIP_CHANNEL) { $env:EIP_CHANNEL.Trim() } else { "Development" }
  $kit = $null
  $tag = $null
  $download = $null

  switch -Regex ($ch) {
    '^(?i)(public|latest)$' {
      $kit = "Public"
      $tag = ""
      $download = "https://github.com/$Repo/releases/latest/download"
    }
    '^(?i)(development|prerelease)$' {
      $kit = "Development"
      $tag = "prerelease"
      $download = "https://github.com/$Repo/releases/download/prerelease"
    }
    '^(?i)prerelease-(.+)$' {
      $slug = $Matches[1]
      if ($slug -match '^(swarm)-(.+)$') {
        $kit = "swarm/$($Matches[2])"
      } elseif ($slug -eq "development") {
        $kit = "Development"
      } else {
        $kit = $slug
      }
      $tag = "prerelease-$slug"
      $download = "https://github.com/$Repo/releases/download/$tag"
    }
    default {
      # Treat as git branch (e.g. swarm/hard-cutover)
      $kit = $ch -replace '^refs/heads/', ''
      $slug = Get-BranchSlug $kit
      if ($kit -match '^(?i)development$') {
        $tag = "prerelease"
        $download = "https://github.com/$Repo/releases/download/prerelease"
      } else {
        $tag = "prerelease-$slug"
        $download = "https://github.com/$Repo/releases/download/$tag"
      }
    }
  }

  return [pscustomobject]@{
    Input      = $ch
    KitBranch  = $kit
    ChannelTag = $tag
    DownloadBase = $download
  }
}

$resolved = Resolve-BootstrapChannel $Channel
$KitBranch = if ($env:EIP_KIT_BRANCH) { $env:EIP_KIT_BRANCH } else { $resolved.KitBranch }
$PublicRaw = if ($env:EIP_PUBLIC_RAW) {
  $env:EIP_PUBLIC_RAW
} else {
  "https://raw.githubusercontent.com/$Repo/refs/heads/$KitBranch"
}
$DownloadBase = if ($env:EIP_CLI_DOWNLOAD_BASE) {
  $env:EIP_CLI_DOWNLOAD_BASE
} else {
  $resolved.DownloadBase
}
$ChannelTag = $resolved.ChannelTag

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

function Get-StackFile([string]$name, [string]$deploy, [string]$srcDir, [string]$rawBase, [bool]$force) {
  $dest = Join-Path $deploy $name
  if ((Test-Path $dest) -and -not $force) {
    Write-Host "  $name already present (unchanged)"
    return
  }
  $local = if ($srcDir) { Join-Path $srcDir $name } else { $null }
  if ($local -and (Test-Path $local) -and -not $force) {
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
Write-Host "  channel:    $($resolved.Input)"
if ($ChannelTag) { Write-Host "  eip tag:    $ChannelTag" } else { Write-Host "  eip tag:    latest (Public)" }
Write-Host "  kit source: $PublicRaw"
Write-Host "  binary:     $DownloadBase"
if ($Force) { Write-Host "  force:      re-download stacks + eip.exe" }

$srcDir = Get-BootstrapDir
foreach ($name in @("docker-stack.yml", "docker-stack.data.yml", "docker-stack.obs.yml")) {
  Get-StackFile $name $deploy $srcDir $PublicRaw ([bool]$Force)
}

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
    try {
      Write-Host "  downloading eip-windows-amd64.exe..."
      Invoke-WebRequest -Uri $url -OutFile $staging -UseBasicParsing
      if (Test-Path $hostDest) {
        $old = Join-Path $deploy "eip.exe.old"
        Remove-Item -Force -ErrorAction SilentlyContinue $old
        try {
          Move-Item -Force -LiteralPath $hostDest -Destination $old
        } catch {
          # Still running: leave eip.exe.old aside and try overwrite; if that fails, keep .new for manual swap.
          Write-Host "  note: existing eip.exe is in use — downloaded to eip.exe.new; quit eip and re-run with -Force, or replace manually"
          Write-Host "  wrote eip.exe.new (download)"
          throw
        }
      }
      Move-Item -Force -LiteralPath $staging -Destination $hostDest
      Write-Host "  wrote eip.exe (download)"
    } catch {
      if (-not (Test-Path $staging)) {
        Write-Host "  note: could not download host binary ($($_.Exception.Message))"
      }
    }
  } else {
    Write-Host "  note: no eip.exe yet - build with .\scripts\admintool\build-host.ps1, then re-run bootstrap"
  }
}

if (-not (Test-Path $hostDest)) {
  Write-Error "No eip.exe in deploy home. Publish the channel (publish-prerelease.yml), or build with .\scripts\admintool\build-host.ps1, then re-run bootstrap."
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "  note: Docker not on PATH - eip needs Docker Desktop running for doctor/stack commands"
}

Write-Host ""
Write-Host "Done. This folder is your EIP home."
Write-Host "  cd `"$deploy`""
Write-Host "  .\eip.exe          # TUI Setup (APP_VERSION preset from baked channel on prerelease builds)"
Write-Host "  .\eip.exe up"
if ($ChannelTag) {
  Write-Host "  # channel tag: $ChannelTag (switch later: re-run bootstrap -Channel <name> -Force)"
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
