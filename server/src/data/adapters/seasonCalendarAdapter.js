import { getLeagueBaselineXg } from '../../sports/football/xgBaseline.js';

/**
 * Convertit une rencontre du calendrier de saison (season-calendar.json,
 * alimenté par la tâche quotidienne) en contrat d'entrée du moteur.
 *
 * Raison d'être : certaines compétitions suivies n'ont AUCUNE cote pendant
 * des semaines — les bookmakers n'ouvrent les divisions inférieures et les
 * marchés secondaires qu'à l'approche du coup d'envoi. Russie, Chine,
 * Bundesliga 2 et Ligue 2 disparaissaient donc entièrement de la page
 * Matchs, alors que leur calendrier, leur classement et leurs statistiques
 * sont complets en local.
 *
 * Ces matchs arrivent SANS `marketOdds`, volontairement : le moteur détecte
 * l'absence (`market.available: false`) et neutralise edge et mise. On
 * affiche ce qu'on sait, jamais une recommandation fondée sur un prix
 * reconstruit.
 */

/** `cal-2026-10-09-zenit-spartak-moscow` → identifiant stable, distinct des ID Odds API (hexadécimaux). */
function toMatchId(entry) {
  return entry.matchId ?? `cal-${entry.date}-${entry.homeName}-${entry.awayName}`;
}

export function adaptSeasonCalendarMatch(entry, bankroll) {
  if (!entry?.homeName || !entry?.awayName || !entry?.date) return null;

  const baselineXg = getLeagueBaselineXg(null, {});

  return {
    matchId: toMatchId(entry),
    home: entry.homeName,
    away: entry.awayName,
    league: entry.league ?? null,
    sportKey: null,
    // Le calendrier ne porte qu'une date, pas d'heure de coup d'envoi : midi
    // UTC évite qu'un match bascule la veille ou le lendemain selon le fuseau
    // d'affichage, sans prétendre à une heure exacte qu'on n'a pas.
    commenceTime: `${entry.date}T12:00:00Z`,
    bankroll,
    hasOdds: false,
    round: entry.round ?? null,
    expectedGoals: {
      home: baselineXg.xgHome,
      away: baselineXg.xgAway,
      provider: 'league-baseline'
    },
    marketOdds: null,
    context: { area: 'Global', tier: 'TIER_STANDARD', matchday: null }
  };
}
