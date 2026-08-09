@echo off
setlocal

cd /d "%~dp0"
title Memo App Development Mode

if /i "%~1"=="--check" (
  echo CHECK_OK
  exit /b 0
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js or npm.cmd was not found.
  echo Install Node.js and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [ERROR] node_modules was not found.
  echo Run npm.cmd install in this project first.
  pause
  exit /b 1
)

set "MEMO_APP_ROOT=%CD%"
set "REUSE_NEXT=0"

powershell.exe -NoProfile -NonInteractive -Command "$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if (-not $connections) { exit 1 }; foreach ($connection in $connections) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $connection.OwningProcess) -ErrorAction SilentlyContinue; if ($process.CommandLine -like ('*' + $env:MEMO_APP_ROOT + '*')) { exit 0 } }; exit 2"
set "PORT_3000_STATE=%ERRORLEVEL%"

if "%PORT_3000_STATE%"=="0" (
  set "REUSE_NEXT=1"
) else if "%PORT_3000_STATE%"=="2" (
  echo [ERROR] Port 3000 is being used by another program.
  echo Close that program and run this file again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -NonInteractive -Command "$deadline = (Get-Date).AddSeconds(10); do { if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo [ERROR] Port 8000 is already in use.
  echo Close the existing Memo App or backend server and run this file again.
  pause
  exit /b 1
)

if /i "%~1"=="--diagnose" (
  echo DIAG_OK REUSE_NEXT=%REUSE_NEXT%
  exit /b 0
)

echo Starting Memo App in development mode...
echo Press Ctrl+C in this window to stop the app and development servers.
echo.

if "%REUSE_NEXT%"=="1" (
  echo Reusing the existing Next.js server on port 3000.
) else (
  if exist ".next\dev\lock" (
    echo Removing a stale Next.js development lock.
    del /q ".next\dev\lock"
  )
)
call node scripts\run-electron-dev.js
set "APP_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%APP_EXIT_CODE%"=="0" (
  echo [ERROR] Development mode exited with code %APP_EXIT_CODE%.
) else (
  echo Development mode stopped.
)
pause
exit /b %APP_EXIT_CODE%
