@echo off
REM Deme Movies - Media Streaming Server Startup Script
REM Windows Batch Script

echo ========================================
echo   Deme Movies - Media Streaming Server
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Make sure to check "Add to PATH" during installation.
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed or not in PATH!
    echo.
    echo npm should come with Node.js. Please reinstall Node.js.
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo [INFO] npm version:
npm --version
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Dependencies not found. Installing...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Dependencies installed!
    echo.
)

REM Check if .env file exists
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo.
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy ".env.example" ".env" >nul
        echo.
        echo [INFO] .env file created! Please edit it and add your TMDB_API_KEY.
        echo [INFO] Get a free API key from: https://www.themoviedb.org/settings/api
        echo.
        echo Press any key to continue anyway, or Ctrl+C to exit and configure...
        pause >nul
    ) else (
        echo [WARNING] .env.example not found. Continuing without API key...
        echo [INFO] Get a free API key from: https://www.themoviedb.org/settings/api
        echo.
    )
)

REM Check if media directory exists
if not exist "media" (
    echo [INFO] Creating media directory...
    mkdir media
    echo.
    echo [INFO] Add your video/audio files to the 'media' folder!
    echo.
)

echo ========================================
echo   Starting Server...
echo ========================================
echo.
echo Server will start at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

REM Add Node.js to PATH if it exists in default location
if exist "C:\Program Files\nodejs" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

REM Start the server
call npm start

pause

