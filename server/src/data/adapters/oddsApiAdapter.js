import { computeMarketConsensus } from '../../sports/football/bookmakerConsensus.js';
import { getLeagueBaselineXg } from '../../sports/football/xgBaseline.js';

/**
 * Convertit un match brut au format "The Odds API" (voir
 * data/fixtures/odds/odds-snapshot.json) en contrat d'entrée du moteur
 * (cf. oddsEngine.js), en agrégeant les bookmakers et en résolvant les
 * métadonnées de compétition associées.
 */
export function adaptOddsApiMatch(rawMatch, competitionsByName, bankroll) {
  if (!rawMatch?.id || !rawMatch.home_team || !rawMatch.away_team || !rawMatch.bookmakers) {
    return null;
  }

  const consensus = computeMarketConsensus(rawMatch.bookmakers, rawMatch.home_team, rawMatch.away_team);
  if (!consensus) return null;

  const competitionMeta = competitionsByName.get(rawMatch.sport_title) ?? {};
  const baselineXg = getLeagueBaselineXg(rawMatch.sport_key, competitionMeta);

  return {
    matchId: rawMatch.id,
    home: rawMatch.home_team,
    away: rawMatch.away_team,
    league: rawMatch.sport_title,
    sportKey: rawMatch.sport_key,
    commenceTime: rawMatch.commence_time,
    bankroll,
    expectedGoals: {
      home: baselineXg.xgHome,
      away: baselineXg.xgAway,
      provider: 'league-baseline'
    },
    marketOdds: {
      odds1: consensus.odds1,
      oddsDraw: consensus.oddsDraw,
      odds2: consensus.odds2,
      bookmakersCount: consensus.bookmakersCount,
      byBookmaker: consensus.perBookmaker
    },
    context: {
      area: competitionMeta.area?.name ?? 'Global',
      tier: competitionMeta.plan ?? 'TIER_STANDARD',
      matchday: competitionMeta.currentSeason?.currentMatchday ?? null
    }
  };
}

export function indexCompetitionsByName(competitions) {
  const index = new Map();
  for (const competition of competitions ?? []) {
    index.set(competition.name, competition);
    index.set(competition.code, competition);
  }
  return index;
}
