@echo off
REM ============================================================
REM 启动 Edge,带 --remote-debugging-port=9222
REM 使用独立 user-data-dir,与 cc-haha 主窗口隔离
REM ============================================================

setlocal

set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_PATH% (
    set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
if not exist %EDGE_PATH% (
    echo [ERROR] Edge.exe not found. Edit this script and set EDGE_PATH manually.
    pause
    exit /b 1
)

set PROFILE_DIR=D:\EdgeProfile_SBT
set CDP_PORT=9222
set LOG_FILE=E:\shgb-auto\logs\edge.log

REM 先杀掉占用 9222 端口的旧进程
echo [1/4] Cleaning up previous Edge on port %CDP_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CDP_PORT% ^| findstr LISTENING') do (
    echo   killing PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM 关闭所有 msedge.exe(避免 profile 锁)
echo [2/4] Killing any lingering msedge.exe...
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM 创建 profile 目录
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

REM 启动 Edge,带 CDP 和持久 profile
echo [3/4] Launching Edge with CDP=%CDP_PORT%, profile=%PROFILE_DIR%...
start "" /B %EDGE_PATH% ^
    --remote-debugging-port=%CDP_PORT% ^
    --remote-allow-origins=* ^
    --user-data-dir="%PROFILE_DIR%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-features=TranslateUI,EdgeAutoUpdate,MicrosoftEdgeAutoUpdate ^
    --disable-background-networking ^
    --disable-component-update ^
    --disable-sync ^
    --start-maximized ^
    --window-position=0,0 ^
    > "%LOG_FILE%" 2>&1

REM 等待 CDP 就绪
echo [4/4] Waiting for CDP to be reachable at http://127.0.0.1:%CDP_PORT%...
set /a attempts=0
:wait_loop
set /a attempts+=1
if %attempts% GTR 30 (
    echo [ERROR] Edge did not expose CDP after 30s. Check %LOG_FILE%.
    pause
    exit /b 1
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%CDP_PORT%/json/version).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

echo.
echo [OK] Edge is up. CDP listening on %CDP_PORT%, profile=%PROFILE_DIR%.
echo [NEXT] Open shgb.cn in the Edge window and log in once. Then run auto-next.mjs.
echo        Or just run:  cd /d E:\shgb-auto ^&^& npm start
endlocal