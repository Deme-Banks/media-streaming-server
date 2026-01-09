@echo off
title Network Connection Check
color 0E

echo ========================================
echo   Network Connection Check
echo ========================================
echo.

cd /d "%~dp0"

echo Checking server status...
echo.

REM Check if server is running
netstat -an | findstr ":3000.*LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Server is running on port 3000
) else (
    echo [ERROR] Server is NOT running on port 3000
    echo Please start the server first!
    echo.
    pause
    exit /b 1
)

echo.
echo Checking firewall rules...
echo.

netsh advfirewall firewall show rule name="Deme Movies Server" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Firewall rule exists
    netsh advfirewall firewall show rule name="Deme Movies Server" | findstr "Enabled\|Profile"
) else (
    echo [WARNING] Firewall rule not found
    echo Run ALLOW_FIREWALL.bat as Administrator
)

echo.
echo ========================================
echo   Connection Information
echo ========================================
echo.

echo To connect from other devices:
echo   1. Make sure all devices are on the SAME WiFi/network
echo   2. Find your computer's IP address (shown below)
echo   3. On your phone/other device, open: http://YOUR_IP:3000
echo.
echo Your IP addresses:
ipconfig | findstr /i "IPv4"
echo.
echo If you see multiple IPs, try each one:
echo   - 192.168.x.x (usually your WiFi)
echo   - 10.x.x.x (sometimes used)
echo   - 172.16.x.x - 172.31.x.x (sometimes used)
echo.
pause
