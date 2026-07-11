# AutoAlert - deploy RTDB rules + Firebase Hosting
# Run: .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"
$bat = Join-Path $PSScriptRoot "deploy.bat"

Write-Host ""
Write-Host "=== AutoAlert Deploy ===" -ForegroundColor Cyan
Write-Host "Deschid deploy.bat..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Daca nu apare fereastra, dublu-click pe:" -ForegroundColor Green
Write-Host "  $bat"
Write-Host "  sau pe: C:\Users\Cimin\AutoAlert\DEPLOY.cmd"
Write-Host ""

# Lansare directa .bat (evita eroarea 0x800700E8 cu cmd /k)
Start-Process -FilePath $bat -WorkingDirectory $PSScriptRoot