@echo off
setlocal
cd /D E:\shgb-auto

if not exist logs mkdir logs
if not exist "D:\EdgeProfile_SBT" mkdir "D:\EdgeProfile_SBT"

echo ============================================================
echo   shgb-auto one-click launcher
echo ============================================================

REM Find Edge
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" goto edge_ok
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" goto edge_ok
echo [ERROR] Edge.exe not found.
pause
exit /b 1

:edge_ok

REM Kill old Edge
echo [1/4] Killing old Edge on port 9222...
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start Edge with CDP
echo [2/4] Starting Edge with CDP=9222, profile=D:\EdgeProfile_SBT...
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" goto edge_x86
start "" /B "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="D:\EdgeProfile_SBT" --no-first-run --no-default-browser-check --disable-features=TranslateUI,EdgeAutoUpdate,MicrosoftEdgeAutoUpdate,EdgeWalletSidebar --disable-background-networking --disable-component-update --disable-sync --window-position=80,80 --window-size=1280,800 --start-maximized > logs\edge.log 2>&1
goto after_start
:edge_x86
start "" /B "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="D:\EdgeProfile_SBT" --no-first-run --no-default-browser-check --disable-features=TranslateUI,EdgeAutoUpdate,MicrosoftEdgeAutoUpdate,EdgeWalletSidebar --disable-background-networking --disable-component-update --disable-sync --window-position=80,80 --window-size=1280,800 --start-maximized > logs\edge.log 2>&1
:after_start

REM Wait for CDP
echo [3/4] Waiting for CDP at 127.0.0.1:9222...
set /a attempts=0
:wait_cdp
set /a attempts+=1
if %attempts% GTR 30 goto cdp_timeout
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:9222/json/version').StatusCode } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto cdp_ok
if %attempts%==5 echo     waiting... (5s)
if %attempts%==10 echo     waiting... (10s)
if %attempts%==15 echo     waiting... (15s)
if %attempts%==20 echo     waiting... (20s)
if %attempts%==25 echo     waiting... (25s)
timeout /t 1 /nobreak >nul
goto wait_cdp

:cdp_ok
echo     OK.

REM Run auto loop
echo [4/4] Starting auto-next.mjs...
echo     - opens DIRECTORY_URL from config.json
echo     - auto-login (or wait for manual)
echo     - clicks unfinished courses, waits for video end
echo     - watchdog resumes paused video every 30s
echo     - log: logs\auto-next.log
echo     - stop: double-click stop.bat
echo.
node auto-next.mjs

set EXITCODE=%errorlevel%
echo.
echo ============================================================
if %EXITCODE%==0 (
    echo   auto-next exited normally
) else (
    echo   auto-next exited with code %EXITCODE%
    echo   check logs\auto-next.log
)
echo   Edge is still running. Use stop.bat to kill it.
echo ============================================================
if %EXITCODE% NEQ 0 pause
endlocal
exit /b %EXITCODE%

:cdp_timeout
echo.
echo [ERROR] CDP not ready after 30s. See logs\edge.log
pause
exit /b 1