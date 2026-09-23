@echo off
REM ============================================================
REM 注册 Windows 计划任务:用户登录后自动跑 auto-next.mjs
REM Edge 需要先起来(CDP 9222)。如果想开机无登录也跑,
REM 改 /ru "SYSTEM" 并去掉 /rl limited,然后重启。
REM ============================================================

setlocal

set TASK_NAME=ShgbAutoLoop
set NODE_SCRIPT=E:\shgb-auto\auto-next.mjs
set NODE_EXE=node.exe

REM 先删旧的(如有)
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM 注册新任务,登录后跑
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "\"%NODE_EXE%\" \"%NODE_SCRIPT%\"" ^
    /sc onlogon ^
    /rl limited ^
    /f

if errorlevel 1 (
    echo [ERROR] failed to create scheduled task.
    pause
    exit /b 1
)

echo [OK] scheduled task "%TASK_NAME%" created.
echo [INFO] will run on next user logon.
echo [INFO] to run now:    schtasks /run /tn "%TASK_NAME%"
echo [INFO] to verify:     schtasks /query /tn "%TASK_NAME%" /v /fo list
echo.
echo [NOTE] Edge must already be running with CDP for this task to work.
echo        Add start-edge.bat to Windows startup folder if you want Edge
echo        to launch automatically:
echo          shell:startup ^(Win+R^) -^> shortcut to start-edge.bat
endlocal