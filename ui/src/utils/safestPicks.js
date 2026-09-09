import { TEAM_GOAL_LINES, teamGoalsLineOdds } from './betTrends.js';
import { compareTeamsPoisson, teamLineOddsPoisson, TOTAL_SHOTS_LINES } from './shotsModel.js';

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

// L'ordre de `teams` n'est pas garanti domicile/extérieur : on résout par homeTeamId.
function resolveAveragesStats(averagesComparison) {
  const teams = averagesComparison?.teams;
  if (!teams || teams.length !== 2) return { home: null, away: null };
  return {
    home: (teams.find((t) => t.teamId === averagesComparison?.homeTeamId) ?? teams[0]).stats ?? null,
    away: (teams.find((t) => t.teamId !== averagesComparison?.homeTeamId) ?? teams[1]).stats ?? null
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
 * Récapitulatif "meilleures chances" : pour CHAQUE marché déjà calculé
 * ailleurs dans l'app, le pari le plus sûr qui reste au moins à
 * MIN_PICK_ODDS (pas juste le minimum absolu, souvent une quasi-certitude
 * sans intérêt) — trié par cote croissante. Ce n'est PAS un pari combiné :
 * les cotes ne sont jamais multipliées entre elles. Plusieurs marchés
 * dérivent du même modèle de buts (donc corrélés) — les combiner comme des
 * paris indépendants donnerait une fausse cote, trop généreuse.
 */
export function computeSafestPicks(result, averagesComparison) {
  if (!result) return [];

  const trueOdds = result.trueOdds;
  const homeName = result.teamStats?.home?.name ?? 'Domicile';
  const awayName = result.teamStats?.away?.name ?? 'Extérieur';
  const picks = [];

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

  // Tirs / tirs cadrés (nécessitent "Moyennes des deux équipes").
  const { home: homeStats, away: awayStats } = resolveAveragesStats(averagesComparison);

  if (homeStats && awayStats) {
    const totalShots = compareTeamsPoisson(Number(homeStats['Total Shots']), Number(awayStats['Total Shots']));
    if (totalShots) {
      const best = lowestAbove(
        [
          { pick: homeName, odds: totalShots.home > 0 ? Number((1 / totalShots.home).toFixed(2)) : null },
          { pick: 'Égalité', odds: totalShots.equal > 0 ? Number((1 / totalShots.equal).toFixed(2)) : null },
          { pick: awayName, odds: totalShots.away > 0 ? Number((1 / totalShots.away).toFixed(2)) : null }
        ],
        MIN_PICK_ODDS
      );
      if (best) picks.push({ market: 'Qui fait le plus de tirs', pick: best.pick, odds: best.odds });
    }

    const shotsOnTarget = compareTeamsPoisson(Number(homeStats['Shots on Goal']), Number(awayStats['Shots on Goal']));
    if (shotsOnTarget) {
      const best = lowestAbove(
        [
          { pick: homeName, odds: shotsOnTarget.home > 0 ? Number((1 / shotsOnTarget.home).toFixed(2)) : null },
          { pick: 'Égalité', odds: shotsOnTarget.equal > 0 ? Number((1 / shotsOnTarget.equal).toFixed(2)) : null },
          { pick: awayName, odds: shotsOnTarget.away > 0 ? Number((1 / shotsOnTarget.away).toFixed(2)) : null }
        ],
        MIN_PICK_ODDS
      );
      if (best) picks.push({ market: 'Qui fait le plus de tirs cadrés', pick: best.pick, odds: best.odds });
    }
  }

  // Tirs par équipe (les 4 lignes × Plus/Moins, pour chaque équipe).
  for (const [stats, teamName] of [
    [homeStats, homeName],
    [awayStats, awayName]
  ]) {
    if (!stats) continue;
    const candidates = TOTAL_SHOTS_LINES.flatMap((line) => {
      const lineOdds = teamLineOddsPoisson(Number(stats['Total Shots']), line);
      return [
        { odds: lineOdds?.overOdds, side: 'over', line },
        { odds: lineOdds?.underOdds, side: 'under', line }
      ];
    });
    const best = lowestAbove(candidates, MIN_PICK_ODDS);
    if (best) {
      const side = best.side === 'over' ? 'Plus de' : 'Moins de';
      picks.push({ market: 'Tirs par équipe', pick: `${teamName} — ${side} ${best.line} tirs`, odds: best.odds });
    }
  }

  return picks.sort((a, b) => a.odds - b.odds);
}
