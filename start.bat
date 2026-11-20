@echo off
title AURUM Roulette Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte Node.js 22 oder neuer installieren: https://nodejs.org
  pause
  exit /b 1
)

set NEXT_TELEMETRY_DISABLED=1

if not exist "node_modules\next\package.json" (
  echo Installiere Abhaengigkeiten - einmalig, dauert ein paar Minuten ...
  call npm install --no-fund --no-audit
  if errorlevel 1 goto fehler
)

if not exist ".next\BUILD_ID" (
  echo Baue die App - einmalig ...
  call npm run build
  if errorlevel 1 goto fehler
)

echo.
echo Starte AURUM Roulette ... Fenster offen lassen. Beenden mit Strg+C.
call npm start
goto ende

:fehler
echo.
echo Etwas ist schiefgelaufen - siehe Meldungen oben.
pause

:ende
