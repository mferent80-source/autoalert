@echo off
title AutoAlert - LOGIN Firebase
color 0B
cd /d "%~dp0scripts"
echo.
echo  LOGIN Firebase - se deschide browserul Google
echo  Nu inchide fereastra!
echo.
call "%~dp0scripts\login-only.bat"
pause