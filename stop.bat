@echo off
REM 杀掉 Edge 和 auto-next.mjs 进程
echo [1/2] Killing msedge.exe...
taskkill /F /IM msedge.exe >nul 2>&1

echo [2/2] Killing node.exe (auto-next.mjs)...
wmic process where "name='node.exe' and commandline like '%%auto-next%%'" delete >nul 2>&1

echo [OK] stopped.