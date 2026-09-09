import { getStandingsRaw } from './apiFootballClient.js';
import { getCachedValue, setCachedValue } from '../repositories/statsCacheRepository.js';
import { resolveLeagueId, resolveCurrentSeason } from './leagueRegistry.js';

const STANDINGS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Classement complet d'une compétition, résolue par son libellé (ex. "La Liga - Spain"). */
export async function getStandingsByLeagueLabel(leagueLabel) {
  const leagueId = await resolveLeagueId(leagueLabel);
  if (!leagueId) return null;

  const season = resolveCurrentSeason();
  const cacheKey = `standings:${leagueId}:${season}`;
  const cached = getCachedValue(cacheKey, STANDINGS_CACHE_TTL_MS);
  if (cached) return cached;

  const raw = await getStandingsRaw(leagueId, season);
  const table = raw?.[0]?.league?.standings?.[0] ?? [];

  const standings = {
    leagueName: raw?.[0]?.league?.name ?? leagueLabel,
    season,
    rows: table.map((entry) => ({
      rank: entry.rank,
      teamId: entry.team.id,
      teamName: entry.team.name,
      teamLogo: entry.team.logo,
      played: entry.all.played,
      won: entry.all.win,
      drawn: entry.all.draw,
      lost: entry.all.lose,
      goalsFor: entry.all.goals.for,
      goalsAgainst: entry.all.goals.against,
      goalDiff: entry.goalsDiff,
      points: entry.points,
      description: entry.description,
      home: { played: entry.home?.played ?? 0, goalsFor: entry.home?.goals?.for ?? 0, goalsAgainst: entry.home?.goals?.against ?? 0 },
      away: { played: entry.away?.played ?? 0, goalsFor: entry.away?.goals?.for ?? 0, goalsAgainst: entry.away?.goals?.against ?? 0 }
    }))
  };

  return setCachedValue(cacheKey, standings);
}

/**
 * Moyenne réelle de buts marqués à domicile/à l'extérieur sur toute la ligue
 * (Σ buts / Σ matchs joués sur chaque équipe du classement), utilisée comme
 * leagueHomeAvg/leagueAwayAvg dans le calcul structurel de lambda/mu
 * (cf. xgStructural.js). Aucun appel API dédié : dérivée du classement déjà
 * récupéré et caché 12h par getStandingsByLeagueLabel.
 */
export async function getLeagueGoalAverages(leagueLabel) {
  const standings = await getStandingsByLeagueLabel(leagueLabel);
  if (!standings?.rows?.length) return null;

  let homeGoals = 0;
  let homePlayed = 0;
  let awayGoals = 0;
  let awayPlayed = 0;

  for (const row of standings.rows) {
    homeGoals += row.home.goalsFor;
    homePlayed += row.home.played;
    awayGoals += row.away.goalsFor;
    awayPlayed += row.away.played;
  }

  if (homePlayed === 0 || awayPlayed === 0) return null;

  return {
    home: Number((homeGoals / homePlayed).toFixed(3)),
    away: Number((awayGoals / awayPlayed).toFixed(3))
  };
}
