# AutoAlert Android APK

WebView wrapper pentru https://mferent80-source.github.io/autoalert/

## Cerințe

- Android Studio Ladybug+ sau JDK 17 + Android SDK
- Gradle (inclus în Android Studio)

## Build APK

### Varianta 1 — Android Studio
1. Open → selectează folderul `android/`
2. Build → Build Bundle(s) / APK(s) → Build APK(s)
3. APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### Varianta 2 — linie de comandă
```bat
cd android
gradlew.bat assembleRelease
```
APK release: `app/build/outputs/apk/release/app-release-unsigned.apk`

### Varianta 3 — script rapid (Windows)
Dublu-click pe `BUILD_APK.bat` din rădăcina proiectului.

## Instalare pe telefon
1. Copiază APK pe telefon
2. Activează „Instalare din surse necunoscute"
3. Deschide APK → Instalează

## Shortcut-uri PWA
Pe telefon, din Chrome: Meniu → „Adaugă pe ecranul principal" pentru experiență PWA nativă (recomandat).