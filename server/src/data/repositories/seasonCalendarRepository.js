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

/** Saison d'une date, sous la forme "2024-25". */
function seasonOf(date) {
  const year = Number(String(date).slice(0, 4));
  const month = Number(String(date).slice(5, 7));
  const start = month >= 7 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/**
 * `season` ("2024-25") restreint à une saison précise ; `allSeasons` les
 * renvoie toutes. Sans l'un ni l'autre, seule la saison en cours — le
 * calendrier compte plusieurs saisons d'historique depuis l'import ESPN, et
 * les servir d'un bloc par défaut noierait la journée du jour.
 */
export function listSeasonCalendar({ league, allSeasons = false, season = null } = {}) {
  const seasonStart = currentSeasonStart();
  const filtered = readCalendar().filter((m) => {
    const date = m.date ?? '';
    if (season) {
      if (seasonOf(date) !== season) return false;
    } else if (!allSeasons && date < seasonStart) return false;
    return league ? (m.league ?? '').toLowerCase().includes(league.trim().toLowerCase()) : true;
  });
  return filtered.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function getSeasonCalendarStatus() {
  const all = readCalendar();
  const bySeason = new Map();
  for (const match of all) {
    if (!match?.date) continue;
    const label = seasonOf(match.date);
    if (!bySeason.has(label)) bySeason.set(label, { season: label, matches: 0, finished: 0 });
    const row = bySeason.get(label);
    row.matches++;
    if (match.homeGoals !== null && match.homeGoals !== undefined) row.finished++;
  }

  return {
    count: all.length,
    leagues: [...new Set(all.map((m) => m.league).filter(Boolean))].sort(),
    // Saisons présentes, de la plus récente à la plus ancienne : c'est ce
    // qui alimente le sélecteur de saison côté interface.
    seasons: [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season)),
    currentSeason: seasonOf(currentSeasonStart()),
    lastUpdatedAt: all.reduce((latest, m) => (m.updatedAt && (!latest || m.updatedAt > latest) ? m.updatedAt : latest), null)
  };
}
