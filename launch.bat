@echo off
REM ============================================================
REM shgb-keepalive 一键启动器
REM 流程: 启动 Edge (CDP 9222) -> 等 CDP 就绪 -> 启动 shgb-keepalive.exe
REM 使用者只需在弹出的 Edge 窗口里手动登录 shgb.cn 一次
REM
REM 双击本文件即可。本脚本不接收任何参数,也不写任何凭证。
REM ============================================================

setlocal

REM 定位脚本所在目录(无论从哪里双击都能正确找到 exe)
set "SCRIPT_DIR=%~dp0"

set "EXE=%SCRIPT_DIR%shgb-keepalive.exe"
set "PROFILE_DIR=D:\EdgeProfile_SBT"
set "CDP_PORT=9222"
set "EDGE_LOG=%SCRIPT_DIR%logs\edge.log"

REM ---- 找 Edge ----
set "EDGE_PATH="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) else (
    echo [ERROR] 找不到 Edge。请安装 Microsoft Edge 或手动修改本脚本中的 EDGE_PATH。
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%logs" mkdir "%SCRIPT_DIR%logs"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

if not exist "%EXE%" (
    echo [ERROR] 找不到 %EXE%。请确认安装完整。
    pause
    exit /b 1
)

echo ============================================================
echo   shgb-keepalive 启动器
echo   Edge profile: %PROFILE_DIR%
echo   CDP port    : %CDP_PORT%
echo ============================================================

REM ---- 杀掉占用 9222 的旧 Edge ----
echo [1/4] 清理 9222 端口上的旧 Edge...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CDP_PORT% ^| findstr LISTENING') do (
    echo       killing PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM ---- 启动 Edge ----
echo [2/4] 启动 Edge (CDP=%CDP_PORT%)...
start "" /B "%EDGE_PATH%" ^
    --remote-debugging-port=%CDP_PORT% ^
    --remote-allow-origins=* ^
    --user-data-dir="%PROFILE_DIR%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-features=TranslateUI,EdgeAutoUpdate,MicrosoftEdgeAutoUpdate,EdgeWalletSidebar ^
    --disable-background-networking ^
    --disable-component-update ^
    --disable-sync ^
    --start-maximized ^
    --window-position=0,0 ^
    > "%EDGE_LOG%" 2>&1

REM ---- 等 CDP 就绪 ----
echo [3/4] 等待 CDP 在 127.0.0.1:%CDP_PORT% 就绪...
set /a attempts=0
:wait_cdp
set /a attempts+=1
if %attempts% GTR 30 (
    echo [ERROR] Edge 30 秒内未暴露 CDP。日志: %EDGE_LOG%
    pause
    exit /b 1
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%CDP_PORT%/json/version).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    if %attempts%==10 echo       等待中 (10s)...
    if %attempts%==20 echo       等待中 (20s)...
    timeout /t 1 /nobreak >nul
    goto wait_cdp
)
echo       OK.

REM ---- 启动主程序 ----
echo [4/4] 启动 shgb-keepalive.exe...
echo.
echo   ==========================
echo   Edge 已经开好,请在弹出的窗口里手动登录 shgb.cn。
echo   登录后脚本会自动开始巡课。
echo   ==========================
echo.
echo   停止:直接关闭本窗口(Edge 不会被关)。
echo   完整卸载:运行 uninstall.bat
echo.

cd /D "%SCRIPT_DIR%"
"%EXE%"

set EXITCODE=%errorlevel%
echo.
if %EXITCODE% NEQ 0 (
    echo [EXIT] shgb-keepalive.exe 退出码 %EXITCODE%,日志: %SCRIPT_DIR%logs\auto-next.log
) else (
    echo [EXIT] shgb-keepalive.exe 已正常退出。
)
pause
endlocal
exit /b %EXITCODE%