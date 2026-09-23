@echo off
REM ============================================================
REM shgb-keepalive 卸载脚本
REM 由 installer 部署到安装目录根,用户双击运行即可。
REM ============================================================

setlocal

set "INSTALL_DIR=%~dp0"
echo ============================================================
echo   shgb-keepalive 卸载
echo   安装目录: %INSTALL_DIR%
echo ============================================================
echo.

REM ---- 杀进程 ----
echo [1/4] Killing shgb-keepalive.exe...
powershell -NoProfile -Command "Get-Process -Name 'shgb-keepalive' -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1

echo [2/4] Killing msedge.exe (会丢失未保存的标签页)...
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM ---- 删除安装目录 ----
echo [3/4] Removing install dir...
cd /D "%TEMP%"
rmdir /S /Q "%INSTALL_DIR%" 2>nul
if exist "%INSTALL_DIR%" (
    echo [ERROR] 删除失败,请手动删除目录。
    pause
    exit /b 1
)

echo [4/4] Edge profile D:\EdgeProfile_SBT 未删除(保留以备其他工具复用)
echo.
echo ============================================================
echo   卸载完成。
echo   如需彻底删除 Edge profile,请手动: rmdir /S /Q D:\EdgeProfile_SBT
echo ============================================================
endlocal
pause