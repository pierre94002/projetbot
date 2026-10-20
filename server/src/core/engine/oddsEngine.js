import { computeStructuralFactor } from '../risk/structuralFactors.js';
import { computeExogenousFactor } from '../risk/exogenousFactors.js';
import { removeMargin } from '../market/marginRemoval.js';
import { computeCornersAdjustment } from '../signals/cornersSignal.js';
import { predictResult, temperer } from './resultPrediction.js';
import { fairFromBookmakers, fairFromAllValid } from './valueFinder.js';
import { stakingDuMatch, verdictsDuMatch, comparateurDuMatch } from './verdictPari.js';
import { predictScore } from './scorePrediction.js';
import { numeroDeVersion } from './engineVersions.js';

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
  const resultat = {
    home: weights.market * marketProbHome + weights.structural * probabilitiesStructural.home + weights.exogenous * probabilitiesExogenous.home,
    draw: weights.market * marketProbDraw + weights.structural * probabilitiesStructural.draw + weights.exogenous * probabilitiesExogenous.draw,
    away: weights.market * marketProbAway + weights.structural * probabilitiesStructural.away + weights.exogenous * probabilitiesExogenous.away
  };
  const probabilities = {
    ...resultat,
    over05: probabilitiesExogenous.over05,
    over15: probabilitiesExogenous.over15,
    over25: probabilitiesExogenous.over25,
    over35: probabilitiesExogenous.over35,
    homeTeamGoals: probabilitiesExogenous.homeTeamGoals,
    awayTeamGoals: probabilitiesExogenous.awayTeamGoals,
    bothTeamsScore: probabilitiesExogenous.bothTeamsScore,
    resultAndTotal: alignResultAndTotal(probabilitiesExogenous.resultAndTotal, resultat)
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
  // Étape 7 du plan : quand l'appelant fournit l'heure des cotes de vos
  // bookmakers (`match.fraicheurCotes`, cf. data/cotesDeVosBookmakers.js),
  // une value sur une cote à rafraîchir n'est plus recommandée (cf.
  // fraicheurCotes.js). Sans elle, rien ne change.
  // Étape 8 : la décision vit dans verdictPari.js (stakingDuMatch), le même
  // code qu'ici auparavant, pour que le Repérage et la page « Opportunités du
  // jour », qui lisent un état préparé, prennent EXACTEMENT la même.
  const decision = { disponible: marketOddsAvailable, reference };
  const staking = stakingDuMatch(match, decision, config, tiltState);
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
      // Les issues contraires, pour que chaque marché puisse aussi pronostiquer
      // « Moins de » et « Non » (cf. markets.js, cote minimale).
      under05: round(1 / (1 - probabilities.over05), 2),
      under15: round(1 / (1 - probabilities.over15), 2),
      under25: round(1 / (1 - probabilities.over25), 2),
      under35: round(1 / (1 - probabilities.over35), 2),
      homeTeamGoals: roundTeamGoals(probabilities.homeTeamGoals),
      awayTeamGoals: roundTeamGoals(probabilities.awayTeamGoals),
      bothTeamsScore: round(1 / probabilities.bothTeamsScore, 2),
      bothTeamsScoreNo: round(1 / (1 - probabilities.bothTeamsScore), 2),
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
    // Étape 8 : le verdict de CHACUNE des trois issues (value seulement pour
    // celle que le moteur recommande, sur une cote fraîche ; la raison pour
    // les autres, dont « juge et partie »), le même que lisent le Repérage et
    // la page « Opportunités du jour » (cf. verdictPari.js). Hors du résumé
    // donné à l'IA (curateEngineSummary) : rien ne change pour elle.
    verdicts: verdictsDuMatch(match, { ...decision, staking }, config, tiltState),
    corners
  };
  // Étape 25 du plan (versions du moteur) : le NUMÉRO de la version qui a fait
  // ce calcul (réglages + code du moteur, cf. engineVersions.js), ou null
  // (« sans version ») — repris par chaque pronostic enregistré (journal des
  // pronostics, pronostics gelés, engineSnapshot de l'analyse IA) ; et les
  // probabilités COMPLÈTES de chaque marché, sans passer par la cote juste
  // arrondie, que les enregistreurs gèlent avec chaque pronostic (le juge de
  // l'étape 16 en a besoin). Ni l'un ni l'autre n'entre dans le résumé donné
  // à l'IA (curateEngineSummary).
  result.engineVersion = numeroDeVersion(config, sport.id ?? 'football');
  result.distributions = distributionsDuMoteur(probabilities);

  // L'heure des cotes de vos bookmakers et le réglage qui les juge (étape 7),
  // seulement quand l'appelant les a fournis : la page du match les affiche.
  if (match.fraicheurCotes) {
    result.fraicheurCotes = {
      reglage: match.fraicheurCotes.reglage ?? null,
      coupDEnvoi: match.fraicheurCotes.coupDEnvoi ?? null,
      heureSure: match.fraicheurCotes.heureSure !== false,
      source: match.fraicheurCotes.source ?? null,
      parBookmaker: match.fraicheurCotes.parBookmaker ?? {}
    };
  }

  // Dérivation du pronostic par marché (source UNIQUE — cf. markets.js) : a
  // besoin du DTO déjà construit (trueOdds/market), donc calculée ici plutôt
  // que par sport.model. Optionnelle : un sport peut ne pas encore implémenter
  // markets.deriveMarketPredictions sans casser le reste de l'analyse.
  // Corners, tirs et tirs cadrés attendus (cf. sports/football/statMarkets.js) :
  // affichés et donnés à l'IA, et base des marchés correspondants ci-dessous.
  if (typeof sport.markets?.statExpectations === 'function') {
    result.statExpectations = sport.markets.statExpectations(match);
  }
  // Étape 8 : la cote juste de chaque ligne de corners, tirs et tirs cadrés,
  // par la binomiale négative mesurée (statMarkets.js, lineCandidates) — ce
  // que lit l'onglet « Paris les plus probables » de Mes paris au lieu de
  // refaire une loi de Poisson dans l'interface.
  if (typeof sport.markets?.statLines === 'function') {
    result.statLines = sport.markets.statLines(result.statExpectations ?? null);
  }
  if (typeof sport.markets?.deriveMarketPredictions === 'function') {
    result.marketPredictions = sport.markets.deriveMarketPredictions(match, result);
  }

  // Étape 10 : le comparateur de vos bookmakers — la cote de chacun, côte à
  // côte, l'heure de son relevé, son verdict (findValueBet appliqué à ce seul
  // bookmaker, et la décision du moteur sur le match) et la cote minimale à
  // prendre pour qu'il reste de la value (cf. verdictPari.js, coteMinimale.js).
  // Hors du résumé donné à l'IA (curateEngineSummary) : rien ne change pour elle.
  result.comparateur = comparateurDuMatch(match, { ...decision, staking }, config, tiltState, { marketPredictions: result.marketPredictions ?? [] });

  return result;
}

/**
 * Le combiné « Résultat + Total buts » vient du modèle de buts, le résultat
 * des cotes des bookmakers : sans alignement, le moteur annonçait par exemple
 * « Sampdoria gagne » ET « Avellino & Plus de 0.5 buts » sur le même match
 * (relevé par l'IA le 30/09/2026). Chaque issue du combiné garde la
 * répartition des buts du modèle À RÉSULTAT DONNÉ, mais pèse la probabilité
 * finale de ce résultat.
 */
function alignResultAndTotal(resultAndTotal, resultat) {
  const aligned = {};
  for (const [line, bucket] of Object.entries(resultAndTotal)) {
    const out = { ...bucket };
    for (const side of ['home', 'draw', 'away']) {
      const model = bucket[`${side}Over`] + bucket[`${side}Under`];
      if (!(model > 0)) continue;
      out[`${side}Over`] = (bucket[`${side}Over`] * resultat[side]) / model;
      out[`${side}Under`] = (bucket[`${side}Under`] * resultat[side]) / model;
    }
    aligned[line] = out;
  }
  return aligned;
}

/**
 * Étape 25 du plan : les probabilités de CHAQUE issue de chaque marché que le
 * moteur pronostique, à 6 décimales — le 1N2 final (celui du pronostic), le
 * total de buts et les buts de chaque équipe sur les quatre lignes, les deux
 * équipes marquent, le combiné aligné sur le 1N2. La distribution d'un
 * pronostic se lit ensuite à sa ligne (sports/football/markets.js,
 * distributionDuMarche).
 */
const LIGNES_DE_BUTS = [0.5, 1.5, 2.5, 3.5];
const suffixeDeLigne = (ligne) => String(ligne).replace('.', '');

function distributionsDuMoteur(p) {
  const p6 = (x) => (Number.isFinite(x) ? round(x, 6) : null);
  const equipe = (bucket) =>
    Object.fromEntries(LIGNES_DE_BUTS.map((l) => [l, { over: p6(bucket?.[`over${suffixeDeLigne(l)}`]), under: p6(bucket?.[`under${suffixeDeLigne(l)}`]) }]));
  return {
    result: { home: p6(p.home), draw: p6(p.draw), away: p6(p.away) },
    totalGoals: Object.fromEntries(LIGNES_DE_BUTS.map((l) => [l, { over: p6(p[`over${suffixeDeLigne(l)}`]), under: p6(1 - p[`over${suffixeDeLigne(l)}`]) }])),
    bothTeamsScore: { yes: p6(p.bothTeamsScore), no: p6(1 - p.bothTeamsScore) },
    teamGoals: { home: equipe(p.homeTeamGoals), away: equipe(p.awayTeamGoals) },
    resultAndTotal: Object.fromEntries(
      LIGNES_DE_BUTS.map((l) => [l, Object.fromEntries(['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder'].map((k) => [k, p6(p.resultAndTotal?.[l]?.[k])]))])
    )
  };
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
