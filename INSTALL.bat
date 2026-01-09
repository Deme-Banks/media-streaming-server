@echo off
title Deme Movies - Install Dependencies
color 0B

echo ========================================
echo   Installing Dependencies
echo ========================================
echo.

REM Change to the script's directory
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Make sure to check "Add to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo [INFO] npm version:
npm --version
echo.

REM Add Node.js to PATH if it exists in default location
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

echo [INFO] Installing dependencies...
echo This may take a few minutes...
echo.

call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to install dependencies!
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Dependencies installed successfully!
echo.
pause
