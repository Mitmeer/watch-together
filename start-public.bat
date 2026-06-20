@echo off
chcp 65001 >nul
title Watch Together — публичный доступ
cd /d "%~dp0"

echo.
echo  Запуск сайта и публичного туннеля...
echo.

where node >nul 2>&1 || (echo Установите Node.js & pause & exit /b 1)

set YT_DLP_PATH=%~dp0.venv\Scripts\yt-dlp.exe
set NODE_ENV=production

start "Watch Together Server" cmd /k "cd /d "%~dp0" && set NODE_ENV=production && set YT_DLP_PATH=%~dp0.venv\Scripts\yt-dlp.exe && node server\index.js"

timeout /t 3 /nobreak >nul

start "Public Tunnel" cmd /k "npx --yes localtunnel --port 3001"

echo.
echo  Локально:  http://localhost:3001
echo  Публично:  смотрите строку "your url is:" в окне Public Tunnel
echo.
echo  Окна Server и Tunnel должны оставаться открытыми!
pause
