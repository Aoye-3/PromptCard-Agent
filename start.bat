@echo off
chcp 65001 >nul
echo ======================================
echo PromptCard Manager local development
echo ======================================
echo.

if not exist node_modules (
    echo Installing frontend dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo Dependency installation failed. Check network or npm configuration.
        pause
        exit /b 1
    )
    echo Dependencies installed.
    echo.
)

echo Starting storage service, Agent Runtime, and Vite frontend...
echo Frontend: http://localhost:3000/
echo Storage:  http://127.0.0.1:8002/health
echo.
echo Press Ctrl+C in this window to stop the Vite frontend.
echo Background storage and Agent windows can be closed separately if needed.
echo ======================================
echo.

npm run dev:with-agent

pause
