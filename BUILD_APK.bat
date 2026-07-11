@echo off
setlocal EnableExtensions
cd /d "%~dp0android"

echo.
echo === AutoAlert APK Build ===
echo.

if exist "gradlew.bat" (
    call gradlew.bat assembleDebug
    if errorlevel 1 goto :fail
    echo.
    echo APK gata: android\app\build\outputs\apk\debug\app-debug.apk
    goto :end
)

echo Gradle wrapper lipsa. Deschide folderul android\ in Android Studio.
echo Build -^> Build APK
goto :end

:fail
echo Build esuat. Instaleaza Android Studio + SDK.

:end
pause