@echo off
title Check Installation
color 0E

echo ========================================
echo   Checking Installation Status
echo ========================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
        echo [INFO] Added Node.js to PATH
        echo.
    ) else (
        echo [ERROR] Node.js is not installed!
        echo.
        echo Please install Node.js from: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

echo [INFO] Node.js version:
node --version
echo [INFO] npm version:
npm --version
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [WARNING] node_modules folder not found!
    echo.
    echo Run INSTALL.bat to install dependencies.
    echo.
    pause
    exit /b 1
)

echo [INFO] Checking required packages...
echo.

REM Check each required package
set MISSING=0

if exist "node_modules\express" (
    echo   [OK] express
) else (
    echo   [MISSING] express
    set MISSING=1
)

if exist "node_modules\cors" (
    echo   [OK] cors
) else (
    echo   [MISSING] cors
    set MISSING=1
)

if exist "node_modules\fs-extra" (
    echo   [OK] fs-extra
) else (
    echo   [MISSING] fs-extra
    set MISSING=1
)

if exist "node_modules\mime-types" (
    echo   [OK] mime-types
) else (
    echo   [MISSING] mime-types
    set MISSING=1
)

if exist "node_modules\uuid" (
    echo   [OK] uuid
) else (
    echo   [MISSING] uuid
    set MISSING=1
)

if exist "node_modules\axios" (
    echo   [OK] axios
) else (
    echo   [MISSING] axios
    set MISSING=1
)

if exist "node_modules\dotenv" (
    echo   [OK] dotenv
) else (
    echo   [MISSING] dotenv
    set MISSING=1
)

if exist "node_modules\express-session" (
    echo   [OK] express-session
) else (
    echo   [MISSING] express-session
    set MISSING=1
)

if exist "node_modules\bcrypt" (
    echo   [OK] bcrypt
) else (
    echo   [MISSING] bcrypt
    set MISSING=1
)

echo.

if %MISSING% EQU 1 (
    echo [WARNING] Some packages are missing!
    echo.
    echo Run INSTALL.bat to install all dependencies.
    echo.
) else (
    echo [SUCCESS] All dependencies are installed!
    echo.
)

REM Check .env file
if exist ".env" (
    echo [OK] .env file exists
) else (
    echo [WARNING] .env file not found
    if exist ".env.example" (
        echo   - You can copy .env.example to .env
    )
)
echo.

REM Check media folder
if exist "media" (
    echo [OK] media folder exists
) else (
    echo [INFO] media folder will be created automatically
)
echo.

echo ========================================
echo   Installation Check Complete
echo ========================================
echo.

if %MISSING% EQU 0 (
    echo Everything looks good! You can run START_SERVER.bat
) else (
    echo Please install missing packages first.
)
echo.

pause
