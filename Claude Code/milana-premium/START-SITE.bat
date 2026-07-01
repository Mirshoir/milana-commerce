@echo off
title MILANA PREMIUM - site is running (do not close this window)
cd /d "%~dp0"
echo.
echo  ============================================
echo   MILANA PREMIUM
echo   Site:   http://localhost:4173
echo   Shop:   http://localhost:4173/shop
echo   Admin:  http://localhost:4173/admin
echo  ============================================
echo.
echo  The site works while this window is open.
echo  If the server stops, it restarts in 2 seconds.
echo.
:loop
node server.js
echo.
echo  Server stopped. Restarting in 2 seconds... (close window to quit)
timeout /t 2 /nobreak >nul
goto loop
