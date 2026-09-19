import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-results.json');

function readResults() {
  try {
    if (fs.existsSync(RESULTS_FILE_PATH)) return JSON.parse(fs.readFileSync(RESULTS_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un journal vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writeResults(results) {
  fs.mkdirSync(path.dirname(RESULTS_FILE_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_FILE_PATH, JSON.stringify(results, null, 2), 'utf8');
}

// `homeGoals`/`awayGoals` sont le nom historique (football) du champ ; un
// futur sport parlerait de "score" plutôt que de "buts" — `homeScore`/
// `awayScore` est donc ajouté EN PLUS (jamais à la place) sur tout ce qui
// est lu ou écrit, sans script de migration séparé : la valeur est
// identique, il ne s'agit que d'exposer aussi le nom neutre.
function withNeutralScoreFields(entry) {
  return { ...entry, homeScore: entry.homeScore ?? entry.homeGoals, awayScore: entry.awayScore ?? entry.awayGoals };
}

export function listMatchResults() {
  return readResults()
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
    .map(withNeutralScoreFields);
}

export function getResultByMatchId(matchId) {
  const found = readResults().find((r) => r.matchId === matchId);
  return found ? withNeutralScoreFields(found) : null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WEB_RESULT_ID = /^web-\d{4}-\d{2}-\d{2}-/;

/**
 * Retrouve le résultat d'une rencontre SANS se fier au seul matchId.
 *
 * Deux espaces d'identifiants coexistent : les matchs affichés par l'appli
 * portent le matchId opaque de The Odds API, tandis que les résultats importés
 * par merge-daily-results.mjs (recherche web) n'ont qu'un id dérivé
 * "web-<date>-<équipes>". Comparer les deux ne donne jamais rien, et sans ce
 * repli un match terminé restait indéfiniment dans la liste des matchs à
 * analyser.
 *
 * D'où l'ordre : d'abord l'égalité de matchId (score saisi à la main depuis
 * Historique moteur), puis le rapprochement par date (±1 jour, pour absorber
 * les décalages de fuseau entre le coup d'envoi UTC et la date du résultat) et
 * par noms d'équipe via le registre partagé.
 *
 * @returns {(matchId: string, day: string, homeName: string, awayName: string) => object|null}
 */
export function createResultLookup(results = listMatchResults()) {
  const byMatchId = new Map(results.map((r) => [r.matchId, r]));
  const webResults = results.filter((r) => typeof r.matchId === 'string' && WEB_RESULT_ID.test(r.matchId));

  return (matchId, day, homeName, awayName) => {
    const direct = byMatchId.get(matchId);
    if (direct) return direct;

    const dayMs = Date.parse(day ?? '');
    if (!Number.isFinite(dayMs)) return null;

    return (
      webResults.find(
        (r) =>
          Math.abs(Date.parse(r.matchId.slice(4, 14)) - dayMs) <= ONE_DAY_MS &&
          teamNamesLikelyMatch(r.homeName, homeName) &&
          teamNamesLikelyMatch(r.awayName, awayName)
      ) ?? null
    );
  };
}

// Un seul résultat par match — une nouvelle saisie sur le même match corrige
// l'ancienne plutôt que de la dupliquer (ex. score corrigé après coup).
export function recordMatchResult({ matchId, homeName, awayName, league, homeGoals, awayGoals }) {
  const results = readResults();
  const now = new Date().toISOString();
  const existing = results.find((r) => r.matchId === matchId);
  if (existing) {
    existing.homeGoals = homeGoals;
    existing.awayGoals = awayGoals;
    existing.homeScore = homeGoals;
    existing.awayScore = awayGoals;
    existing.settledAt = now;
    writeResults(results);
    return withNeutralScoreFields(existing);
  }

  const entry = {
    id: crypto.randomUUID(),
    matchId,
    homeName,
    awayName,
    league: league ?? null,
    homeGoals,
    awayGoals,
    homeScore: homeGoals,
    awayScore: awayGoals,
    settledAt: now
  };
  results.push(entry);
  writeResults(results);
  return entry;
}

/**
 * Résultats locaux impliquant une équipe (nom insensible à la casse), sous
 * l'angle "buts marqués / buts encaissés" de CETTE équipe — sert à enrichir
 * les moyennes de buts (cf. matchEnrichment.js) avec les vrais scores que
 * l'utilisateur a lui-même saisis via "Score final", en plus des statistiques
 * API-Football (qui, sur le plan gratuit, ne couvrent pas les saisons
 * récentes — cf. limites documentées du plan).
 */
export function getResultsForTeam(teamName) {
  const normalized = teamName.trim().toLowerCase();
  return readResults()
    .filter((r) => r.homeName.toLowerCase() === normalized || r.awayName.toLowerCase() === normalized)
    .map((r) => {
      const isHome = r.homeName.toLowerCase() === normalized;
      return { matchId: r.matchId, isHome, goalsFor: isHome ? r.homeGoals : r.awayGoals, goalsAgainst: isHome ? r.awayGoals : r.homeGoals };
    });
}
