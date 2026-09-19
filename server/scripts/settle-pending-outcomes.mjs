#!/usr/bin/env node
/**
 * settle-pending-outcomes.mjs
 * -----------------------------------------------------------------------
 * Règle automatiquement TOUS les pronostics du moteur et TOUTES les
 * sélections de paris réels ("Mes paris") encore en attente, pour chaque
 * match qui a déjà un résultat dans data/runtime/match-results.json —
 * exactement ce que fait `settleMatch()` dans
 * ui/src/composables/usePredictionSettlement.js quand Pierre saisit un
 * score à la main dans "Historique moteur", mais déclenchable sans ouvrir
 * l'appli (ex. depuis une tâche planifiée juste après
 * merge-daily-results.mjs).
 *
 * `deriveActualOutcome`/`deriveBetLegOutcome` ci-dessous sont une copie
 * fidèle de ui/src/composables/usePredictionSettlement.js (+ extractGoalLine/
 * namesMatch de ui/src/utils/betTrends.js) — le libellé exact de chaque
 * marché et la logique de correspondance doivent rester identiques des deux
 * côtés. Aucune autre copie ne doit exister : si cette logique change côté
 * UI, reporte le même changement ici.
 *
 * Usage :
 *   node settle-pending-outcomes.mjs
 * (aucun argument : lit/écrit directement match-results.json,
 * predictions.json et bets.json via les repositories du serveur)
 * -----------------------------------------------------------------------
 */

import { listMatchResults } from '../src/data/repositories/matchResultsRepository.js';
import { listPredictions, updatePredictionStatus } from '../src/data/repositories/predictionsRepository.js';
import { listBets, updateBetLegStatus } from '../src/data/repositories/betsRepository.js';
import { teamNamesLikelyMatch } from '../src/utils/teamNameMatch.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les pronostics et paris portent le matchId The Odds API, alors que les
 * résultats importés par merge-daily-results.mjs n'ont qu'un id dérivé
 * "web-<date>-<équipes>" : sans ce repli par date (±1 jour, fuseau) et noms
 * d'équipe, rien n'était jamais réglé automatiquement.
 */
function buildResultLookup(results) {
  const byMatchId = new Map(results.map((r) => [r.matchId, r]));
  const webResults = results.filter((r) => typeof r.matchId === 'string' && /^web-\d{4}-\d{2}-\d{2}-/.test(r.matchId));
  return (matchId, day, homeName, awayName) => {
    const direct = byMatchId.get(matchId);
    if (direct) return direct;
    const dayMs = Date.parse(day ?? '');
    if (!Number.isFinite(dayMs)) return null;
    return (
      webResults.find(
        (r) =>
          Math.abs(Date.parse(r.matchId.slice(4, 14)) - dayMs) <= ONE_DAY_MS &&
          teamNamesLikelyMatch(r.homeName, homeName) &&
          teamNamesLikelyMatch(r.awayName, awayName)
      ) ?? null
    );
  };
}

const GOAL_LINE_IN_LABEL = /(?:plus|moins) de (\d+(?:[.,]\d+)?)\s*buts?/i;

function extractGoalLine(label) {
  const match = GOAL_LINE_IN_LABEL.exec(label ?? '');
  return match ? match[1].replace(',', '.') : null;
}

function namesMatch(pick, teamName) {
  const normalize = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalize(pick).startsWith(normalize(teamName));
}

function deriveActualOutcome(entry, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';

  if (entry.market === 'Résultat') return resultSide;
  if (entry.market === 'Les 2 équipes marquent') return homeGoals > 0 && awayGoals > 0 ? 'yes' : 'no';

  if (entry.market === 'Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : total > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.homeName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : homeGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.awayName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : awayGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === 'Résultat + Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    if (line === null) return null;
    const totalSide = total > Number(line) ? 'Over' : 'Under';
    const sideKey = resultSide === 'draw' ? 'draw' : resultSide;
    return `${sideKey}${totalSide}`;
  }
  return null;
}

function deriveBetLegOutcome(leg, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  const bttsYes = homeGoals > 0 && awayGoals > 0;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';
  const pick = leg.pick ?? '';

  if (leg.market === 'Résultat' || leg.market === '1N2') {
    if (/nul/i.test(pick)) return resultSide === 'draw' ? 'won' : 'lost';
    if (namesMatch(pick, leg.homeName)) return resultSide === 'home' ? 'won' : 'lost';
    if (namesMatch(pick, leg.awayName)) return resultSide === 'away' ? 'won' : 'lost';
    return null;
  }

  if (leg.market === 'Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    return (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (leg.market === 'Les 2 équipes marquent') {
    return bttsYes === /oui/i.test(pick) ? 'won' : 'lost';
  }

  if (leg.market === 'Buts par équipe' || leg.market.startsWith('Buts — ')) {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    const isHomeTeam = namesMatch(pick, leg.homeName);
    const isAwayTeam = namesMatch(pick, leg.awayName);
    if (!isHomeTeam && !isAwayTeam) return null;
    const teamGoals = isHomeTeam ? homeGoals : awayGoals;
    return (teamGoals > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (leg.market === 'Résultat + Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    let sideMatches;
    if (/nul/i.test(pick)) sideMatches = resultSide === 'draw';
    else if (namesMatch(pick, leg.homeName)) sideMatches = resultSide === 'home';
    else if (namesMatch(pick, leg.awayName)) sideMatches = resultSide === 'away';
    else return null;
    return sideMatches && (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  return null;
}

function main() {
  const findResult = buildResultLookup(listMatchResults());

  let predictionsSettled = 0;
  let predictionsSkippedNoRule = 0;
  for (const entry of listPredictions()) {
    if (entry.status !== 'pending') continue;
    const result = findResult(entry.matchId, entry.day, entry.homeName, entry.awayName);
    if (!result) continue;

    const actual = deriveActualOutcome(entry, result.homeGoals, result.awayGoals);
    if (actual === null) {
      predictionsSkippedNoRule++;
      continue;
    }
    const status = actual === entry.predictedOutcome ? 'correct' : 'incorrect';
    updatePredictionStatus(entry.id, status);
    predictionsSettled++;
  }

  let betLegsSettled = 0;
  let betLegsSkippedNoRule = 0;
  for (const bet of listBets()) {
    for (let legIndex = 0; legIndex < bet.legs.length; legIndex++) {
      const leg = bet.legs[legIndex];
      const currentStatus = leg.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
      if (currentStatus !== 'pending') continue;
      const result = findResult(leg.matchId, (leg.commenceTime ?? bet.createdAt ?? '').slice(0, 10), leg.homeName, leg.awayName);
      if (!result) continue;

      const outcome = deriveBetLegOutcome(leg, result.homeGoals, result.awayGoals);
      if (outcome === null) {
        betLegsSkippedNoRule++;
        continue;
      }
      updateBetLegStatus(bet.id, legIndex, outcome);
      betLegsSettled++;
    }
  }

  console.log(JSON.stringify({ predictionsSettled, predictionsSkippedNoRule, betLegsSettled, betLegsSkippedNoRule }));
}

main();
