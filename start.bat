@echo off
chcp 65001 >nul
title Watch Together
cd /d "%~dp0"

if not exist "client\dist\index.html" (
    echo Сборка не найдена. Запускаю install.bat...
    call install.bat
)

set NODE_ENV=production
set PORT=3001
set HOST=0.0.0.0
set YT_DLP_PATH=%~dp0.venv\Scripts\yt-dlp.exe

echo.
echo  Запуск Watch Together...
echo  Откроется браузер через 2 секунды
echo  Закройте это окно чтобы остановить сервер
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3001"

node server/index.js
