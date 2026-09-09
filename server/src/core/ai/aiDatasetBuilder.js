import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { listMatchResults } from '../../data/repositories/matchResultsRepository.js';
import { getCachedEntriesByPrefix } from '../../data/repositories/statsCacheRepository.js';

export const DEFAULT_DATASET_LIMIT = 50;
export const MAX_DATASET_LIMIT = 100; // clamp serveur dur, quel que soit ce que le client demande

// TODO v1.1 : enrichir avec les moyennes 34 champs par équipe une fois le
// fixture matché (clé de cache déjà connue : `avg-stats-v2:${teamId}:${leagueId}:${season}:10`,
// cf. teamStatsService.js) — laissé de côté en v1 pour limiter la taille du
// prompt ; les compositions (lineups) ne sont volontairement pas incluses,
// elles ne sont disponibles qu'à l'approche du coup d'envoi donc inutiles
// pour des matchs déjà joués.

function loadAllCachedFixtures() {
  return getCachedEntriesByPrefix('fixtures:').flatMap((entry) => (Array.isArray(entry.value) ? entry.value : []));
}

/**
 * Le même match apparaît une fois par équipe dans le cache (une entrée
 * `fixtures:{teamId}:{leagueId}:{season}` par équipe qui joue) : dédupliquer
 * par fixture.fixture.id AVANT de juger "un seul candidat = fiable", sinon un
 * vrai match unique serait à tort traité comme ambigu (2 occurrences).
 */
function findMatchingFixture(allFixtures, homeName, awayName) {
  const home = homeName.trim().toLowerCase();
  const away = awayName.trim().toLowerCase();
  const matches = allFixtures.filter(
    (f) => f.teams?.home?.name?.trim().toLowerCase() === home && f.teams?.away?.name?.trim().toLowerCase() === away
  );
  const distinct = [...new Map(matches.map((f) => [f.fixture.id, f])).values()];
  return distinct.length === 1 ? distinct[0] : null; // 0 (pas en cache) ou >1 (vraiment ambigu) -> null, jamais de supposition
}

// Août-octobre = début de saison, novembre-février = milieu, mars-juin = fin
// (juillet = trêve estivale, hors périmètre).
function deriveSeasonPhase(isoDate) {
  if (!isoDate) return 'unknown';
  const month = new Date(isoDate).getMonth() + 1;
  if ([8, 9, 10].includes(month)) return 'early';
  if ([11, 12, 1, 2].includes(month)) return 'mid';
  if ([3, 4, 5, 6].includes(month)) return 'late';
  return 'unknown';
}

// Heuristique : API-Football n'a pas de booléen "coupe" explicite, seulement
// un texte de round. "Regular Season" = championnat, tout le reste (quarts,
// 8es, phase de groupes...) = coupe/knockout.
function deriveCompetitionType(round) {
  if (!round) return 'unknown';
  return round.startsWith('Regular Season') ? 'league' : 'cup';
}

function enrichFromCache(prediction, allFixtures) {
  const fixture = findMatchingFixture(allFixtures, prediction.homeName, prediction.awayName);
  if (!fixture) return { matched: false, venue: null, round: null, competitionType: 'unknown', seasonPhase: 'unknown' };
  return {
    matched: true,
    venue: fixture.fixture.venue ? { name: fixture.fixture.venue.name ?? null, city: fixture.fixture.venue.city ?? null } : null,
    round: fixture.league?.round ?? null,
    competitionType: deriveCompetitionType(fixture.league?.round),
    seasonPhase: deriveSeasonPhase(fixture.fixture?.date)
  };
}

/**
 * Dataset envoyé à l'IA : les N pronostics déjà réglés (corrects/incorrects)
 * les plus récents, avec le résultat réel s'il a été saisi (Historique
 * moteur) et un enrichissement best-effort lieu/round/type de
 * compétition/phase de saison depuis le cache disque déjà constitué par les
 * appels "Moyennes des deux équipes" — aucun nouvel appel API ici.
 */
export function buildAnalysisDataset({ limit = DEFAULT_DATASET_LIMIT } = {}) {
  const cappedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_DATASET_LIMIT), MAX_DATASET_LIMIT);

  const settledAll = listPredictions().filter((p) => p.status === 'correct' || p.status === 'incorrect');
  const settled = [...settledAll].sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt)).slice(0, cappedLimit);

  const results = listMatchResults();
  const allFixtures = loadAllCachedFixtures();

  let enrichedCount = 0;
  const records = settled.map((p) => {
    const result = results.find((r) => r.matchId === p.matchId) ?? null;
    const enrichment = enrichFromCache(p, allFixtures);
    if (enrichment.matched) enrichedCount++;
    return {
      matchId: p.matchId,
      homeTeam: p.homeName,
      awayTeam: p.awayName,
      league: p.league,
      market: p.market,
      predictedLabel: p.predictedLabel,
      predictedOdds: p.predictedOdds,
      edgePercent: p.edgePercent,
      action: p.action,
      outcome: p.status,
      settledAt: p.settledAt,
      result: result ? { homeGoals: result.homeGoals, awayGoals: result.awayGoals } : null,
      enrichment
    };
  });

  return {
    records,
    meta: { requestedLimit: cappedLimit, settledTotalAvailable: settledAll.length, returnedCount: records.length, enrichedCount }
  };
}
