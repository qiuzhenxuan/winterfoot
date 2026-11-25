@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [冬麓] 没有找到 Node.js。
  echo  请先安装 https://nodejs.org （选 LTS 版本），装好后再双击 start.bat。
  echo.
  pause
  exit /b 1
)
echo Starting Winterfoot on http://127.0.0.1:8090/
start "" http://127.0.0.1:8090/
node server.mjs 8090
pause
