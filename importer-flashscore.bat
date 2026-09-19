@echo off
REM Import FlashScore complet (stats d'equipe de toute la saison, tous championnats)
REM via ton compte Apify. COUT REEL : plafonne a 25 $ (modifiable ci-dessous).
REM Le brut est garde dans server\data\runtime\flashscore-raw\ : relancer avec
REM --convert-only rejoue la conversion sans rien depenser.
cd /d %~dp0server
node scripts\import-flashscore-history.mjs --days -7..0 --from 2025 --max-usd 25
echo.
pause
