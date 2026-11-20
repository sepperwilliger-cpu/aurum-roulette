@echo off
title AURUM Roulette - Link fuer Freunde
cd /d "%~dp0"

rem Kostenloser Cloudflare Quick Tunnel: kein Konto noetig, keine Router-Einstellungen.
rem Voraussetzung: AURUM laeuft bereits (start.bat in einem anderen Fenster).

set "CF=%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe"
if exist "%CF%" goto starten
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared wurde nicht gefunden.
  echo Installieren mit:   winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)
set "CF=cloudflared"

:starten
echo.
echo Gleich erscheint eine Adresse wie  https://irgendwas.trycloudflare.com
echo Diese Adresse an deine Freunde schicken.
echo Fenster offen lassen, solange ihr spielt. Beenden mit Strg+C.
echo.
"%CF%" tunnel --no-autoupdate --url http://localhost:3000
