@echo off
chcp 65001 >nul
echo ======================================
echo PromptCard Manager desktop dev shell
echo ======================================
echo.

if not exist node_modules (
    echo Installing frontend dependencies...
    call npm.cmd install
    if %errorlevel% neq 0 (
        echo Dependency installation failed. Check network or npm configuration.
        if not "%PROMPTCARD_START_SKIP_PAUSE%"=="1" pause
        exit /b 1
    )
    echo Dependencies installed.
    echo.
)

echo Starting Tauri desktop shell with editable source...
echo Window:   PromptCard Manager Dev Shell
echo Frontend: http://127.0.0.1:3000/
echo Data:     repository-local data folder
echo.
echo The launcher stays visible until the desktop window opens.
echo Normal launches reuse the current shell; Rust or Tauri changes trigger one rebuild.
echo Close the desktop app window to stop the local services.
echo ======================================
echo.

set LAUNCH_ARGS=
if "%PROMPTCARD_DESKTOP_NO_LAUNCH%"=="1" set LAUNCH_ARGS=-NoLaunch

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-desktop-shell.ps1" %LAUNCH_ARGS%
set START_EXIT_CODE=%errorlevel%

if %START_EXIT_CODE% neq 0 (
    if not "%PROMPTCARD_START_SKIP_PAUSE%"=="1" pause
)
exit /b %START_EXIT_CODE%
