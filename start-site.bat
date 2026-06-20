@echo off
chcp 65001 >nul
title Watch Together — Публичный сайт
cd /d "%~dp0"

if not exist "client\dist\index.html" (
    echo Сборка не найдена. Запускаю установку...
    call install.bat
)

set NODE_ENV=production
set PORT=3001
set HOST=0.0.0.0

echo.
echo  ========================================
echo   Watch Together — Публичный сайт
echo  ========================================
echo.
echo  Запуск сервера...

start "Watch Together Server" /MIN cmd /c "set NODE_ENV=production&& set PORT=3001&& set HOST=0.0.0.0&& node server/index.js"

echo  Ожидание сервера...
timeout /t 3 /nobreak >nul

echo  Создание публичной ссылки...
if not exist "bin\cloudflared.exe" (
    echo Скачиваю cloudflared...
    mkdir bin 2>nul
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2025.11.1/cloudflared-windows-amd64.exe' -OutFile 'bin\cloudflared.exe'"
)

start "Watch Together Tunnel" /MIN cmd /c "bin\cloudflared.exe tunnel --url http://127.0.0.1:3001 --protocol http2 --no-autoupdate > tunnel-log.txt 2>&1"

echo  Ожидание публичного URL...
timeout /t 8 /nobreak >nul

for /f "tokens=*" %%a in ('findstr /i "trycloudflare.com" tunnel-log.txt 2^>nul') do set TUNNEL_LINE=%%a

echo.
echo  ========================================
echo   САЙТ ЗАПУЩЕН!
echo  ========================================
echo.
echo  Локально:  http://localhost:3001
echo.
echo  Публичная ссылка для друга:
type tunnel-log.txt 2>nul | findstr /i "trycloudflare.com"
echo.
echo  Ссылка также сохранена в файле: SITE_URL.txt
echo.

for /f "tokens=*" %%u in ('findstr /r "https://.*trycloudflare.com" tunnel-log.txt 2^>nul') do (
    echo %%u | findstr /r "https://" > SITE_URL.txt
)

if exist SITE_URL.txt (
    for /f "tokens=*" %%u in (SITE_URL.txt) do (
        echo %%u
        start "" "%%u"
    )
) else (
    start http://localhost:3001
    echo  Не удалось получить публичный URL автоматически.
    echo  Откройте tunnel-log.txt и найдите ссылку trycloudflare.com
)

echo.
echo  НЕ ЗАКРЫВАЙТЕ окна "Watch Together Server" и "Watch Together Tunnel"
echo  Пока они работают — сайт доступен другу из интернета.
echo.
pause
