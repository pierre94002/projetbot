import { standingsFromStore, officialStandings, seasonsForLeague } from '../db/matchStatsRead.js';
import { seasonLabel } from './seasonWindows.js';

/**
 * Classement complet d'une compétition, résolue par son libellé (ex. "La
 * Liga - Spain"), pour une saison (année de début ; la plus récente du
 * magasin par défaut).
 *
 * OFFICIEL d'abord : la table que FotMob publie pour cette saison, relevée
 * par fotMobStandingsRefresh.js. Elle seule connaît les pénalités de
 * points, les points divisés ou conservés à l'entrée des playoffs, les
 * conférences et les départages de chaque fédération. Quand une
 * compétition en publie plusieurs — conférences MLS, Apertura/Clausura,
 * zones argentines — `table` choisit laquelle, la première de la source
 * sinon, et la réponse liste les autres.
 *
 * CALCULÉ ensuite : déduit des résultats du magasin. Exact pour les points
 * bruts, aveugle au règlement ; il sert de repli tant que la table
 * officielle n'a pas été relevée, et de contrôle de l'autre.
 *
 * Plus aucune source hors magasin. La recherche web quotidienne et
 * API-Football servaient de repli : elles ne viennent pas de FotMob, et la
 * règle est qu'hors cotes, tout en vienne. Une compétition sans rencontre
 * ni table relevée n'a donc pas de classement — ce qui est vrai.
 */
export async function getStandingsByLeagueLabel(leagueLabel, { season = null, table = null } = {}) {
  const saison = season ?? seasonsForLeague(leagueLabel)[0]?.season ?? null;

  const officiel = officialStandings(leagueLabel, { season: saison });
  if (officiel?.tables?.length) {
    const choisie = (table && officiel.tables.find((t) => t.name === table)) ?? officiel.tables[0];
    return {
      leagueName: leagueLabel,
      season: officiel.season,
      seasonLabel: officiel.seasonLabel,
      source: 'fotmob',
      official: true,
      fetchedAt: officiel.fetchedAt,
      table: choisie.name,
      tables: officiel.tables.map((t) => t.name),
      rows: choisie.rows
    };
  }

  const local = standingsFromStore(leagueLabel, { season: saison });
  if (local?.rows?.length) {
    return {
      ...local,
      seasonLabel: seasonLabel(leagueLabel, local.season),
      official: false,
      fetchedAt: null,
      table: 'Calculé sur les résultats',
      tables: ['Calculé sur les résultats']
    };
  }
  return null;
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
 * (cf. xgStructural.js).
 *
 * Le classement CALCULÉ porte toujours la répartition domicile/extérieur,
 * puisqu'il vient des rencontres ; la table officielle la porte quand FotMob
 * la publie. À défaut des deux, la moyenne globale par équipe et par match,
 * identique des deux côtés.
 */
export async function getLeagueGoalAverages(leagueLabel) {
  const calcule = standingsFromStore(leagueLabel);
  const fromStore = splitAverages(calcule);
  if (fromStore) return fromStore;

  const officiel = await getStandingsByLeagueLabel(leagueLabel).catch(() => null);
  const fromOfficial = splitAverages(officiel);
  if (fromOfficial) return fromOfficial;

  const table = officiel ?? calcule;
  if (!table?.rows?.length) return null;
  const goals = table.rows.reduce((sum, row) => sum + (row.goalsFor ?? 0), 0);
  const played = table.rows.reduce((sum, row) => sum + (row.played ?? 0), 0);
  if (!played) return null;
  const perTeamMatch = Number((goals / played).toFixed(3));
  return { home: perTeamMatch, away: perTeamMatch };
}
