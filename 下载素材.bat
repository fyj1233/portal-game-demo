@echo off
title Download Game Textures
setlocal
set DIR=%~dp0
set OUT=%DIR%assets\textures
if not exist "%OUT%" mkdir "%OUT%"

echo Downloading free textures (three.js examples) into:
echo %OUT%
echo.

call :get brick_diffuse.jpg textures
call :get brick_bump.jpg textures
call :get hardwood2_diffuse.jpg textures
call :get crate.gif textures
call :get FloorsCheckerboard_S_Diffuse.jpg textures/floors
call :get disturb.jpg textures
call :get Water_1_M_Normal.jpg textures/water

echo.
echo Done. Textures are stored locally and used offline by the game.
pause
goto :eof

:get
if exist "%OUT%\%~1" (
  echo skip %~1
) else (
  echo download %~1
  curl -sL --max-time 40 -o "%OUT%\%~1" "https://threejs.org/examples/%~2/%~1"
)
goto :eof
