@echo off
echo ======================================
echo PromptCard V4 开发服务器启动脚本
echo ======================================
echo.

:: 检查是否安装了依赖
if not exist node_modules (
    echo 检测到未安装项目依赖，正在安装...
    npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败，请检查网络连接或npm配置
        pause
        exit /b 1
    )
    echo 依赖安装成功！
    echo.
)

:: 启动开发服务器
echo 正在启动开发服务器...
echo 访问地址: http://localhost:3000/
echo.
echo 按 Ctrl + C 停止服务器
echo ======================================
echo.

npm run dev

pause
