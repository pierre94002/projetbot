// Catalogue des marchés football + dérivation du pronostic du moteur pour
// CHAQUE marché déjà calculé par analyzeMatch() (aucun appel API en plus —
// tout vient de la même réponse). Source UNIQUE pour ces libellés — avant ce
// fichier, `MyBetsView.vue` et `safestPicks.js` reconstruisaient chacun leur
// propre version, avec une divergence confirmée en prod ("1N2" vs "Résultat"
// pour le même marché, deux chaînes selon le chemin de code).
//
// Chaque prédiction porte un `marketId`/`params` structurés EN PLUS du
// libellé français `market`/`predictedLabel` (jamais à la place) — ce sont
// ces deux champs que la migration de bets.json/predictions.json vient
// ajouter aux enregistrements existants (cf. server/scripts/migrate-market-shape.js).
import { STAT_KINDS, lineCandidates } from './statMarkets.js';

export const MARKET_LABELS = {
  result: 'Résultat',
  totalGoals: 'Total buts',
  bothTeamsScore: 'Les 2 équipes marquent',
  resultAndTotal: 'Résultat + Total buts',
  teamGoals: (teamName) => `Buts — ${teamName}`,
  // Corners, tirs et tirs cadrés (cf. statMarkets.js), depuis le 01/10/2026.
  totalCorners: 'Total corners',
  totalShots: 'Total tirs',
  totalShotsOnTarget: 'Total tirs cadrés',
  teamCorners: (teamName) => `Corners — ${teamName}`,
  teamShots: (teamName) => `Tirs — ${teamName}`,
  teamShotsOnTarget: (teamName) => `Tirs cadrés — ${teamName}`
};

/** Identifiants de marché par statistique : au total, puis par équipe. */
const STAT_MARKET_IDS = {
  corners: { total: 'totalCorners', team: 'teamCorners' },
  shots: { total: 'totalShots', team: 'teamShots' },
  shotsOnTarget: { total: 'totalShotsOnTarget', team: 'teamShotsOnTarget' }
};

/**
 * Cote minimale d'un pronostic de marché — décision de Pierre le 30/09/2026
 * (« proposer que des cotes à 1,20 minimum »). Sans elle, le moteur
 * journalisait la quasi-certitude de chaque marché : « Plus de 0.5 buts » à
 * 1,05, « Moins de 3.5 buts » d'une équipe à 1,02, toujours « Oui » aux deux
 * équipes qui marquent. Mesuré sur les 17 premiers bilans de l'IA : 94 % de
 * justes sur ces marchés, sans rien apprendre ni à Pierre ni à l'IA qui les
 * jauge. Même plancher que l'affichage de Mes paris (MIN_DISPLAYED_ODDS).
 */
export const COTE_MINIMALE = 1.2;

const GOAL_LINES = [0.5, 1.5, 2.5, 3.5];
const TEAM_GOAL_LINES = GOAL_LINES;
const GOAL_LINE_KEYS = {
  0.5: { over: 'over05', under: 'under05' },
  1.5: { over: 'over15', under: 'under15' },
  2.5: { over: 'over25', under: 'under25' },
  3.5: { over: 'over35', under: 'under35' }
};
// La ligne 0.5 du combiné répète le marché Résultat (« X & Plus de 0.5
// buts » = « X gagne ») : elle n'y est pas proposée.
const RESULT_AND_TOTAL_LINES = ['1.5', '2.5', '3.5'];

/** Cote de l'issue contraire (Moins de X, Non), à défaut d'être fournie. */
function coteContraire(odds) {
  return Number.isFinite(odds) && odds > 1 ? Number((1 / (1 - 1 / odds)).toFixed(2)) : null;
}

/**
 * Parmi des candidats {odds, ...}, le plus probable (cote la plus basse) qui
 * reste coté au moins COTE_MINIMALE : on mesure la précision du moteur sur
 * sa meilleure estimation JOUABLE, jamais sur une quasi-certitude.
 */
function lowestOddsAbove(candidates, minOdds = COTE_MINIMALE) {
  let best = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.odds) || candidate.odds < minOdds) continue;
    if (!best || candidate.odds < best.odds) best = candidate;
  }
  return best;
}

function resultAndTotalLabel(line, key, homeName, awayName) {
  const labels = {
    homeOver: `${homeName} & Plus de ${line} buts`,
    homeUnder: `${homeName} & Moins de ${line} buts`,
    drawOver: `Nul & Plus de ${line} buts`,
    drawUnder: `Nul & Moins de ${line} buts`,
    awayOver: `${awayName} & Plus de ${line} buts`,
    awayUnder: `${awayName} & Moins de ${line} buts`
  };
  return labels[key];
}

/**
 * Pronostic du moteur pour un match, sur tous les marchés déjà calculés par
 * analyzeMatch() : résultat 1N2, total buts (plus ET moins, les 4 lignes),
 * résultat + total buts combinés, les 2 équipes marquent (oui ET non), buts
 * par équipe (les 4 lignes, par équipe). Dans chaque marché : l'issue la plus
 * probable parmi celles cotées au moins COTE_MINIMALE. Un marché sans ligne de
 * repli (Résultat, 2 équipes marquent) dont l'issue la plus probable est sous
 * ce plancher n'a PAS de pronostic : proposer l'outsider à sa place serait un
 * faux pronostic. Corners/tirs cadrés volontairement exclus : sans les
 * moyennes 34 champs (coûteuses, jamais chargées en masse dans ce contexte),
 * aucune tendance n'est calculable honnêtement ici.
 *
 * @param {object} match - le match adapté (home/away/league...).
 * @param {object} analysisResult - le DTO d'analyzeMatch() en cours de construction (trueOdds/market déjà remplis).
 */
export function deriveMarketPredictions(match, analysisResult) {
  const predictions = [];
  const trueOdds = analysisResult.trueOdds;
  // Chaque pronostic porte le plancher sous lequel il a été choisi : les
  // bilans de l'IA ne comptent que les pronostics d'une même règle.
  const push = (prediction) => predictions.push({ ...prediction, minOdds: COTE_MINIMALE });

  // Résultat (1N2) : SEUL marché où l'app dispose d'une vraie cote bookmaker
  // (The Odds API n'est interrogée que sur le marché h2h) — predictedMarketOdds
  // n'existe donc que pour cette entrée. Le plancher vaut pour la cote juste
  // du moteur ET pour celle des bookmakers quand le match est coté : c'est
  // cette dernière qu'on joue réellement.
  const outcomeOptions = [
    { outcome: 'home', odds: trueOdds.home, marketOdds: analysisResult.market?.odds1 ?? null, label: `${match.home} gagne` },
    { outcome: 'draw', odds: trueOdds.draw, marketOdds: analysisResult.market?.oddsDraw ?? null, label: 'Match nul' },
    { outcome: 'away', odds: trueOdds.away, marketOdds: analysisResult.market?.odds2 ?? null, label: `${match.away} gagne` }
  ];
  const result = outcomeOptions.reduce((best, o) => (o.odds < best.odds ? o : best));
  const coteJouable = Math.min(result.odds, Number.isFinite(result.marketOdds) ? result.marketOdds : Infinity);
  if (Number.isFinite(result.odds) && coteJouable >= COTE_MINIMALE) {
    push({
      marketId: 'result',
      params: { outcome: result.outcome },
      market: MARKET_LABELS.result,
      predictedOutcome: result.outcome,
      predictedLabel: result.label,
      predictedOdds: result.odds,
      predictedMarketOdds: result.marketOdds
    });
  }

  const totalGoalsBest = lowestOddsAbove(
    GOAL_LINES.flatMap((line) => {
      const over = trueOdds[GOAL_LINE_KEYS[line].over];
      return [
        { line, side: 'over', odds: over },
        { line, side: 'under', odds: trueOdds[GOAL_LINE_KEYS[line].under] ?? coteContraire(over) }
      ];
    })
  );
  if (totalGoalsBest) {
    push({
      marketId: 'totalGoals',
      params: { line: totalGoalsBest.line, side: totalGoalsBest.side },
      market: MARKET_LABELS.totalGoals,
      predictedOutcome: totalGoalsBest.side,
      predictedLabel: `${totalGoalsBest.side === 'over' ? 'Plus de' : 'Moins de'} ${totalGoalsBest.line} buts`,
      predictedOdds: totalGoalsBest.odds
    });
  }

  if (trueOdds.bothTeamsScore != null) {
    const oui = { outcome: 'yes', label: 'Oui', odds: trueOdds.bothTeamsScore };
    const non = { outcome: 'no', label: 'Non', odds: trueOdds.bothTeamsScoreNo ?? coteContraire(trueOdds.bothTeamsScore) };
    const choix = Number.isFinite(non.odds) && non.odds < oui.odds ? non : oui;
    if (choix.odds >= COTE_MINIMALE) {
      push({
        marketId: 'bothTeamsScore',
        params: { outcome: choix.outcome },
        market: MARKET_LABELS.bothTeamsScore,
        predictedOutcome: choix.outcome,
        predictedLabel: choix.label,
        predictedOdds: choix.odds
      });
    }
  }

  // Le combiné reste dans le camp du résultat le plus probable (même quand le
  // Résultat lui-même est sous le plancher) : sinon deux issues voisines
  // (2,60 contre 2,80) donnaient « Domicile gagne » et « Extérieur & Plus de
  // 1.5 buts » sur le même match.
  if (trueOdds.resultAndTotal) {
    const candidates = [];
    for (const line of RESULT_AND_TOTAL_LINES) {
      for (const [key, odds] of Object.entries(trueOdds.resultAndTotal[line] ?? {})) {
        if (!key.startsWith(result.outcome)) continue;
        candidates.push({ odds, key, line, label: resultAndTotalLabel(line, key, match.home, match.away) });
      }
    }
    const best = lowestOddsAbove(candidates);
    if (best) {
      push({
        marketId: 'resultAndTotal',
        params: { line: Number(best.line), key: best.key },
        market: MARKET_LABELS.resultAndTotal,
        predictedOutcome: best.key,
        predictedLabel: best.label,
        predictedOdds: best.odds
      });
    }
  }

  for (const [bucketKey, side, teamName] of [
    ['homeTeamGoals', 'home', match.home],
    ['awayTeamGoals', 'away', match.away]
  ]) {
    const bucket = trueOdds[bucketKey];
    if (!bucket) continue;
    const candidates = TEAM_GOAL_LINES.flatMap((line) => {
      const keys = GOAL_LINE_KEYS[line];
      return [
        { odds: bucket[keys.over] ?? null, side: 'over', line },
        { odds: bucket[keys.under] ?? null, side: 'under', line }
      ];
    });
    const best = lowestOddsAbove(candidates);
    if (best) {
      const sideLabel = best.side === 'over' ? 'Plus de' : 'Moins de';
      push({
        marketId: 'teamGoals',
        params: { team: side, line: best.line, side: best.side },
        market: MARKET_LABELS.teamGoals(teamName),
        predictedOutcome: best.side,
        predictedLabel: `${teamName} — ${sideLabel} ${best.line} buts`,
        predictedOdds: best.odds
      });
    }
  }

  // Corners, tirs et tirs cadrés : au total puis par équipe, quand le magasin
  // a assez de relevés pour les deux équipes (cf. statMarkets.js).
  const attendus = analysisResult.statExpectations ?? null;
  for (const [kind, ids] of Object.entries(STAT_MARKET_IDS)) {
    const e = attendus?.[kind];
    if (!e) continue;
    const { unit, invKTeam, invKTotal } = STAT_KINDS[kind];
    const sens = (side) => (side === 'over' ? 'Plus de' : 'Moins de');

    const total = lowestOddsAbove(lineCandidates(e.total, invKTotal));
    if (total) {
      push({
        marketId: ids.total,
        params: { line: total.line, side: total.side },
        market: MARKET_LABELS[ids.total],
        predictedOutcome: total.side,
        predictedLabel: `${sens(total.side)} ${total.line} ${unit}`,
        predictedOdds: total.odds
      });
    }
    for (const [side, teamName] of [
      ['home', match.home],
      ['away', match.away]
    ]) {
      const best = lowestOddsAbove(lineCandidates(e[side], invKTeam));
      if (!best) continue;
      push({
        marketId: ids.team,
        params: { team: side, line: best.line, side: best.side },
        market: MARKET_LABELS[ids.team](teamName),
        predictedOutcome: best.side,
        predictedLabel: `${teamName} — ${sens(best.side)} ${best.line} ${unit}`,
        predictedOdds: best.odds
      });
    }
  }

  return predictions;
}
