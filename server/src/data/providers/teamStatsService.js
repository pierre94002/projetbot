import {
  searchTeamsRaw,
  getTeamStatisticsRaw,
  getTeamFixturesRaw,
  getFixtureStatisticsRaw,
  searchFixturesByTeamAndDateRaw,
  getFixtureLineupsRaw,
  getPlayersRaw
} from './apiFootballClient.js';
import { getCachedValue, setCachedValue } from '../repositories/statsCacheRepository.js';

const GOALS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CORNERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FIXTURES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TEAM_SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIXTURE_STATS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Courte : une compo se confirme/change dans l'heure précédant le coup
// d'envoi, contrairement aux stats d'un match déjà terminé (figées).
const LINEUPS_CACHE_TTL_MS = 5 * 60 * 1000;
// Score et stats d'un match EN COURS changent en permanence — contrairement
// à FIXTURE_STATS_CACHE_TTL_MS (30 jours, match déjà terminé, figé), un cache
// de plusieurs minutes ici resservirait un score périmé.
const LIVE_MATCH_CACHE_TTL_MS = 60 * 1000;
const PLAYERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Le plan gratuit API-Football rejette toute page > 3 ("Free plans are
// limited to a maximum value of 3 for the Page parameter") — observé le
// 2026-09-14 sur une équipe dont l'effectif (saisonnier + prêts) dépasse les
// 40 joueurs. Plafonné ici plutôt qu'au-dessus de la vraie limite du plan,
// pour renvoyer les 60 premiers joueurs plutôt que de tout faire échouer.
const MAX_PLAYERS_PAGES = 3;
export const DEFAULT_CORNERS_SAMPLE_SIZE = 5;
export const DEFAULT_FORM_SAMPLE_SIZE = 5;
export const DEFAULT_AVERAGE_STATS_SAMPLE_SIZE = 10;

/** Champs renvoyés sous forme de pourcentage textuel ("55%") par /fixtures/statistics. */
const PERCENTAGE_STAT_KEYS = new Set(['Ball Possession', 'Passes %']);
/** Champs numériques à conserver avec 2 décimales (xG, buts évités…) plutôt qu'arrondis à l'entier. */
const DECIMAL_STAT_KEYS = new Set(['expected_goals', 'goals_prevented']);

export async function searchTeams(query) {
  const cacheKey = `team-search:${query.toLowerCase()}`;
  const cached = getCachedValue(cacheKey, TEAM_SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  const results = await searchTeamsRaw(normalizeForApiFootballSearch(query));
  const teams = (results ?? []).map((entry) => ({
    id: entry.team.id,
    name: entry.team.name,
    country: entry.team.country,
    logo: entry.team.logo
  }));

  return setCachedValue(cacheKey, teams);
}

/** Meilleure correspondance d'équipe par nom, pour l'enrichissement automatique d'un match. */
export async function findBestTeamMatch(name) {
  const results = await searchTeams(name);
  return results[0] ?? null;
}

/**
 * Moyenne de buts marqués/encaissés par match (domicile/extérieur/global),
 * telle que renvoyée directement par /teams/statistics. Un seul appel API,
 * mis en cache 24h.
 */
export async function getGoalsAverage(teamId, leagueId, season) {
  const cacheKey = `goals:${teamId}:${leagueId}:${season}`;
  const cached = getCachedValue(cacheKey, GOALS_CACHE_TTL_MS);
  if (cached) return cached;

  const stats = await getTeamStatisticsRaw(teamId, leagueId, season);
  const result = {
    for: {
      home: parseAverage(stats?.goals?.for?.average?.home),
      away: parseAverage(stats?.goals?.for?.average?.away),
      total: parseAverage(stats?.goals?.for?.average?.total)
    },
    against: {
      home: parseAverage(stats?.goals?.against?.average?.home),
      away: parseAverage(stats?.goals?.against?.average?.away),
      total: parseAverage(stats?.goals?.against?.average?.total)
    },
    fixturesPlayed: stats?.fixtures?.played?.total ?? null
  };

  return setCachedValue(cacheKey, result);
}

/**
 * Rencontres terminées d'une équipe pour une saison, triées de la plus
 * récente à la plus ancienne. Un seul appel API, mis en cache 12h — sert de
 * base commune aux corners (nécessite en plus le détail par match) et à la
 * forme récente (directement lisible depuis le score de chaque rencontre).
 */
async function getRecentFinishedFixtures(teamId, leagueId, season) {
  const cacheKey = `fixtures:${teamId}:${leagueId}:${season}`;
  const cached = getCachedValue(cacheKey, FIXTURES_CACHE_TTL_MS);
  if (cached) return cached;

  const fixtures = await getTeamFixturesRaw(teamId, leagueId, season);
  const finished = (fixtures ?? [])
    .filter((fixture) => fixture.fixture.status.short === 'FT')
    .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

  return setCachedValue(cacheKey, finished);
}

/**
 * Forme récente (victoire/nul/défaite) sur les N derniers matchs joués,
 * déduite directement des scores — aucun appel API supplémentaire par
 * rapport à la liste de rencontres déjà récupérée. Passer `sampleSize: null`
 * renvoie l'historique complet de la saison (toujours un seul appel API,
 * déjà récupéré pour toute la saison en une fois).
 */
export async function getRecentForm(teamId, leagueId, season, sampleSize = DEFAULT_FORM_SAMPLE_SIZE) {
  const allFixtures = await getRecentFinishedFixtures(teamId, leagueId, season);
  const recentFixtures = sampleSize ? allFixtures.slice(0, sampleSize) : allFixtures;

  const matches = recentFixtures.map((fixture) => {
    const isHome = fixture.teams.home.id === teamId;
    const goalsFor = isHome ? fixture.goals.home : fixture.goals.away;
    const goalsAgainst = isHome ? fixture.goals.away : fixture.goals.home;
    const opponent = isHome ? fixture.teams.away.name : fixture.teams.home.name;

    let result = 'D';
    if (goalsFor > goalsAgainst) result = 'V';
    else if (goalsFor === goalsAgainst) result = 'N';

    return {
      fixtureId: fixture.fixture.id,
      result,
      opponent,
      score: `${goalsFor}-${goalsAgainst}`,
      date: fixture.fixture.date,
      home: isHome
    };
  });

  return { matches, sampleSize: matches.length, totalPlayed: allFixtures.length, requestedSampleSize: sampleSize };
}

/**
 * Statistiques détaillées d'une rencontre terminée (tirs, possession,
 * corners, fautes, cartons, xG…) pour les deux équipes. Un appel API par
 * match — jamais déclenché automatiquement, mis en cache indéfiniment
 * (un match terminé ne change plus).
 */
export async function getFixtureStatistics(fixtureId) {
  const cacheKey = `fixture-stats:${fixtureId}`;
  const cached = getCachedValue(cacheKey, FIXTURE_STATS_CACHE_TTL_MS);
  if (cached) return cached;

  const raw = await getFixtureStatisticsRaw(fixtureId);
  const teams = (raw ?? []).map((entry) => ({
    teamId: entry.team.id,
    teamName: entry.team.name,
    stats: Object.fromEntries((entry.statistics ?? []).map((stat) => [stat.type, stat.value]))
  }));

  return setCachedValue(cacheKey, teams);
}

/**
 * Moyenne de corners par match, absente de /teams/statistics : on récupère
 * les N derniers matchs de l'équipe puis leurs statistiques détaillées
 * (type "Corner Kicks"), et on moyenne. Coûte jusqu'à N appels API en plus
 * de la liste de rencontres (partagée avec la forme) — mis en cache
 * longuement pour ne pas répéter cette dépense.
 */
export async function getCornersAverage(teamId, leagueId, season, sampleSize = DEFAULT_CORNERS_SAMPLE_SIZE) {
  const cacheKey = `corners:${teamId}:${leagueId}:${season}:${sampleSize}`;
  const cached = getCachedValue(cacheKey, CORNERS_CACHE_TTL_MS);
  if (cached) return cached;

  const recentFinishedFixtures = (await getRecentFinishedFixtures(teamId, leagueId, season)).slice(0, sampleSize);

  const cornersPerFixture = [];

  for (const fixture of recentFinishedFixtures) {
    const teamsStats = await getFixtureStatistics(fixture.fixture.id);
    const cornerValue = teamsStats.find((entry) => entry.teamId === teamId)?.stats['Corner Kicks'];
    if (cornerValue !== null && cornerValue !== undefined) {
      cornersPerFixture.push(Number(cornerValue));
    }
  }

  const result = {
    average: cornersPerFixture.length
      ? Number((cornersPerFixture.reduce((sum, value) => sum + value, 0) / cornersPerFixture.length).toFixed(2))
      : null,
    sampleSize: cornersPerFixture.length,
    requestedSampleSize: sampleSize
  };

  return setCachedValue(cacheKey, result);
}

/**
 * Moyenne de toutes les statistiques détaillées disponibles (tirs,
 * possession, passes, cartons, xG…) sur les N derniers matchs joués, ainsi
 * que les mêmes moyennes séparées domicile/extérieur (le statut domicile de
 * chaque rencontre est déjà connu de `fixture.teams.home.id`, donc aucun
 * appel API supplémentaire par rapport à la moyenne globale). Coûte jusqu'à
 * N appels API (un par match sans statistiques déjà en cache) — jamais
 * déclenché automatiquement, toujours sur action explicite.
 */
export async function getAverageMatchStats(teamId, leagueId, season, sampleSize = DEFAULT_AVERAGE_STATS_SAMPLE_SIZE) {
  // v2 : ajout du split domicile/extérieur — clé changée pour ne pas servir
  // d'anciennes entrées en cache (disque, cf. statsCacheRepository) qui n'ont
  // que la moyenne globale et pas homeAverages/awayAverages.
  const cacheKey = `avg-stats-v2:${teamId}:${leagueId}:${season}:${sampleSize}`;
  const cached = getCachedValue(cacheKey, CORNERS_CACHE_TTL_MS);
  if (cached) return cached;

  const recentFixtures = (await getRecentFinishedFixtures(teamId, leagueId, season)).slice(0, sampleSize);
  const valuesByStat = { total: {}, home: {}, away: {} };
  let matchesWithStats = 0;
  let homeMatches = 0;
  let awayMatches = 0;

  for (const fixture of recentFixtures) {
    const teamsStats = await getFixtureStatistics(fixture.fixture.id);
    const teamEntry = teamsStats.find((entry) => entry.teamId === teamId);
    if (!teamEntry) continue;
    matchesWithStats++;
    const isHome = fixture.teams.home.id === teamId;
    if (isHome) homeMatches++;
    else awayMatches++;

    for (const [key, rawValue] of Object.entries(teamEntry.stats)) {
      const numericValue = parseStatValue(rawValue);
      if (numericValue === null) continue;
      (valuesByStat.total[key] ??= []).push(numericValue);
      (valuesByStat[isHome ? 'home' : 'away'][key] ??= []).push(numericValue);
    }
  }

  const buildAverages = (bucket) =>
    Object.fromEntries(
      Object.entries(bucket).map(([key, values]) => {
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        return [key, formatStatAverage(mean, key)];
      })
    );

  const result = {
    averages: buildAverages(valuesByStat.total),
    homeAverages: buildAverages(valuesByStat.home),
    awayAverages: buildAverages(valuesByStat.away),
    sampleSize: matchesWithStats,
    homeSampleSize: homeMatches,
    awaySampleSize: awayMatches,
    requestedSampleSize: sampleSize
  };
  return setCachedValue(cacheKey, result);
}

/**
 * Composition d'un match réel (aujourd'hui) : résout d'abord la rencontre
 * (équipe + date + saison), puis sa composition. La saison en cours n'est PAS
 * couverte par le plan gratuit API-Football (2022-2024 seulement) : ce cas
 * précis renvoie `available: false, reason: 'season_not_available'` — une
 * limite connue et attendue, pas une erreur technique à faire remonter.
 */
export async function getLiveLineups(teamId, date, season) {
  let fixtures;
  try {
    fixtures = await searchFixturesByTeamAndDateRaw(teamId, date, season);
  } catch (error) {
    if (/plan|season/i.test(error.message)) {
      return { available: false, reason: 'season_not_available', message: error.message };
    }
    throw error;
  }

  const fixture = fixtures?.[0];
  if (!fixture) return { available: false, reason: 'fixture_not_found' };

  const cacheKey = `lineups:${fixture.fixture.id}`;
  const cached = getCachedValue(cacheKey, LINEUPS_CACHE_TTL_MS);
  if (cached) return cached;

  const raw = await getFixtureLineupsRaw(fixture.fixture.id);
  if (!raw?.length) {
    return setCachedValue(cacheKey, { available: false, reason: 'not_published_yet', fixtureId: fixture.fixture.id });
  }

  const result = {
    available: true,
    fixtureId: fixture.fixture.id,
    teams: raw.map((entry) => ({
      teamId: entry.team.id,
      teamName: entry.team.name,
      formation: entry.formation,
      coach: entry.coach?.name ?? null,
      startXI: (entry.startXI ?? []).map((p) => ({ id: p.player.id, name: p.player.name, number: p.player.number, position: p.player.pos, grid: p.player.grid })),
      substitutes: (entry.substitutes ?? []).map((p) => ({ id: p.player.id, name: p.player.name, number: p.player.number, position: p.player.pos }))
    }))
  };
  return setCachedValue(cacheKey, result);
}

/**
 * Score et statistiques en direct d'un match réel (aujourd'hui) : même
 * résolution de la rencontre que getLiveLineups (équipe + date + saison), qui
 * bute sur la même limite du plan gratuit API-Football (saison en cours non
 * couverte) — `available: false, reason: 'season_not_available'` là aussi,
 * pour que l'appelant affiche le même message que pour les compos. Le score
 * et le statut du match viennent gratuitement de la même réponse /fixtures
 * déjà utilisée pour la résolution — aucun appel API supplémentaire pour ça.
 */
export async function getLiveMatchDetails(teamId, date, season) {
  let fixtures;
  try {
    fixtures = await searchFixturesByTeamAndDateRaw(teamId, date, season);
  } catch (error) {
    if (/plan|season/i.test(error.message)) {
      return { available: false, reason: 'season_not_available', message: error.message };
    }
    throw error;
  }

  const fixture = fixtures?.[0];
  if (!fixture) return { available: false, reason: 'fixture_not_found' };

  const cacheKey = `live-match:${fixture.fixture.id}`;
  const cached = getCachedValue(cacheKey, LIVE_MATCH_CACHE_TTL_MS);
  if (cached) return cached;

  const rawStats = await getFixtureStatisticsRaw(fixture.fixture.id).catch(() => []);
  const teams = (rawStats ?? []).map((entry) => ({
    teamId: entry.team.id,
    teamName: entry.team.name,
    stats: Object.fromEntries((entry.statistics ?? []).map((stat) => [stat.type, stat.value]))
  }));

  const result = {
    available: true,
    fixtureId: fixture.fixture.id,
    status: { short: fixture.fixture.status?.short ?? null, long: fixture.fixture.status?.long ?? null, elapsed: fixture.fixture.status?.elapsed ?? null },
    score: { home: fixture.goals?.home ?? null, away: fixture.goals?.away ?? null },
    teams
  };
  return setCachedValue(cacheKey, result);
}

/**
 * Effectif d'une équipe avec les stats individuelles de chaque joueur pour
 * une saison (buts, passes décisives, cartons, note moyenne…). Contrairement
 * aux compositions, une saison PASSÉE (2022-2024) fonctionne normalement sur
 * le plan gratuit — mêmes garanties que les moyennes d'équipe déjà utilisées
 * ailleurs dans l'app.
 */
export async function getTeamPlayers(teamId, season) {
  const cacheKey = `players:${teamId}:${season}`;
  const cached = getCachedValue(cacheKey, PLAYERS_CACHE_TTL_MS);
  if (cached) return cached;

  const players = [];
  let page = 1;
  let totalPages = 1;
  do {
    let body;
    try {
      body = await getPlayersRaw(teamId, season, page);
    } catch (error) {
      // Une erreur en cours de pagination (limite de débit, panne ponctuelle)
      // ne doit pas effacer les joueurs déjà récupérés — mais un échec dès la
      // première page reste une erreur, sinon un effectif vide serait mis en
      // cache 24h.
      if (page === 1) throw error;
      break;
    }
    for (const entry of body.response ?? []) {
      const stats = entry.statistics?.[0] ?? null;
      players.push({
        id: entry.player.id,
        name: entry.player.name,
        age: entry.player.age,
        nationality: entry.player.nationality,
        photo: entry.player.photo,
        position: stats?.games?.position ?? null,
        appearances: stats?.games?.appearences ?? null,
        minutes: stats?.games?.minutes ?? null,
        rating: stats?.games?.rating ? Number(stats.games.rating) : null,
        goals: stats?.goals?.total ?? 0,
        assists: stats?.goals?.assists ?? 0,
        yellowCards: stats?.cards?.yellow ?? 0,
        redCards: stats?.cards?.red ?? 0
      });
    }
    totalPages = body.paging?.total ?? 1;
    page++;
  } while (page <= totalPages && page <= MAX_PLAYERS_PAGES);

  const result = { players: players.sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0)), season };
  if (!players.length) return result;
  return setCachedValue(cacheKey, result);
}

function parseStatValue(raw) {
  if (raw === null || raw === undefined) return null;
  const numeric = typeof raw === 'string' ? Number(raw.replace('%', '').trim()) : Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatStatAverage(mean, key) {
  if (PERCENTAGE_STAT_KEYS.has(key)) return `${mean.toFixed(1)}%`;
  if (DECIMAL_STAT_KEYS.has(key)) return Number(mean.toFixed(2));
  return Number(mean.toFixed(1));
}

function parseAverage(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * L'API rejette toute recherche contenant autre chose que des lettres,
 * chiffres et espaces ("The Search field may only contain alpha-numeric
 * characters and spaces") : les noms accentués (Atlético, Köln, São Paulo…)
 * doivent d'abord être ramenés à leurs équivalents ASCII.
 */
function normalizeForApiFootballSearch(query) {
  return query
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
