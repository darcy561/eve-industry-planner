# Eve Industry Planner - Windows launcher (thin wrapper).
# Product path: host eip.exe (one binary: TUI when no args; CLI for verbs).
# Source module: admintool/
#
#   cd D:\my-eip
#   .\eip.exe
#   .\eip.exe doctor
#   .\eip.ps1 doctor

$ErrorActionPreference = "Stop"

function Get-ScriptDir {
  if ($PSScriptRoot) { return $PSScriptRoot }
  return (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

function Test-EipHome([string]$dir) {
  foreach ($name in @(".eip-home", ".env", "docker-stack.yml", "docker-stack.data.yml", "eip.config.yaml", "eip.config.yml")) {
    if (Test-Path (Join-Path $dir $name)) { return $true }
  }
  return $false
}

function Resolve-DeployRoot([string]$scriptDir) {
  if ($env:EIP_ROOT) { return $env:EIP_ROOT }
  if (Test-EipHome $scriptDir) { return $scriptDir }
  return (Get-Location).Path
}

$scriptDir = Get-ScriptDir
$deploy = Resolve-DeployRoot $scriptDir
$hostBin = Join-Path $scriptDir "eip.exe"

if (-not (Test-Path $hostBin)) {
  Write-Error "Missing eip.exe next to this launcher. Build with .\scripts\admintool\build-host.ps1 and re-run bootstrap."
  exit 1
}

Push-Location $deploy
try {
  & $hostBin @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
