import { TEAM_GOAL_LINES, teamGoalsLineOdds } from './betTrends.js';

function resultAndTotalLabels(line) {
  return {
    homeOver: (home) => `${home} & Plus de ${line} buts`,
    homeUnder: (home) => `${home} & Moins de ${line} buts`,
    drawOver: () => `Nul & Plus de ${line} buts`,
    drawUnder: () => `Nul & Moins de ${line} buts`,
    awayOver: (home, away) => `${away} & Plus de ${line} buts`,
    awayUnder: (home, away) => `${away} & Moins de ${line} buts`
  };
}

// En dessous de cette cote, le pari est quasi certain mais ne rapporte
// presque rien — pas utile dans un récapitulatif de paris à jouer. On
// cherche donc, dans chaque marché, la cote la plus basse qui reste ≥ à ce
// plancher plutôt que le minimum absolu (qui serait souvent une quasi-lock
// à 1.02, sans intérêt).
const MIN_PICK_ODDS = 1.35;

function lowestAbove(candidates, minOdds) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate.odds == null || candidate.odds < minOdds) continue;
    if (!best || candidate.odds < best.odds) best = candidate;
  }
  return best;
}

/**
 * Les lignes d'une statistique telles que le MOTEUR les donne (`statLines` de
 * l'analyse, cf. server/src/sports/football/statMarkets.js) : la cote juste de
 * chaque ligne, « moins » et « plus », par la binomiale négative mesurée sur
 * 36 400 matchs — jamais recalculée ici. Étape 8 du plan (06/10/2026) : ce
 * récapitulatif refaisait une loi de Poisson simple sur les moyennes de saison,
 * trop optimiste de 2 à 7 points pour corners et tirs.
 */
function lignesDuMoteur(lignes) {
  return (lignes ?? []).flatMap((l) => [
    { line: l.line, side: 'under', odds: l.under ?? null },
    { line: l.line, side: 'over', odds: l.over ?? null }
  ]);
}

const SENS = { over: 'Plus de', under: 'Moins de' };

/**
 * Récapitulatif "meilleures chances" : pour CHAQUE marché déjà calculé
 * ailleurs dans l'app, le pari le plus sûr qui reste au moins à
 * MIN_PICK_ODDS (pas juste le minimum absolu, souvent une quasi-certitude
 * sans intérêt) — trié par cote croissante. Ce n'est PAS un pari combiné :
 * les cotes ne sont jamais multipliées entre elles. Plusieurs marchés
 * dérivent du même modèle de buts (donc corrélés) — les combiner comme des
 * paris indépendants donnerait une fausse cote, trop généreuse.
 */
export function computeSafestPicks(result) {
  if (!result) return [];

  const trueOdds = result.trueOdds;
  const homeName = result.teamStats?.home?.name ?? 'Domicile';
  const awayName = result.teamStats?.away?.name ?? 'Extérieur';
  const picks = [];

  // Résultat (1N2) — seul marché où l'app dispose d'une vraie cote
  // bookmaker (cf. deriveMarketPredictions côté serveur), mais absent ici
  // jusque-là alors que c'est LE marché principal étudié partout ailleurs.
  const resultBest = lowestAbove(
    [
      { side: 'home', odds: trueOdds?.home },
      { side: 'draw', odds: trueOdds?.draw },
      { side: 'away', odds: trueOdds?.away }
    ],
    MIN_PICK_ODDS
  );
  if (resultBest) {
    const label = resultBest.side === 'home' ? `${homeName} gagne` : resultBest.side === 'away' ? `${awayName} gagne` : 'Match nul';
    picks.push({ market: 'Résultat', pick: label, odds: resultBest.odds });
  }

  // Total buts (Plus de X, pas de "Moins" calculé au niveau du match).
  const totalGoalsBest = lowestAbove(
    [
      { line: 0.5, odds: trueOdds?.over05 },
      { line: 1.5, odds: trueOdds?.over15 },
      { line: 2.5, odds: trueOdds?.over25 },
      { line: 3.5, odds: trueOdds?.over35 }
    ],
    MIN_PICK_ODDS
  );
  if (totalGoalsBest) picks.push({ market: 'Total buts', pick: `Plus de ${totalGoalsBest.line} buts`, odds: totalGoalsBest.odds });

  // Les 2 équipes marquent (valeur unique, pas de ligne alternative si sous le plancher).
  if (trueOdds?.bothTeamsScore >= MIN_PICK_ODDS) {
    picks.push({ market: 'Les 2 équipes marquent', pick: 'Oui', odds: trueOdds.bothTeamsScore });
  }

  // Résultat + Total buts (les 4 lignes × 6 issues).
  if (trueOdds?.resultAndTotal) {
    const candidates = [];
    for (const [line, bucket] of Object.entries(trueOdds.resultAndTotal)) {
      const labels = resultAndTotalLabels(line);
      for (const [key, odds] of Object.entries(bucket)) {
        if (odds == null) continue;
        candidates.push({ odds, label: labels[key](homeName, awayName) });
      }
    }
    const best = lowestAbove(candidates, MIN_PICK_ODDS);
    if (best) picks.push({ market: 'Résultat + Total buts', pick: best.label, odds: best.odds });
  }

  // Buts par équipe (les 4 lignes × Plus/Moins, pour chaque équipe).
  for (const [bucketKey, teamName] of [
    ['homeTeamGoals', homeName],
    ['awayTeamGoals', awayName]
  ]) {
    const bucket = trueOdds?.[bucketKey];
    if (!bucket) continue;
    const candidates = TEAM_GOAL_LINES.flatMap((line) => {
      const lineOdds = teamGoalsLineOdds(bucket, line);
      return [
        { odds: lineOdds?.overOdds, side: 'over', line },
        { odds: lineOdds?.underOdds, side: 'under', line }
      ];
    });
    const best = lowestAbove(candidates, MIN_PICK_ODDS);
    if (best) {
      const side = best.side === 'over' ? 'Plus de' : 'Moins de';
      picks.push({ market: 'Buts par équipe', pick: `${teamName} — ${side} ${best.line} buts`, odds: best.odds });
    }
  }

  // Corners, tirs et tirs cadrés : les cotes justes du MOTEUR (`statLines`, binomiale négative
  // mesurée), les mêmes que ses pronostics de marché — sur les lignes qu'il considère lui-même, plus
  // ET moins. Les mêmes marchés et libellés qu'avant (le règlement des paris les lit) ; « Qui fait le
  // plus de tirs / corners » n'a pas de probabilité du moteur et n'est plus proposé (il ne s'affichait
  // d'ailleurs plus : cet onglet ne recevait pas les moyennes de saison qu'il demandait).
  const lignes = result.statLines ?? null;
  const total = (kind, market, marketId, unit) => {
    const best = lowestAbove(lignesDuMoteur(lignes?.[kind]?.total), MIN_PICK_ODDS);
    if (best) picks.push({ market, marketId, params: { line: best.line, side: best.side }, pick: `${SENS[best.side]} ${best.line} ${unit}`, odds: best.odds });
  };
  total('shotsOnTarget', 'Total tirs cadrés', 'totalShotsOnTarget', 'tirs cadrés');
  total('corners', 'Total corners', 'totalCorners', 'corners');

  for (const [side, teamName] of [
    ['home', homeName],
    ['away', awayName]
  ]) {
    for (const [kind, market, marketId, unit] of [
      ['shots', 'Tirs par équipe', 'teamShots', 'tirs'],
      ['shotsOnTarget', 'Tirs cadrés par équipe', 'teamShotsOnTarget', 'tirs cadrés']
    ]) {
      const best = lowestAbove(lignesDuMoteur(lignes?.[kind]?.[side]), MIN_PICK_ODDS);
      if (best) picks.push({ market, marketId, params: { team: side, line: best.line, side: best.side }, pick: `${teamName} — ${SENS[best.side]} ${best.line} ${unit}`, odds: best.odds });
    }
  }

  return picks.sort((a, b) => a.odds - b.odds);
}
