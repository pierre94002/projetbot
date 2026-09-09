import { smoothExpectedGoals } from '../../core/xg/xgSmoothing.js';
import { computeStructuralExpectedGoals } from '../../core/xg/xgStructural.js';
import { getLeagueGoalAverages } from '../../data/providers/standingsService.js';
import { getLeagueBaselineXg } from './xgBaseline.js';
import { computeScoreMatrix } from './scoreMatrix.js';

// Sources d'xG fournies explicitement par un humain (Simulateur libre, jeu de
// données de test) : on respecte ce chiffre tel quel plutôt que de le
// recalculer depuis attaque/défense, qui n'a pas de sens sans stats d'équipe.
const MANUAL_XG_PROVIDERS = new Set(['Opta', 'StatsBomb', 'default']);

// Confiance par fournisseur de statistiques — utilisée pour lisser un xG brut
// vers une valeur de référence (cf. xgSmoothing.js, qui reçoit maintenant ce
// nombre en paramètre plutôt que de connaître les fournisseurs football).
const PROVIDER_CONFIDENCE = {
  Opta: 0.9,
  StatsBomb: 0.92,
  'api-football': 0.85,
  default: 0.8
};

/**
 * Résout lambda/mu (buts attendus) de base pour un match, avant application
 * des facteurs structurel/exogène — implémentation football de
 * `sport.model.resolveBaseRates(match, config)`.
 * - xG fourni explicitement par un humain → respecté tel quel (lissé vers une référence).
 * - match réel → force attaque/défense des deux équipes vs moyenne de la ligue (cf. xgStructural.js),
 *   avec repli sur la moyenne de ligue pour un côté sans stats d'équipe (jamais de NaN/crash).
 */
export async function resolveBaseRates(match, config) {
  const homeAdvantage = clamp(match.homeAdvantage ?? config.homeAdvantage, 0.94, 1.06);

  const provider = match.expectedGoals?.provider;
  if (provider && MANUAL_XG_PROVIDERS.has(provider)) {
    const confidenceHome = PROVIDER_CONFIDENCE[provider] ?? PROVIDER_CONFIDENCE.default;
    const xgHome = smoothExpectedGoals(match.expectedGoals?.home, confidenceHome, 1.35);
    const xgAway = smoothExpectedGoals(match.expectedGoals?.away, confidenceHome, 1.15);
    return { lambda: xgHome * homeAdvantage, mu: xgAway / homeAdvantage };
  }

  const league = await resolveLeagueAverages(match);
  const homeGoals = match.teamStats?.home?.goals;
  const awayGoals = match.teamStats?.away?.goals;

  return computeStructuralExpectedGoals({
    homeAttack: homeGoals?.for?.home ?? league.home,
    homeDefense: homeGoals?.against?.home ?? league.away,
    awayAttack: awayGoals?.for?.away ?? league.away,
    awayDefense: awayGoals?.against?.away ?? league.home,
    leagueHomeAvg: league.home,
    leagueAwayAvg: league.away,
    homeAdvantage
  });
}

/** Moyenne de ligue réelle (classement, sans coût API dédié) avec repli sur le barème par palier si indisponible. */
async function resolveLeagueAverages(match) {
  const real = match.league ? await getLeagueGoalAverages(match.league).catch(() => null) : null;
  if (real) return real;

  const fallback = getLeagueBaselineXg(match.sportKey, {});
  return { home: fallback.xgHome, away: fallback.xgAway };
}

/** Implémentation football de `sport.model.computeMarketProbabilities(rateHome, rateAway, config)`. */
export function computeMarketProbabilities(rateHome, rateAway, config) {
  return computeScoreMatrix(rateHome, rateAway, config.defaultCorrelation);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
