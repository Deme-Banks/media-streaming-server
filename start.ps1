# Deme Movies - Media Streaming Server Startup Script
# PowerShell Script for Windows

# Prevent script from closing on errors
$ErrorActionPreference = "Continue"
$PSDefaultParameterValues['*:ErrorAction'] = 'Continue'

# Keep window open on errors
trap {
    Write-Host ""
    Write-Host "[ERROR] Script error: $_" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close this window..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deme Movies - Media Streaming Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "[INFO] Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Make sure to check 'Add to PATH' during installation." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "[INFO] npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] npm is not installed or not in PATH!" -ForegroundColor Red
    Write-Host ""
    Write-Host "npm should come with Node.js. Please reinstall Node.js." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Dependencies not found. Installing..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to install dependencies!" -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host ""
        Write-Host "[SUCCESS] Dependencies installed!" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host "[ERROR] Failed to install dependencies: $_" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "[INFO] Dependencies found." -ForegroundColor Green
    Write-Host ""
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "[WARNING] .env file not found!" -ForegroundColor Yellow
    Write-Host ""
    
    if (Test-Path ".env.example") {
        Write-Host "[INFO] Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
        Write-Host ""
        Write-Host "[INFO] .env file created!" -ForegroundColor Green
        Write-Host "[INFO] Please edit .env and add your TMDB_API_KEY." -ForegroundColor Yellow
        Write-Host "[INFO] Get a free API key from: https://www.themoviedb.org/settings/api" -ForegroundColor Cyan
        Write-Host ""
        $continue = Read-Host "Press Enter to continue anyway, or Ctrl+C to exit and configure"
    } else {
        Write-Host "[WARNING] .env.example not found. Continuing without API key..." -ForegroundColor Yellow
        Write-Host "[INFO] Get a free API key from: https://www.themoviedb.org/settings/api" -ForegroundColor Cyan
        Write-Host ""
    }
} else {
    Write-Host "[INFO] .env file found." -ForegroundColor Green
    
    # Check if TMDB_API_KEY is set
    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "TMDB_API_KEY\s*=\s*(.+)" -or $matches[1] -eq "your_tmdb_api_key_here") {
        Write-Host "[WARNING] TMDB_API_KEY not configured in .env file." -ForegroundColor Yellow
        Write-Host "[INFO] You can still use local files and Jikan API (anime) without a key." -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "[INFO] TMDB_API_KEY configured." -ForegroundColor Green
        Write-Host ""
    }
}

# Check if media directory exists
if (-not (Test-Path "media")) {
    Write-Host "[INFO] Creating media directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "media" | Out-Null
    Write-Host ""
    Write-Host "[INFO] Add your video/audio files to the 'media' folder!" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting Server..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server will start at: http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Add Node.js to PATH if it exists in default location
if (Test-Path "C:\Program Files\nodejs") {
    $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
    Write-Host "[INFO] Added Node.js to PATH" -ForegroundColor Green
    Write-Host ""
}

# Change to script directory to ensure we're in the right place
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Start the server - run directly so output streams properly
Write-Host "Starting server..." -ForegroundColor Yellow
Write-Host ""

try {
    # Run npm start directly (this will block until server stops)
    & npm start
} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to start server: $_" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close this window..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# If we get here, server stopped
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Server has stopped." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
