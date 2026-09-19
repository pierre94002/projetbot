import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_STATS_DIR = path.resolve(__dirname, '../../../data/runtime/match-stats');

/** Champs renvoyés en pourcentage textuel ("55%"), comme /fixtures/statistics d'API-Football. */
const PERCENTAGE_STAT_KEYS = new Set(['Ball Possession', 'Passes %']);
/** Champs gardés à 2 décimales plutôt qu'arrondis au dixième. */
const DECIMAL_STAT_KEYS = new Set(['expected_goals', 'xgot', 'expected_assists', 'xgot_faced', 'goals_prevented']);
export const DEFAULT_WEB_AVERAGE_SAMPLE_SIZE = 10;

// Cache mémoire invalidé par fichier (mtime) : les fichiers mensuels sont
// réécrits une fois par jour par la tâche de 7h30, inutile de re-parser
// plusieurs Mo à chaque clic sur une équipe.
const shardCache = new Map(); // fichier -> { mtimeMs, entries }

function readAllEntries() {
  let files = [];
  try {
    files = fs.readdirSync(MATCH_STATS_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  } catch {
    return []; // dossier pas encore créé : aucune stat importée pour l'instant.
  }

  const all = [];
  for (const file of files) {
    const fullPath = path.join(MATCH_STATS_DIR, file);
    try {
      const { mtimeMs } = fs.statSync(fullPath);
      const cached = shardCache.get(fullPath);
      if (cached && cached.mtimeMs === mtimeMs) {
        all.push(...cached.entries);
        continue;
      }
      const entries = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      shardCache.set(fullPath, { mtimeMs, entries: Array.isArray(entries) ? entries : [] });
      all.push(...(Array.isArray(entries) ? entries : []));
    } catch {
      // Fichier mensuel corrompu : on l'ignore plutôt que de faire échouer toute l'appli.
    }
  }
  return all;
}

function normalize(name) {
  return (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Côté de l'équipe dans un match : correspondance exacte d'abord, puis floue
 * (teamNameMatch.js) — les sources web n'écrivent pas toujours le nom comme
 * The Odds API ("PSG" / "Paris Saint Germain").
 */
function sideOf(entry, teamName) {
  const target = normalize(teamName);
  if (normalize(entry.homeName) === target) return 'home';
  if (normalize(entry.awayName) === target) return 'away';
  // Flou seulement si UN camp correspond : les deux ("Milan" pour un derby
  // Inter-Milan) ou aucun → le match n'est pas attribué.
  const home = teamNamesLikelyMatch(entry.homeName, teamName);
  const away = teamNamesLikelyMatch(entry.awayName, teamName);
  if (home === away) return null;
  return home ? 'home' : 'away';
}

function toPerspective(entry, side) {
  const other = side === 'home' ? 'away' : 'home';
  const goalsFor = side === 'home' ? entry.homeGoals : entry.awayGoals;
  const goalsAgainst = side === 'home' ? entry.awayGoals : entry.homeGoals;
  const hasScore = goalsFor != null && goalsAgainst != null;
  const teamName = side === 'home' ? entry.homeName : entry.awayName;
  const opponentName = side === 'home' ? entry.awayName : entry.homeName;

  return {
    matchId: entry.matchId,
    matchKey: entry.matchKey,
    date: entry.date,
    league: entry.league,
    home: side === 'home',
    teamName,
    opponent: opponentName,
    score: hasScore ? `${goalsFor}-${goalsAgainst}` : null,
    result: !hasScore ? null : goalsFor > goalsAgainst ? 'V' : goalsFor < goalsAgainst ? 'D' : 'N',
    // Ordre [équipe consultée, adversaire] : même forme que les stats
    // API-Football consommées par MatchStatsPanel ({ teamId, teamName, stats }).
    teams: [
      { teamId: null, teamName, side, stats: entry.teamStats?.[side] ?? {} },
      { teamId: null, teamName: opponentName, side: other, stats: entry.teamStats?.[other] ?? {} }
    ],
    players: {
      team: entry.players?.[side] ?? [],
      opponent: entry.players?.[other] ?? []
    },
    sources: entry.sources ?? [],
    updatedAt: entry.updatedAt ?? null
  };
}

/** Tous les matchs avec stats détaillées d'une équipe, du plus récent au plus ancien. */
export function listTeamMatchStats(teamName, { limit } = {}) {
  if (!teamName) return [];
  const matches = readAllEntries()
    .map((entry) => ({ entry, side: sideOf(entry, teamName) }))
    .filter(({ side }) => side)
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
    .map(({ entry, side }) => toPerspective(entry, side));
  return Number.isFinite(limit) && limit > 0 ? matches.slice(0, limit) : matches;
}

export function getMatchStatsById(matchId) {
  const entry = readAllEntries().find((e) => e.matchId === matchId || e.matchKey === matchId);
  return entry ?? null;
}

/**
 * Moyennes des stats d'équipe sur ses N derniers matchs importés, au même
 * format que getAverageMatchStats (teamStatsService.js) — permet à la modale
 * équipe d'afficher la saison EN COURS plutôt que la saison 2024 du plan
 * gratuit API-Football. `null` si aucun match importé pour cette équipe.
 */
export function getTeamWebAverages(teamName, sampleSize = DEFAULT_WEB_AVERAGE_SAMPLE_SIZE) {
  const matches = listTeamMatchStats(teamName, { limit: sampleSize });
  const withStats = matches.filter((m) => Object.keys(m.teams[0].stats).length > 0);
  if (withStats.length === 0) return null;

  const buckets = { total: {}, home: {}, away: {} };
  let homeMatches = 0;
  let awayMatches = 0;
  for (const match of withStats) {
    if (match.home) homeMatches++;
    else awayMatches++;
    for (const [key, raw] of Object.entries(match.teams[0].stats)) {
      const value = typeof raw === 'number' ? raw : Number(String(raw).replace('%', ''));
      if (!Number.isFinite(value)) continue;
      (buckets.total[key] ??= []).push(value);
      (buckets[match.home ? 'home' : 'away'][key] ??= []).push(value);
    }
  }

  const format = (mean, key) => {
    if (PERCENTAGE_STAT_KEYS.has(key)) return `${mean.toFixed(1)}%`;
    if (DECIMAL_STAT_KEYS.has(key)) return Number(mean.toFixed(2));
    return Number(mean.toFixed(1));
  };
  const build = (bucket) =>
    Object.fromEntries(Object.entries(bucket).map(([key, values]) => [key, format(values.reduce((s, v) => s + v, 0) / values.length, key)]));

  return {
    averages: build(buckets.total),
    homeAverages: build(buckets.home),
    awayAverages: build(buckets.away),
    sampleSize: withStats.length,
    homeSampleSize: homeMatches,
    awaySampleSize: awayMatches,
    requestedSampleSize: sampleSize,
    teamName: withStats[0].teamName,
    firstDate: withStats[withStats.length - 1].date,
    lastDate: withStats[0].date,
    source: 'web'
  };
}

export function getMatchStatsStatus() {
  const all = readAllEntries();
  return {
    count: all.length,
    playersCount: all.reduce((n, e) => n + (e.players?.home?.length ?? 0) + (e.players?.away?.length ?? 0), 0),
    leagues: [...new Set(all.map((e) => e.league).filter(Boolean))].sort(),
    lastMatchDate: all.reduce((latest, e) => (!latest || e.date > latest ? e.date : latest), null),
    lastUpdatedAt: all.reduce((latest, e) => (e.updatedAt && (!latest || e.updatedAt > latest) ? e.updatedAt : latest), null)
  };
}
