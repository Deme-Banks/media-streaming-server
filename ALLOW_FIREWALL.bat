@echo off
title Configure Firewall for Deme Movies Server
color 0B

echo ========================================
echo   Configure Windows Firewall
echo ========================================
echo.
echo This script will allow port 3000 through Windows Firewall
echo so other devices on your network can access the server.
echo.
echo NOTE: This requires Administrator privileges.
echo.
pause

REM Check if running as administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo [INFO] Running as Administrator... ✓
echo.
echo [INFO] Creating firewall rule for port 3000...
echo.

REM Create firewall rule using netsh - allow for ALL profiles (Domain, Private, Public)
netsh advfirewall firewall delete rule name="Deme Movies Server" >nul 2>&1
netsh advfirewall firewall add rule name="Deme Movies Server" dir=in action=allow protocol=TCP localport=3000 profile=any

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Firewall rule created successfully!
    echo.
    echo Port 3000 is now open for incoming connections.
    echo Other devices on your network can now access the server.
    echo.
) else (
    echo [ERROR] Failed to create firewall rule.
    echo.
    echo Try running this script again as Administrator.
    echo.
)

echo.
pause
