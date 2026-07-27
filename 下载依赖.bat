@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist libs mkdir libs

set "OUT=libs\three.min.js"

REM Skip if already downloaded (size > 100KB)
if exist "%OUT%" (
  for %%A in ("%OUT%") do if %%~zA GTR 100000 (
    echo Three.js already present, nothing to do.
    goto :end
  )
)

set "U1=https://registry.npmmirror.com/three/0.159.0/files/build/three.min.js"
set "U2=https://cdn.bootcdn.net/ajax/libs/three.js/r159/three.min.js"
set "U3=https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js"
set "U4=https://unpkg.com/three@0.159.0/build/three.min.js"

set "OK=0"

where curl.exe >nul 2>nul
if %errorlevel%==0 (
  for %%U in ("%U1%" "%U2%" "%U3%" "%U4%") do (
    echo Trying %%U
    curl.exe -L -f -s -o "%OUT%" "%%U"
    if %errorlevel%==0 (
      for %%A in ("%OUT%") do if %%~zA GTR 100000 (
        echo Downloaded OK: %%U
        set "OK=1"
        goto :done
      )
    )
  )
)

echo curl failed or unavailable, trying PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$urls=@('%U1%','%U2%','%U3%','%U4%'); foreach($u in $urls){ try { Write-Host ('Trying '+$u); (New-Object System.Net.WebClient).DownloadFile($u,'libs\three.min.js'); Write-Host ('OK '+$u); break } catch { Write-Host ('Failed '+$u) } }"
if exist "%OUT%" (
  for %%A in ("%OUT%") do if %%~zA GTR 100000 set "OK=1"
)

:done
if "%OK%"=="1" (
  echo.
  echo SUCCESS. Now double-click portal.html to play offline.
) else (
  echo.
  echo DOWNLOAD FAILED. Your network/firewall may block these hosts.
  echo Easier method: open any of these in your BROWSER and Save As libs\three.min.js
  echo   %U1%
  echo   %U2%
  echo   %U3%
  echo Then double-click portal.html.
)

:end
pause
