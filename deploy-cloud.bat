@echo off
chcp 65001 >nul
title Deploy Watch Together to Cloud
cd /d "%~dp0"

set FLY=%~dp0bin\fly\flyctl.exe

echo.
echo  ========================================
echo   Деплой Watch Together в облако (Fly.io)
echo  ========================================
echo.
echo  Сайт будет работать 24/7 без bat-файлов.
echo  Откроется с телефона и компьютера по одной ссылке.
echo.

if not exist "%FLY%" (
    echo Ошибка: flyctl не найден. Запустите install.bat
    pause
    exit /b 1
)

"%FLY%" auth whoami >nul 2>&1
if errorlevel 1 (
    echo Вход в Fly.io...
    "%FLY%" auth login
)

echo.
echo  Если деплой не удался — добавьте карту (можно виртуальную):
echo  https://fly.io/dashboard/filmerst/billing
echo.
echo  Запуск деплоя...
echo.

"%FLY%" deploy --remote-only

if errorlevel 1 (
    echo.
    echo  Деплой не удался. Альтернатива — Render.com (бесплатно, без карты):
    echo  1. Загрузите проект на GitHub
    echo  2. Зайдите на https://render.com
    echo  3. New ^> Blueprint ^> подключите репозиторий
    echo  4. Render прочитает render.yaml автоматически
    pause
    exit /b 1
)

echo.
"%FLY%" info
echo.
echo  Готово! Ссылка на сайт — в строке Hostname выше.
pause
