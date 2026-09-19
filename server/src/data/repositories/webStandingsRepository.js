import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_STANDINGS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/standings-web.json');

function readWebStandings() {
  try {
    if (fs.existsSync(WEB_STANDINGS_FILE_PATH)) return JSON.parse(fs.readFileSync(WEB_STANDINGS_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'une table vide plutôt que de faire échouer l'appli.
  }
  return {};
}

/**
 * Classement alimenté quotidiennement par recherche web (cf.
 * server/scripts/merge-standings.mjs), interrogé EN PRIORITÉ par
 * getStandingsByLeagueLabel (standingsService.js) avant l'appel API-Football
 * existant — celui-ci ne sert donc plus que de repli si aucune donnée web
 * n'existe encore pour la compétition demandée. Recherche tolérante (casse,
 * libellé partiel) car le libellé passé par le front ("La Liga - Spain" ou
 * juste "La Liga" selon l'écran) ne correspond pas toujours mot pour mot à
 * la clé stockée.
 */
export function getWebStandings(leagueLabel) {
  if (!leagueLabel) return null;
  const table = readWebStandings();
  const normalized = leagueLabel.trim().toLowerCase();

  const exactKey = Object.keys(table).find((k) => k.toLowerCase() === normalized);
  if (exactKey) return table[exactKey];

  // Libellé sans pays ("La Liga") : même nom de compétition, à condition
  // qu'il n'y en ait qu'une — un simple `includes` servait le classement
  // russe pour "Premier League".
  const baseName = (label) => label.split(' - ')[0].trim();
  const candidates = Object.keys(table).filter((k) => baseName(k.toLowerCase()) === baseName(normalized));
  return candidates.length === 1 ? table[candidates[0]] : null;
}

export function listWebStandingsLeagues() {
  return Object.keys(readWebStandings()).sort();
}
