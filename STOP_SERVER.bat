@echo off
title Stop Media Server
color 0C

echo ========================================
echo   Stopping Media Server
echo ========================================
echo.

REM Kill node processes running on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [INFO] Found process on port 3000: %%a
    taskkill /F /PID %%a >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [SUCCESS] Server stopped!
    ) else (
        echo [ERROR] Failed to stop server. Try closing the terminal window instead.
    )
)

REM Also try to kill any node processes (less safe, but works)
REM Uncomment the next 2 lines if the above doesn't work:
REM taskkill /F /IM node.exe >nul 2>nul
REM echo [INFO] All Node.js processes stopped.

echo.
pause
