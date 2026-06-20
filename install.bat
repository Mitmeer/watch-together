@echo off
chcp 65001 >nul
title Watch Together — Установка
cd /d "%~dp0"

echo.
echo  ========================================
echo   Watch Together — Установка
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден!
    echo Скачайте с https://nodejs.org и установите
    pause
    exit /b 1
)

echo [1/5] Установка npm-зависимостей...
call npm run install:all
if errorlevel 1 goto :error

echo.
echo [2/5] Установка yt-dlp через uv...
where uv >nul 2>&1
if errorlevel 1 (
    echo uv не найден, пробуем pip...
    pip install yt-dlp 2>nul
) else (
    if not exist ".venv" call uv venv
    call uv pip install yt-dlp
)
if errorlevel 1 (
    echo Предупреждение: yt-dlp не установлен автоматически
)

echo.
echo [3/5] Установка FFmpeg...
where ffmpeg >nul 2>&1
if errorlevel 1 (
    where winget >nul 2>&1
    if not errorlevel 1 (
        winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements --silent
    ) else (
        echo Предупреждение: FFmpeg не найден. Установите вручную для лучшей совместимости.
    )
) else (
    echo FFmpeg уже установлен
)

echo.
echo [4/5] Сборка production-версии...
call npm run build
if errorlevel 1 goto :error

echo.
echo [5/5] Создание ярлыка запуска...
echo @echo off > "%USERPROFILE%\Desktop\Watch Together.bat"
echo cd /d "%~dp0" >> "%USERPROFILE%\Desktop\Watch Together.bat"
echo call start.bat >> "%USERPROFILE%\Desktop\Watch Together.bat"

echo.
echo  ========================================
echo   Установка завершена!
echo   Запуск: дважды нажмите start.bat
echo   или ярлык на рабочем столе
echo  ========================================
echo.
pause
exit /b 0

:error
echo.
echo [ОШИБКА] Установка прервана
pause
exit /b 1
