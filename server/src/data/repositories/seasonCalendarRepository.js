import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALENDAR_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/season-calendar.json');

function readCalendar() {
  try {
    if (fs.existsSync(CALENDAR_FILE_PATH)) return JSON.parse(fs.readFileSync(CALENDAR_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un calendrier vide plutôt que de faire échouer l'appli.
  }
  return [];
}

/**
 * Calendrier de saison (matchs joués + à venir), alimenté quotidiennement
 * par recherche web (cf. server/scripts/merge-season-calendar.mjs), pas par
 * une API — contrairement à /api/matches (odds-api, proche du coup d'envoi
 * seulement) et à /api/match-results (un seul résultat par match saisi
 * manuellement), ce fichier couvre toute la saison d'un coup.
 */
// Une saison commence le 1er juillet : les résultats des saisons précédentes
// (import football-data.co.uk) restent dans le fichier mais ne sont pas
// mélangés au calendrier courant, dont les jours s'affichent sans année.
function currentSeasonStart(now = new Date()) {
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

export function listSeasonCalendar({ league, allSeasons = false } = {}) {
  const seasonStart = currentSeasonStart();
  const filtered = readCalendar().filter((m) => {
    if (!allSeasons && (m.date ?? '') < seasonStart) return false;
    return league ? (m.league ?? '').toLowerCase().includes(league.trim().toLowerCase()) : true;
  });
  return filtered.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function getSeasonCalendarStatus() {
  const all = readCalendar();
  return {
    count: all.length,
    leagues: [...new Set(all.map((m) => m.league).filter(Boolean))].sort(),
    lastUpdatedAt: all.reduce((latest, m) => (m.updatedAt && (!latest || m.updatedAt > latest) ? m.updatedAt : latest), null)
  };
}
