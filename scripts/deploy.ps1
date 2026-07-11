# AutoAlert - deploy RTDB rules + Firebase Hosting
# Run: .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$firebase = 'C:\Users\Cimin\AppData\Roaming\npm\firebase.cmd'
if (-not (Test-Path $firebase)) { $firebase = 'firebase.cmd' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ""
Write-Host "=== AutoAlert Deploy ===" -ForegroundColor Cyan

if (-not (Test-Path "firebase-config.js")) {
  Write-Host "Missing firebase-config.js" -ForegroundColor Red
  exit 1
}

$required = @(
  "index.html", "manifest.json", "service-worker.js", "version.json",
  "css/aa-v1.0.css", "js/aa-core.js", "js/aa-ui.js", "icon-192.png", "icon-512.png"
)
foreach ($f in $required) {
  if (-not (Test-Path $f)) {
    Write-Host "Missing file: $f" -ForegroundColor Red
    exit 1
  }
}

$accounts = & $firebase login:list 2>&1 | Out-String
if ($accounts -match "No authorized accounts") {
  Write-Host "Not logged in. Opening login + deploy window..." -ForegroundColor Yellow
  $cmd = 'cd /d "' + $root + '" && "' + $firebase + '" login && "' + $firebase + '" deploy --only database,hosting && echo DONE && pause'
  Start-Process "cmd.exe" -ArgumentList "/k", $cmd
  Write-Host "Finish login in the new window; deploy runs automatically." -ForegroundColor Green
  exit 0
}

Write-Host "Deploying database rules + hosting..." -ForegroundColor Yellow
& $firebase deploy --only database,hosting
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Live URLs:" -ForegroundColor Green
Write-Host "  https://datorietrack.web.app"
Write-Host "  https://datorietrack.firebaseapp.com"