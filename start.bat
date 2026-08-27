@echo off
chcp 65001 >nul
title 急诊抢救护理记录多端同步服务

echo ========================================
echo   急诊抢救护理记录多端同步服务
echo ========================================
echo.

REM 检查Node.js是否安装
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [信息] 检测到Node.js已安装
node -v
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo [信息] 首次启动，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo [信息] 依赖安装完成
    echo.
)

echo [信息] 正在启动服务...
echo.
echo ========================================
echo   服务启动成功！
echo   本机访问: http://localhost:3000
echo   局域网访问: http://你的IP:3000
echo   按 Ctrl+C 停止服务
echo ========================================
echo.

node server.js

pause
