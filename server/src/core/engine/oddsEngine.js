import { computeStructuralFactor } from '../risk/structuralFactors.js';
import { computeExogenousFactor } from '../risk/exogenousFactors.js';
import { removeMargin } from '../market/marginRemoval.js';
import { evaluateStakingDecision } from '../risk/staking.js';
import { computeCornersAdjustment } from '../signals/cornersSignal.js';

const EXPECTED_GOALS_BOUNDS = { min: 0.5, max: 2.8 };
const MARKET_OVERROUND_ESTIMATE = 1.05;

/**
 * Analyse un match unique en fusionnant trois signaux indépendants :
 * marché (poids fort), structurel — force attaque/défense des deux équipes
 * vs moyenne de la ligue, via Poisson + correction Dixon-Coles (poids
 * moyen) — et exogène — le même modèle structurel, ajusté par la météo/état
 * du terrain (poids faible). Les poids et rho viennent de engineConfig.js.
 * Le signal croisé corners, quand disponible, est calculé et renvoyé pour
 * affichage mais n'influence plus lambda/mu (lien buts futurs pas assez
 * établi pour justifier d'agir sur des mises réelles). L'edge et la mise
 * conseillée se basent sur la probabilité fusionnée, pas sur un modèle isolé du
 * marché : ancrer 70% du poids au marché rend l'edge mécaniquement plus
 * conservateur qu'un modèle 100% indépendant — c'est voulu.
 *
 * Orchestrateur sport-agnostique : toute la résolution du taux de base
 * (lambda/mu) et le modèle de probabilités par score viennent de `sport`
 * (cf. sports/sportPort.js) plutôt que d'être importés en dur ici — c'est la
 * frontière qui permettra d'ajouter un futur sport sans toucher ce fichier.
 *
 * @param {object} match - voir `docs contrat` dans matchAdapter.js pour le format attendu.
 * @param {object} config - configuration du moteur (cf. engineConfig.js).
 * @param {object} tiltState - état du coupe-circuit (cf. tiltState.js).
 * @param {object} sport - implémentation Sport active (cf. sports/sportPort.js).
 */
export async function analyzeMatch(match, config, tiltState, sport) {
  if (!match) throw new Error('Données de match manquantes.');
  if (!sport) throw new Error('Sport manquant (cf. sports/sportPort.js#getSport).');

  const base = await sport.model.resolveBaseRates(match, config);
  const structuralHome = computeStructuralFactor(match.structural?.home);
  const structuralAway = computeStructuralFactor(match.structural?.away);

  let lambda = clamp(base.lambda * structuralHome, EXPECTED_GOALS_BOUNDS.min, EXPECTED_GOALS_BOUNDS.max);
  let mu = clamp(base.mu * structuralAway, EXPECTED_GOALS_BOUNDS.min, EXPECTED_GOALS_BOUNDS.max);

  // Signal informatif seulement : le lien entre excès de corners (vs part de
  // xG) et buts futurs n'est pas assez établi pour justifier de modifier
  // lambda/mu, qui pèsent directement sur les mises conseillées. On calcule
  // et on affiche l'écart, sans l'appliquer au calcul.
  const corners = computeCornersAdjustment(
    lambda,
    mu,
    match.expectedCorners?.home,
    match.expectedCorners?.away,
    config.cornersAdjustmentMax
  );

  // P_structurel : le modèle statistique seul (attaque/défense + Dixon-Coles).
  const probabilitiesStructural = sport.model.computeMarketProbabilities(lambda, mu, config);

  // P_exogène : le même modèle, ajusté par météo/état du terrain (neutre =
  // P_structurel tant qu'aucune donnée exogène n'est fournie sur le match).
  const exogenousFactor = computeExogenousFactor(match.exogenous);
  const lambdaExogenous = clamp(lambda * exogenousFactor, EXPECTED_GOALS_BOUNDS.min, EXPECTED_GOALS_BOUNDS.max);
  const muExogenous = clamp(mu * exogenousFactor, EXPECTED_GOALS_BOUNDS.min, EXPECTED_GOALS_BOUNDS.max);
  const probabilitiesExogenous = sport.model.computeMarketProbabilities(lambdaExogenous, muExogenous, config);

  // P_marché : cotes du marché, marge bookmaker retirée.
  const marketOdds = {
    odds1: match.marketOdds?.odds1 ?? (1 / probabilitiesStructural.home) * MARKET_OVERROUND_ESTIMATE,
    oddsDraw: match.marketOdds?.oddsDraw ?? (1 / probabilitiesStructural.draw) * MARKET_OVERROUND_ESTIMATE,
    odds2: match.marketOdds?.odds2 ?? (1 / probabilitiesStructural.away) * MARKET_OVERROUND_ESTIMATE
  };
  const netMarket = removeMargin([marketOdds.odds1, marketOdds.oddsDraw, marketOdds.odds2]);
  const [marketProbHome, marketProbDraw, marketProbAway] = netMarket.probabilities;

  // Fusion pondérée : P_final = poids.marché·P_marché + poids.structurel·P_structurel + poids.exogène·P_exogène.
  // Over 2.5 / BTTS n'ont pas d'équivalent marché dans cette app (seules les
  // cotes 1N2 sont ingérées) : dérivés de P_exogène, la vue la plus complète
  // disponible sans marché.
  const weights = config.weights;
  const probabilities = {
    home: weights.market * marketProbHome + weights.structural * probabilitiesStructural.home + weights.exogenous * probabilitiesExogenous.home,
    draw: weights.market * marketProbDraw + weights.structural * probabilitiesStructural.draw + weights.exogenous * probabilitiesExogenous.draw,
    away: weights.market * marketProbAway + weights.structural * probabilitiesStructural.away + weights.exogenous * probabilitiesExogenous.away,
    over05: probabilitiesExogenous.over05,
    over15: probabilitiesExogenous.over15,
    over25: probabilitiesExogenous.over25,
    over35: probabilitiesExogenous.over35,
    homeTeamGoals: probabilitiesExogenous.homeTeamGoals,
    awayTeamGoals: probabilitiesExogenous.awayTeamGoals,
    bothTeamsScore: probabilitiesExogenous.bothTeamsScore,
    resultAndTotal: probabilitiesExogenous.resultAndTotal
  };

  // Edge positif = notre probabilité fusionnée DÉPASSE celle du marché (mise à
  // l'unité : p_modèle × cote_marché − 1 > 0, équivalent à p_modèle/p_marché
  // − 1). Avant, la division était inversée (p_marché/p_modèle − 1) : ça
  // recommandait un pari précisément quand le marché est PLUS confiant que
  // notre propre modèle sur cette issue — l'inverse d'un vrai value bet.
  const edgeHome = probabilities.home / marketProbHome - 1;

  const staking = evaluateStakingDecision(edgeHome, match.bankroll, lambda, mu, config, tiltState);

  const result = {
    matchId: match.matchId ?? null,
    label: `${match.home ?? 'Domicile'} vs ${match.away ?? 'Extérieur'}`,
    league: match.league ?? null,
    commenceTime: match.commenceTime ?? null,
    expectedGoals: {
      home: round(lambda, 3),
      away: round(mu, 3),
      source: match.expectedGoals?.provider ?? null
    },
    teamStats: match.teamStats ?? null,
    trueOdds: {
      home: round(1 / probabilities.home, 2),
      draw: round(1 / probabilities.draw, 2),
      away: round(1 / probabilities.away, 2),
      over05: round(1 / probabilities.over05, 2),
      over15: round(1 / probabilities.over15, 2),
      over25: round(1 / probabilities.over25, 2),
      over35: round(1 / probabilities.over35, 2),
      homeTeamGoals: roundTeamGoals(probabilities.homeTeamGoals),
      awayTeamGoals: roundTeamGoals(probabilities.awayTeamGoals),
      bothTeamsScore: round(1 / probabilities.bothTeamsScore, 2),
      resultAndTotal: {
        0.5: roundResultAndTotal(probabilities.resultAndTotal[0.5]),
        1.5: roundResultAndTotal(probabilities.resultAndTotal[1.5]),
        2.5: roundResultAndTotal(probabilities.resultAndTotal[2.5]),
        3.5: roundResultAndTotal(probabilities.resultAndTotal[3.5])
      }
    },
    market: {
      odds1: round(marketOdds.odds1, 2),
      oddsDraw: round(marketOdds.oddsDraw, 2),
      odds2: round(marketOdds.odds2, 2),
      overroundPercent: netMarket.overroundPercent,
      bookmakersCount: match.marketOdds?.bookmakersCount ?? null,
      byBookmaker: match.marketOdds?.byBookmaker ?? []
    },
    edgePercent: round(edgeHome * 100, 2),
    staking,
    corners
  };

  // Dérivation du pronostic par marché (source UNIQUE — cf. markets.js) : a
  // besoin du DTO déjà construit (trueOdds/market), donc calculée ici plutôt
  // que par sport.model. Optionnelle : un sport peut ne pas encore implémenter
  // markets.deriveMarketPredictions sans casser le reste de l'analyse.
  if (typeof sport.markets?.deriveMarketPredictions === 'function') {
    result.marketPredictions = sport.markets.deriveMarketPredictions(match, result);
  }

  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals) {
  return Number(value.toFixed(decimals));
}

function roundTeamGoals(bucket) {
  return {
    over05: round(1 / bucket.over05, 2),
    over15: round(1 / bucket.over15, 2),
    over25: round(1 / bucket.over25, 2),
    over35: round(1 / bucket.over35, 2),
    under05: round(1 / bucket.under05, 2),
    under15: round(1 / bucket.under15, 2),
    under25: round(1 / bucket.under25, 2),
    under35: round(1 / bucket.under35, 2)
  };
}

function roundResultAndTotal(bucket) {
  return {
    homeOver: round(1 / bucket.homeOver, 2),
    homeUnder: round(1 / bucket.homeUnder, 2),
    drawOver: round(1 / bucket.drawOver, 2),
    drawUnder: round(1 / bucket.drawUnder, 2),
    awayOver: round(1 / bucket.awayOver, 2),
    awayUnder: round(1 / bucket.awayUnder, 2)
  };
}
