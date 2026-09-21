import { getStandingsRaw } from './apiFootballClient.js';
import { getCachedValue, setCachedValue } from '../repositories/statsCacheRepository.js';
import { resolveLeagueId, resolveCurrentSeason } from './leagueRegistry.js';
import { getWebStandings } from '../repositories/webStandingsRepository.js';
import { standingsFromStore } from '../db/matchStatsRead.js';

const STANDINGS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function getApiFootballStandings(leagueLabel) {
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
 * Classement complet d'une compétition, résolue par son libellé (ex. "La Liga - Spain").
 *
 * CALCULÉ depuis le magasin en priorité : il contient tous les résultats, la
 * déduction est donc exacte, sans quota ni clé, et elle couvre les
 * championnats qu'aucune des deux autres sources ne connaît. Elle apporte en
 * plus la répartition domicile/extérieur, absente du classement web.
 *
 * La recherche web quotidienne reste en second, et API-Football en dernier :
 * tant qu'une compétition n'a pas de rencontre jouée en magasin — un
 * championnat qui vient d'être ajouté, une coupe entre deux tours — mieux
 * vaut un classement venu d'ailleurs que pas de classement.
 */
export async function getStandingsByLeagueLabel(leagueLabel, { season = null } = {}) {
  try {
    const local = standingsFromStore(leagueLabel, { season });
    if (local?.rows?.length) return local;
  } catch (error) {
    console.warn(`[classement] magasin indisponible pour ${leagueLabel} : ${error.message}`);
  }
  // Une saison PASSÉE ne se cherche que dans le magasin : les deux autres
  // sources ne publient que la saison en cours, et leur répondre « voici le
  // classement » pour une autre année serait un mensonge tranquille.
  if (season) return null;
  return getWebStandings(leagueLabel) ?? getApiFootballStandings(leagueLabel);
}

function splitAverages(standings) {
  if (!standings?.rows?.length) return null;

  let homeGoals = 0;
  let homePlayed = 0;
  let awayGoals = 0;
  let awayPlayed = 0;

  for (const row of standings.rows) {
    homeGoals += row.home?.goalsFor ?? 0;
    homePlayed += row.home?.played ?? 0;
    awayGoals += row.away?.goalsFor ?? 0;
    awayPlayed += row.away?.played ?? 0;
  }

  if (homePlayed === 0 || awayPlayed === 0) return null;
  return {
    home: Number((homeGoals / homePlayed).toFixed(3)),
    away: Number((awayGoals / awayPlayed).toFixed(3))
  };
}

/**
 * Moyenne réelle de buts marqués à domicile/à l'extérieur sur toute la ligue
 * (Σ buts / Σ matchs joués sur chaque équipe du classement), utilisée comme
 * leagueHomeAvg/leagueAwayAvg dans le calcul structurel de lambda/mu
 * (cf. xgStructural.js). Le classement web n'a pas de répartition
 * domicile/extérieur : on prend alors celle du classement API-Football
 * (cache 12h, saison la plus récente du plan), et à défaut la moyenne
 * globale par équipe et par match, identique des deux côtés.
 */
export async function getLeagueGoalAverages(leagueLabel) {
  const webStandings = getWebStandings(leagueLabel);
  const fromWeb = splitAverages(webStandings);
  if (fromWeb) return fromWeb;

  const fromApi = splitAverages(await getApiFootballStandings(leagueLabel).catch(() => null));
  if (fromApi) return fromApi;

  if (!webStandings?.rows?.length) return null;
  const goals = webStandings.rows.reduce((sum, row) => sum + (row.goalsFor ?? 0), 0);
  const played = webStandings.rows.reduce((sum, row) => sum + (row.played ?? 0), 0);
  if (!played) return null;
  const perTeamMatch = Number((goals / played).toFixed(3));
  return { home: perTeamMatch, away: perTeamMatch };
}
