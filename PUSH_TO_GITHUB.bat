@echo off
title Push to GitHub
color 0A

echo ========================================
echo   Push to GitHub
echo ========================================
echo.

REM Check if already has a remote
git remote -v >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Remote repository already configured:
    git remote -v
    echo.
    set /p PUSH="Do you want to push now? (Y/N): "
    if /i "%PUSH%"=="Y" (
        echo.
        echo [INFO] Pushing to GitHub...
        git branch -M main 2>nul
        git push -u origin main
        if %ERRORLEVEL% EQU 0 (
            echo.
            echo [SUCCESS] Pushed to GitHub successfully!
        ) else (
            echo.
            echo [ERROR] Failed to push. Make sure you have:
            echo   - Created the repository on GitHub
            echo   - Set up authentication (SSH key or GitHub CLI)
            echo   - Have write permissions
        )
        echo.
        pause
        exit /b 0
    )
)

echo [INFO] To push to GitHub, you need to:
echo.
echo 1. Create a new repository on GitHub:
echo    https://github.com/new
echo.
echo 2. Do NOT initialize it with README, .gitignore, or license
echo    (we already have these files)
echo.
echo 3. Copy the repository URL (it will look like):
echo    https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
echo.
echo 4. Come back here and press any key to continue...
echo.
pause >nul

echo.
set /p REPO_URL="Enter your GitHub repository URL: "

if "%REPO_URL%"=="" (
    echo [ERROR] No URL provided!
    pause
    exit /b 1
)

echo.
echo [INFO] Adding remote repository...
git remote add origin "%REPO_URL%"

if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Remote might already exist. Trying to update...
    git remote set-url origin "%REPO_URL%"
)

echo [INFO] Remote configured:
git remote -v
echo.

echo [INFO] Renaming branch to 'main'...
git branch -M main 2>nul

echo [INFO] Pushing to GitHub...
echo This may ask for your GitHub username and password/token.
echo.
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   [SUCCESS] Pushed to GitHub!
    echo ========================================
    echo.
    echo Your code is now on GitHub at:
    echo %REPO_URL%
    echo.
) else (
    echo.
    echo [ERROR] Failed to push to GitHub.
    echo.
    echo Common issues:
    echo - Authentication: Use a Personal Access Token instead of password
    echo   Get one at: https://github.com/settings/tokens
    echo - Repository doesn't exist: Make sure you created it first
    echo - Permissions: Make sure you have write access
    echo.
)

pause
