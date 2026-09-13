@echo off
REM Double-clique ce fichier pour demarrer CoteMaster : ca ouvre deux fenetres
REM (backend + interface) qui restent actives independamment de Claude Code —
REM tant que ces deux fenetres restent ouvertes, l'appli tourne, meme si tu
REM fermes Claude Code ou changes de conversation.

start "CoteMaster - Serveur (port 4000)" cmd /k "cd /d %~dp0server && npm run dev"
start "CoteMaster - Interface (port 5173)" cmd /k "cd /d %~dp0ui && npm run dev"

echo.
echo CoteMaster demarre dans deux nouvelles fenetres.
echo Ouvre http://localhost:5173 dans ton navigateur.
echo Pour tout arreter : ferme les deux fenetres ouvertes (ou Ctrl+C dans chacune).
echo.
pause
