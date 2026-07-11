@echo off
title AutoAlert DEPLOY
color 0A
echo.
echo  ========================================
echo   AutoAlert - Deploy Firebase
echo   NU INCHIDE aceasta fereastra!
echo  ========================================
echo.
cd /d "%~dp0scripts"
call deploy.bat
echo.
echo  ----------------------------------------
echo  Gata sau eroare - vezi mesajele de mai sus
echo  ----------------------------------------
pause