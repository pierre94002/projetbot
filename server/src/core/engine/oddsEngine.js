import { computeStructuralFactor } from '../risk/structuralFactors.js';
import { computeExogenousFactor } from '../risk/exogenousFactors.js';
import { removeMargin } from '../market/marginRemoval.js';
import { computeCornersAdjustment } from '../signals/cornersSignal.js';
import { predictResult, temperer } from './resultPrediction.js';
import { findValueBet, fairFromBookmakers, fairFromAllValid } from './valueFinder.js';
import { predictScore } from './scorePrediction.js';

const EXPECTED_GOALS_BOUNDS = { min: 0.5, max: 2.8 };

/**
 * Analyse un match unique en fusionnant trois signaux indépendants :
 * marché (poids fort), structurel — force attaque/défense des deux équipes
 * vs moyenne de la ligue, via Poisson + correction Dixon-Coles (poids
 * moyen) — et exogène — le même modèle structurel, ajusté par la météo/état
 * du terrain (poids faible). Les poids et rho viennent de engineConfig.js.
 * Le signal croisé corners, quand disponible, est calculé et renvoyé pour
 * affichage mais n'influence plus lambda/mu (lien buts futurs pas assez
 * établi pour justifier d'agir sur des mises réelles).
 *
 * Refondu le 23/09/2026 après un test sur 24 000 matchs passés : le résultat
 * se prédit par les cotes (100 % marché par défaut, modèle de buts tempéré
 * quand il n'y a pas de cote — cf. resultPrediction.js), et un pari n'est
 * recommandé que si un bookmaker autorisé paie au-dessus de la probabilité
 * juste du marché (cf. valueFinder.js). L'ancien réglage 70/20/10 et son
 * « edge » à domicile perdaient 5 à 8 % des mises.
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

  // P_marché : cotes du marché (moyenne des bookmakers), marge retirée par
  // la méthode puissance. C'est ce qui prédit le mieux le résultat : 50,3 %
  // de résultats justes sur 13 052 matchs de vérification, avec des
  // probabilités honnêtes (cf. resultPrediction.js). Faute de cote, le
  // modèle de buts prend sa place, TEMPÉRÉ : seul, il annonçait 74 % pour
  // 59 % réalisés. `marketOddsAvailable` reste suivi jusqu'au DTO : un match
  // sans cote ne déclenche jamais de recommandation de pari.
  const marketOddsAvailable =
    Number.isFinite(match.marketOdds?.odds1) &&
    Number.isFinite(match.marketOdds?.oddsDraw) &&
    Number.isFinite(match.marketOdds?.odds2);
  const marketOdds = marketOddsAvailable
    ? { odds1: match.marketOdds.odds1, oddsDraw: match.marketOdds.oddsDraw, odds2: match.marketOdds.odds2 }
    : null;
  const netMarket = marketOddsAvailable ? removeMargin([marketOdds.odds1, marketOdds.oddsDraw, marketOdds.odds2]) : null;
  // La cote juste vient des bookmakers les plus FIABLES quand ils cotent le
  // match (cf. fairFromBookmakers) ; la moyenne de tous ne sert qu'en repli.
  const reference = marketOddsAvailable ? fairFromBookmakers(match.marketOdds?.byBookmaker ?? [], config) : null;
  // Repli pour le PRONOSTIC seulement : la moyenne des lignes saines (jamais
  // une ligne incohérente ni une bourse à carnet vide) ; à défaut, la
  // moyenne transmise si elle est cohérente ; sinon, les statistiques.
  const repli = marketOddsAvailable && !reference
    ? (match.marketOdds?.byBookmaker?.length
        ? fairFromAllValid(match.marketOdds.byBookmaker)?.probabilities
        : !netMarket.anomaly ? netMarket.probabilities : null) ?? null
    : null;
  const sansCotes = temperer(probabilitiesStructural);
  const [marketProbHome, marketProbDraw, marketProbAway] = reference
    ? reference.probabilities
    : repli ?? [sansCotes.home, sansCotes.draw, sansCotes.away];
  const pronosticSurCotes = Boolean(reference || repli);

  // Fusion pondérée : P_final = poids.marché·P_marché + poids.structurel·P_structurel + poids.exogène·P_exogène.
  // Par défaut 100 % marché (cf. engineConfig.js) : sur l'historique, chaque
  // point donné au modèle de buts dégradait la prévision. Over 2.5 / BTTS
  // n'ont pas d'équivalent marché dans cette app (seules les cotes 1N2 sont
  // ingérées) : dérivés de P_exogène, le modèle de buts corrigé.
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

  // Pronostic du résultat : l'issue la plus probable, sa fiabilité mesurée,
  // et d'où elle vient.
  const prediction = predictResult({
    probabilities: { home: probabilities.home, draw: probabilities.draw, away: probabilities.away },
    source: pronosticSurCotes ? 'cotes' : 'statistiques',
    homeName: match.home,
    awayName: match.away,
    bookmakersCount: match.marketOdds?.bookmakersCount ?? null,
    referenceBooks: reference ? reference.books : null
  });

  // Pronostic du score : les buts attendus que fixent les cotes justes,
  // mélangés à la forme des cinq derniers matchs et à la saison (cf.
  // scorePrediction.js) ; sans cote, la forme et la saison seules. Il se
  // cale sur les MÊMES probabilités justes que le pronostic du résultat.
  let scorePrediction = null;
  try {
    scorePrediction = predictScore({
      inputs: match.scoreInputs ?? null,
      fair: pronosticSurCotes ? [marketProbHome, marketProbDraw, marketProbAway] : null,
      predictedOutcome: prediction?.outcome ?? null
    });
  } catch (error) {
    console.warn(`[score] pronostic impossible pour ${match.home} - ${match.away} : ${error.message}`);
  }

  // Recommandation de pari : uniquement quand un bookmaker autorisé paie
  // au-dessus de la cote juste des bookmakers de RÉFÉRENCE (cf.
  // valueFinder.js). Le moteur précédent comparait son propre modèle au
  // marché, à domicile seulement, et perdait 5 à 8 % de ses mises sur
  // l'historique. Sans bookmaker de référence, aucune recommandation.
  const staking = marketOddsAvailable && !reference
    ? { action: 'PASS', stake: null, reason: 'trop_peu_de_bookmakers', candidates: [] }
    : marketOddsAvailable
    ? findValueBet({
        byBookmaker: match.marketOdds?.byBookmaker ?? [],
        fair: reference.probabilities,
        referenceKeys: reference.keys,
        config,
        tiltState,
        bankroll: match.bankroll,
        labels: { home: `${match.home ?? 'Domicile'} gagne`, draw: 'Match nul', away: `${match.away ?? 'Extérieur'} gagne` }
      })
    : { action: 'PASS', stake: null, reason: 'no_market_odds', candidates: [] };
  // Avantage du meilleur pari JOUABLE (dans les limites), recommandé ou non.
  const meilleurAvantage = staking.action === 'RECOMMENDED'
    ? staking.ev
    : (staking.candidates ?? [])
        .filter((c) => c.exclusion !== 'cote_trop_haute' && c.exclusion !== 'avantage_invraisemblable')
        .reduce((m, c) => (m === null || c.ev > m ? c.ev : m), null);

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
      // Sans cote réelle, ces trois valeurs sont une reconstruction interne :
      // les publier comme un prix de marché induirait en erreur.
      available: marketOddsAvailable,
      odds1: marketOddsAvailable ? round(marketOdds.odds1, 2) : null,
      oddsDraw: marketOddsAvailable ? round(marketOdds.oddsDraw, 2) : null,
      odds2: marketOddsAvailable ? round(marketOdds.odds2, 2) : null,
      overroundPercent: marketOddsAvailable ? netMarket.overroundPercent : null,
      anomaly: marketOddsAvailable ? netMarket.anomaly : false,
      bookmakersCount: match.marketOdds?.bookmakersCount ?? null,
      byBookmaker: match.marketOdds?.byBookmaker ?? []
    },
    prediction,
    scorePrediction,
    // Avantage du meilleur pari trouvé (recommandé ou non), en pour cent.
    edgePercent: meilleurAvantage === null ? null : round(meilleurAvantage * 100, 2),
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
