@echo off
title Portal Game Launcher
setlocal
set PORT=8000
set DIR=%~dp0
echo ============================================
echo  Portal Game - Local Server Launcher
echo ============================================
echo.
cd /d "%DIR%"
if not exist "%DIR%libs\three.min.js" goto NOLIB
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where python3 >nul 2>nul && set PY=python3
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY goto NOPY
echo Using: %PY%
echo Starting server on port %PORT% ...
echo Game URL: http://localhost:%PORT%/portal.html
echo Close this window to stop the server.
echo.
start "" /B %PY% -m http.server %PORT%
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:%PORT%/portal.html"
echo Server is running. Press Ctrl+C or close this window to stop.
echo.
cmd /k
goto :eof

:NOLIB
echo [ERROR] libs\three.min.js not found! Run download_dep.bat once (needs internet).
pause
cmd /k
goto :eof

:NOPY
echo [ERROR] No Python found in PATH.
echo Install Python from https://www.python.org (tick "Add Python to PATH").
echo Or open a terminal in this folder and run: npx -y http-server -p %PORT%
pause
cmd /k
goto :eof
