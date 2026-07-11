# AutoAlert - deploy RTDB rules + Firebase Hosting
# Run: .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"
$bat = Join-Path $PSScriptRoot "deploy.bat"

Write-Host ""
Write-Host "=== AutoAlert Deploy ===" -ForegroundColor Cyan
Write-Host "Se deschide fereastra CMD (cu Node.js in PATH)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "In fereastra noua:"
Write-Host "  1) firebase login  (browser Google)"
Write-Host "  2) firebase deploy --only database,hosting"
Write-Host ""

Start-Process "cmd.exe" -ArgumentList "/k", "`"$bat`""
Write-Host "Daca fereastra nu apare, dublu-click pe:" -ForegroundColor Green
Write-Host "  $bat"