@echo off
title HyperFrames Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Install Node.js 22 or newer, then open this file again.
  echo   Opening https://nodejs.org ...
  start "" https://nodejs.org
  echo.
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 pause
