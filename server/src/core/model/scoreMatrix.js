import { poissonProbability } from './poisson.js';
import { dixonColesAdjustment } from './dixonColes.js';

const MAX_GOALS_SIMULATED = 8;

const GOAL_LINES = [0.5, 1.5, 2.5, 3.5];
// Lignes buts marqués par UNE équipe (pas le total du match) — même jeu de
// lignes que GOAL_LINES pour un affichage cohérent (sélecteur identique).
// Les buts "pris" par une équipe sont exactement les buts "mis" par
// l'adversaire : pas besoin d'un troisième jeu de compteurs séparé.
const TEAM_GOAL_LINES = GOAL_LINES;

/**
 * Simule la matrice bivariée des scores (0-0 à 8-8) et en dérive les
 * probabilités des principaux marchés : 1N2, Over 0.5/1.5/2.5/3.5 buts,
 * Over buts par équipe (domicile/extérieur), BTTS, et le combo
 * Résultat + Plus/Moins de buts (6 issues, sur chacune des 4 lignes).
 */
export function computeScoreMatrix(lambda, mu, rho) {
  let probHome = 0;
  let probDraw = 0;
  let probAway = 0;
  let probBothTeamsScore = 0;
  const probOverLine = Object.fromEntries(GOAL_LINES.map((line) => [line, 0]));
  const probHomeTeamOver = Object.fromEntries(TEAM_GOAL_LINES.map((line) => [line, 0]));
  const probAwayTeamOver = Object.fromEntries(TEAM_GOAL_LINES.map((line) => [line, 0]));
  // Un compteur "résultat + plus/moins" par ligne de buts (0.5/1.5/2.5/3.5),
  // pas juste 2.5 — même jeu de lignes que le total de buts simple.
  const probResultAndTotal = Object.fromEntries(
    GOAL_LINES.map((line) => [line, { homeOver: 0, homeUnder: 0, drawOver: 0, drawUnder: 0, awayOver: 0, awayUnder: 0 }])
  );

  for (let homeGoals = 0; homeGoals <= MAX_GOALS_SIMULATED; homeGoals++) {
    for (let awayGoals = 0; awayGoals <= MAX_GOALS_SIMULATED; awayGoals++) {
      const independentProbability = poissonProbability(homeGoals, lambda) * poissonProbability(awayGoals, mu);
      const correction = dixonColesAdjustment(homeGoals, awayGoals, lambda, mu, rho);
      const scoreProbability = Math.max(0, independentProbability * correction);

      const totalGoals = homeGoals + awayGoals;
      let resultKey;
      if (homeGoals > awayGoals) {
        probHome += scoreProbability;
        resultKey = 'home';
      } else if (homeGoals === awayGoals) {
        probDraw += scoreProbability;
        resultKey = 'draw';
      } else {
        probAway += scoreProbability;
        resultKey = 'away';
      }

      for (const line of GOAL_LINES) {
        const isOver = totalGoals > line;
        if (isOver) probOverLine[line] += scoreProbability;
        probResultAndTotal[line][`${resultKey}${isOver ? 'Over' : 'Under'}`] += scoreProbability;
      }
      for (const line of TEAM_GOAL_LINES) {
        if (homeGoals > line) probHomeTeamOver[line] += scoreProbability;
        if (awayGoals > line) probAwayTeamOver[line] += scoreProbability;
      }

      if (homeGoals > 0 && awayGoals > 0) probBothTeamsScore += scoreProbability;
    }
  }

  const total = probHome + probDraw + probAway || 1;
  const normalizeResultAndTotal = (bucket) => ({
    homeOver: bucket.homeOver / total,
    homeUnder: bucket.homeUnder / total,
    drawOver: bucket.drawOver / total,
    drawUnder: bucket.drawUnder / total,
    awayOver: bucket.awayOver / total,
    awayUnder: bucket.awayUnder / total
  });

  return {
    home: probHome / total,
    draw: probDraw / total,
    away: probAway / total,
    over05: probOverLine[0.5] / total,
    over15: probOverLine[1.5] / total,
    over25: probOverLine[2.5] / total,
    over35: probOverLine[3.5] / total,
    homeTeamGoals: {
      over05: probHomeTeamOver[0.5] / total,
      over15: probHomeTeamOver[1.5] / total,
      over25: probHomeTeamOver[2.5] / total,
      over35: probHomeTeamOver[3.5] / total,
      under05: 1 - probHomeTeamOver[0.5] / total,
      under15: 1 - probHomeTeamOver[1.5] / total,
      under25: 1 - probHomeTeamOver[2.5] / total,
      under35: 1 - probHomeTeamOver[3.5] / total
    },
    awayTeamGoals: {
      over05: probAwayTeamOver[0.5] / total,
      over15: probAwayTeamOver[1.5] / total,
      over25: probAwayTeamOver[2.5] / total,
      over35: probAwayTeamOver[3.5] / total,
      under05: 1 - probAwayTeamOver[0.5] / total,
      under15: 1 - probAwayTeamOver[1.5] / total,
      under25: 1 - probAwayTeamOver[2.5] / total,
      under35: 1 - probAwayTeamOver[3.5] / total
    },
    bothTeamsScore: probBothTeamsScore / total,
    resultAndTotal: {
      0.5: normalizeResultAndTotal(probResultAndTotal[0.5]),
      1.5: normalizeResultAndTotal(probResultAndTotal[1.5]),
      2.5: normalizeResultAndTotal(probResultAndTotal[2.5]),
      3.5: normalizeResultAndTotal(probResultAndTotal[3.5])
    }
  };
}
