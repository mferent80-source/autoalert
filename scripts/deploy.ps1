# NU folosi din Cursor - da eroarea 0x800700E8!
# Deschide Explorer: C:\Users\Cimin\AutoAlert
# Dublu-click: 1_LOGIN.bat apoi 2_DEPLOY.bat

Write-Host ""
Write-Host "EROARE 0x800700E8 = Cursor nu poate deschide CMD." -ForegroundColor Red
Write-Host ""
Write-Host "Foloseste una din aceste metode:" -ForegroundColor Yellow
Write-Host "  1) Explorer -> C:\Users\Cimin\AutoAlert -> dublu-click 1_LOGIN.bat"
Write-Host "  2) Win+R -> lipeste: C:\Users\Cimin\AutoAlert\1_LOGIN.bat"
Write-Host "  3) Desktop -> AutoAlert 1-Login.lnk"
Write-Host ""
Write-Host "Dupa login, ruleaza 2_DEPLOY.bat" -ForegroundColor Green
Write-Host ""
Start-Process "explorer.exe" "C:\Users\Cimin\AutoAlert"