@echo off
chcp 65001 >nul
title Watch Together (Dev)
cd /d "%~dp0"
call npm run dev
