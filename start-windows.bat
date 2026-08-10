@echo off
title Network Sharer Launcher
echo ==================================================
echo         NETWORK SHARER - WINDOWS LAUNCHER
echo ==================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if node_modules directory exists
if not exist "node_modules\" (
    echo [INFO] First time setup: Installing project dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
)

:: Create default .env if missing
if not exist ".env" (
    echo UPLOAD_DIR=uploads > .env
    echo PORT=3000 >> .env
)

echo [INFO] Starting Network Sharer...
echo [INFO] Opening Web UI in your default browser...
echo.

:: Open browser after 2 seconds
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

:: Start Node.js server
call npm start

pause
