@echo off
REM Eve Industry Planner - Windows launcher (thin wrapper).
REM Product path: host eip.exe (TUI / CLI). Source: admintool/
REM   .\eip.exe
REM   .\eip.exe doctor

setlocal EnableExtensions

if defined EIP_ROOT (
  set "DEPLOY=%EIP_ROOT%"
  goto :after_deploy
)
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
if exist "%SCRIPT_DIR%\.eip-home" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
if exist "%SCRIPT_DIR%\.env" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
if exist "%SCRIPT_DIR%\docker-stack.yml" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
if exist "%SCRIPT_DIR%\docker-stack.data.yml" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
if exist "%SCRIPT_DIR%\eip.config.yaml" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
if exist "%SCRIPT_DIR%\eip.config.yml" set "DEPLOY=%SCRIPT_DIR%" & goto :after_deploy
set "DEPLOY=%CD%"

:after_deploy
if not exist "%~dp0eip.exe" (
  echo Missing eip.exe next to this launcher. Build with scripts\admintool\build-host.ps1 and re-run bootstrap.
  exit /b 1
)
pushd "%DEPLOY%"
"%~dp0eip.exe" %*
set "EC=%ERRORLEVEL%"
popd
exit /b %EC%
