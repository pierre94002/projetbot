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
export const MARKET_LABELS = {
  result: 'Résultat',
  totalGoals: 'Total buts',
  bothTeamsScore: 'Les 2 équipes marquent',
  resultAndTotal: 'Résultat + Total buts',
  teamGoals: (teamName) => `Buts — ${teamName}`
};

const TEAM_GOAL_LINES = [0.5, 1.5, 2.5, 3.5];
const TEAM_GOAL_LINE_KEYS = {
  0.5: { over: 'over05', under: 'under05' },
  1.5: { over: 'over15', under: 'under15' },
  2.5: { over: 'over25', under: 'under25' },
  3.5: { over: 'over35', under: 'under35' }
};

/**
 * Parmi des candidats {odds, ...}, celui que le moteur juge le plus probable
 * (cote la plus basse) — sans seuil de type "pari intéressant" (contrairement
 * à safestPicks.js côté frontend) : on mesure ici la précision du moteur sur
 * SA PROPRE meilleure estimation, pas une suggestion de pari, donc même une
 * quasi-certitude doit être journalisée plutôt qu'écartée.
 */
function lowestOdds(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate.odds == null) continue;
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
 * analyzeMatch() : résultat 1N2, total buts (les 4 lignes, la plus probable
 * gardée), résultat + total buts combinés, les 2 équipes marquent, buts par
 * équipe (les 4 lignes, par équipe). Corners/tirs cadrés volontairement
 * exclus : sans les moyennes 34 champs (coûteuses, jamais chargées en masse
 * dans ce contexte), aucune tendance n'est calculable honnêtement ici.
 *
 * @param {object} match - le match adapté (home/away/league...).
 * @param {object} analysisResult - le DTO d'analyzeMatch() en cours de construction (trueOdds/market déjà remplis).
 */
export function deriveMarketPredictions(match, analysisResult) {
  const predictions = [];
  const trueOdds = analysisResult.trueOdds;

  // Résultat (1N2) : SEUL marché où l'app dispose d'une vraie cote bookmaker
  // (The Odds API n'est interrogée que sur le marché h2h) — predictedMarketOdds
  // n'existe donc que pour cette entrée.
  const outcomeOptions = [
    { outcome: 'home', odds: trueOdds.home, marketOdds: analysisResult.market?.odds1 ?? null, label: `${match.home} gagne` },
    { outcome: 'draw', odds: trueOdds.draw, marketOdds: analysisResult.market?.oddsDraw ?? null, label: 'Match nul' },
    { outcome: 'away', odds: trueOdds.away, marketOdds: analysisResult.market?.odds2 ?? null, label: `${match.away} gagne` }
  ];
  const result = outcomeOptions.reduce((best, o) => (o.odds < best.odds ? o : best));
  predictions.push({
    marketId: 'result',
    params: { outcome: result.outcome },
    market: MARKET_LABELS.result,
    predictedOutcome: result.outcome,
    predictedLabel: result.label,
    predictedOdds: result.odds,
    predictedMarketOdds: result.marketOdds
  });

  const totalGoalsBest = lowestOdds([
    { line: 0.5, odds: trueOdds.over05 },
    { line: 1.5, odds: trueOdds.over15 },
    { line: 2.5, odds: trueOdds.over25 },
    { line: 3.5, odds: trueOdds.over35 }
  ]);
  if (totalGoalsBest) {
    predictions.push({
      marketId: 'totalGoals',
      params: { line: totalGoalsBest.line, side: 'over' },
      market: MARKET_LABELS.totalGoals,
      predictedOutcome: 'over',
      predictedLabel: `Plus de ${totalGoalsBest.line} buts`,
      predictedOdds: totalGoalsBest.odds
    });
  }

  if (trueOdds.bothTeamsScore != null) {
    predictions.push({
      marketId: 'bothTeamsScore',
      params: {},
      market: MARKET_LABELS.bothTeamsScore,
      predictedOutcome: 'yes',
      predictedLabel: 'Oui',
      predictedOdds: trueOdds.bothTeamsScore
    });
  }

  if (trueOdds.resultAndTotal) {
    const candidates = [];
    for (const [line, bucket] of Object.entries(trueOdds.resultAndTotal)) {
      for (const [key, odds] of Object.entries(bucket)) {
        if (odds == null) continue;
        candidates.push({ odds, key, line, label: resultAndTotalLabel(line, key, match.home, match.away) });
      }
    }
    const best = lowestOdds(candidates);
    if (best) {
      predictions.push({
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
      const keys = TEAM_GOAL_LINE_KEYS[line];
      return [
        { odds: bucket[keys.over] ?? null, side: 'over', line },
        { odds: bucket[keys.under] ?? null, side: 'under', line }
      ];
    });
    const best = lowestOdds(candidates);
    if (best) {
      const sideLabel = best.side === 'over' ? 'Plus de' : 'Moins de';
      predictions.push({
        marketId: 'teamGoals',
        params: { team: side, line: best.line, side: best.side },
        market: MARKET_LABELS.teamGoals(teamName),
        predictedOutcome: best.side,
        predictedLabel: `${teamName} — ${sideLabel} ${best.line} buts`,
        predictedOdds: best.odds
      });
    }
  }

  return predictions;
}
