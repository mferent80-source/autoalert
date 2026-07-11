@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE=C:\Program Files\nodejs\node.exe"
set "FBJS=%APPDATA%\npm\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo === AutoAlert Deploy ===
echo.

if not exist "%NODE%" (
  echo ERROR: Node.js lipseste la %NODE%
  echo Instaleaza Node LTS si reporneste PC-ul.
  pause
  exit /b 1
)

if not exist "%FBJS%" (
  echo ERROR: firebase-tools lipseste.
  echo Ruleaza: npm install -g firebase-tools
  pause
  exit /b 1
)

if not exist "firebase-config.js" (
  echo ERROR: lipseste firebase-config.js
  pause
  exit /b 1
)

echo Pas 1/2: Login Firebase (se deschide browserul)...
"%NODE%" "%FBJS%" login
if errorlevel 1 (
  echo.
  echo Login esuat. Incearca din nou sau ruleaza manual:
  echo   "%NODE%" "%FBJS%" login
  pause
  exit /b 1
)

echo.
echo Pas 2/2: Deploy rules + hosting...
"%NODE%" "%FBJS%" deploy --only database,hosting
if errorlevel 1 (
  echo Deploy esuat.
  pause
  exit /b 1
)

echo.
echo ==============================
echo   GATA - AutoAlert e live!
echo   https://datorietrack.web.app
echo   https://datorietrack.firebaseapp.com
echo ==============================
echo.
pause