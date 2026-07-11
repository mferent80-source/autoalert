@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE=C:\Program Files\nodejs\node.exe"
set "FBJS=%APPDATA%\npm\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo === Deploy MANUAL (daca login normal nu merge) ===
echo.
echo 1) Deschide in browser:
echo    https://console.firebase.google.com/project/datorietrack/authentication/providers
echo    - Activeaza Google Sign-In
echo.
echo 2) Reguli RTDB - lipeste database.rules.json aici:
echo    https://console.firebase.google.com/project/datorietrack/database/datorietrack-default-rtdb/rules
echo.
echo 3) Pentru hosting, ai nevoie de token CI:
echo    Ruleaza in CMD (NU din Cursor):
echo      "%NODE%" "%FBJS%" login:ci
echo    Copiaza tokenul si ruleaza:
echo      set FIREBASE_TOKEN=TOKENUL_TAU
echo      "%NODE%" "%FBJS%" deploy --only database,hosting
echo.
pause