@echo off
title AutoAlert - DEPLOY
color 0A
cd /d "%~dp0scripts"
echo.
echo  DEPLOY rules + hosting
echo  Nu inchide fereastra!
echo.
call "%~dp0scripts\deploy-only.bat"
pause