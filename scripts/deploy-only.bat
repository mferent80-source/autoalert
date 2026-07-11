@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE=C:\Program Files\nodejs\node.exe"
set "FBJS=%APPDATA%\npm\node_modules\firebase-tools\lib\bin\firebase.js"

if not exist "firebase-config.js" (echo ERROR: lipseste firebase-config.js & exit /b 1)
if not exist "%NODE%" (echo ERROR: Node.js lipseste & exit /b 1)
if not exist "%FBJS%" (echo ERROR: firebase-tools lipseste & exit /b 1)

"%NODE%" "%FBJS%" deploy --only database,hosting
if errorlevel 1 exit /b 1

echo.
echo ==============================
echo   GATA! AutoAlert e live:
echo   https://datorietrack.web.app
echo ==============================
exit /b 0