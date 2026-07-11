@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE=C:\Program Files\nodejs\node.exe"
set "FBJS=%APPDATA%\npm\node_modules\firebase-tools\lib\bin\firebase.js"

if not exist "%NODE%" (echo ERROR: Node.js lipseste & exit /b 1)
if not exist "%FBJS%" (echo ERROR: firebase-tools lipseste & exit /b 1)

"%NODE%" "%FBJS%" login
exit /b %ERRORLEVEL%