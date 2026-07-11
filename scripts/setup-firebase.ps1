# AutoAlert — pași finali Firebase (proiect: datorietrack)
# Rulează din PowerShell:  .\scripts\setup-firebase.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n=== AutoAlert Firebase Setup ===" -ForegroundColor Cyan
Write-Host "Proiect: datorietrack"
Write-Host "RTDB:    https://datorietrack-default-rtdb.europe-west1.firebasedatabase.app"
Write-Host "Config:  firebase-config.js (deja creat, gitignored)`n"

if (-not (Test-Path "firebase-config.js")) {
  Copy-Item "firebase-config.example.js" "firebase-config.js"
  Write-Host "Creat firebase-config.js din example — completează cheile!" -ForegroundColor Yellow
}

Write-Host "1) Console Firebase — Authentication > Sign-in method > Google > Enable"
Write-Host "2) Console Firebase — Authentication > Settings > Authorized domains > adaugă localhost"
Write-Host "3) Deploy: .\scripts\deploy.ps1  (rules + hosting)"
Write-Host "   Manual rules: RTDB > Rules > lipește database.rules.json`n"
Write-Host "4) Live după deploy:"
Write-Host "   https://datorietrack.web.app"
Write-Host "   https://datorietrack.firebaseapp.com`n"

$open = Read-Host "Deschid Console Firebase în browser? (y/n)"
if ($open -eq "y") {
  Start-Process "https://console.firebase.google.com/project/datorietrack/authentication/providers"
  Start-Process "https://console.firebase.google.com/project/datorietrack/database/datorietrack-default-rtdb/rules"
}

$deploy = Read-Host "Rulezi firebase login + deploy acum? (y/n)"
if ($deploy -eq "y") {
  firebase.cmd login
  firebase.cmd deploy --only database
}

Write-Host "`nTest local: python -m http.server 8080  →  http://localhost:8080" -ForegroundColor Green