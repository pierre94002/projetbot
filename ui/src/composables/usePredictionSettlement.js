import { reactive } from 'vue';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { extractGoalLine, namesMatch } from '@/utils/betTrends.js';

// Le score final détermine mécaniquement l'issue de CHAQUE marché déjà
// pronostiqué pour ce match (résultat, total buts, BTTS, buts par équipe,
// résultat + total buts) — pas besoin d'une source de résultats en direct :
// une seule saisie suffit à régler tous les marchés du match d'un coup, au
// lieu de cliquer sur chacun. La ligne (0.5/1.5/2.5/3.5) est extraite du
// libellé déjà enregistré plutôt que supposée fixe : le moteur journalise
// désormais la ligne la plus probable, pas toujours la même.
export function deriveActualOutcome(entry, homeGoals, awayGoals) {
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

// Même principe que deriveActualOutcome ci-dessus, mais pour un pari réel
// (Mes paris) : le pick est un libellé humain ("Plus de 2.5 buts", "{équipe}
// — Moins de 1.5 buts"...) plutôt qu'un enum propre, donc on en extrait la
// ligne/le sens via texte plutôt que de comparer un champ structuré. Marché
// non reconnu (corners, tirs cadrés...) → null, jamais deviné.
export function deriveBetLegOutcome(leg, homeGoals, awayGoals) {
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

/**
 * Réglage d'un match (score final) et des actions manuelles sur un pronostic
 * — partagé entre la liste (Historique moteur) et la page de détail par
 * match, pour ne pas dupliquer cette logique de correspondance
 * marché/pick → issue réelle.
 */
export function usePredictionSettlement() {
  const predictionsStore = usePredictionsStore();
  const betsStore = useBetsStore();
  const matchesStore = useMatchesStore();
  const toastStore = useToastStore();

  const settling = reactive({}); // matchId -> bool

  async function settleMatch(group, score) {
    if (score.home === null || score.away === null || Number.isNaN(score.home) || Number.isNaN(score.away)) return;

    settling[group.matchId] = true;
    try {
      // Le score est aussi enregistré comme un vrai résultat (pas seulement
      // utilisé pour régler les pronostics ci-dessous) : les prochaines
      // analyses impliquant l'une de ces deux équipes mélangeront ce score réel
      // à la moyenne API-Football, cf. blendGoalsWithLocalResults côté serveur.
      await matchResultsApi.record({
        matchId: group.matchId,
        homeName: group.homeName,
        awayName: group.awayName,
        league: group.league,
        homeGoals: score.home,
        awayGoals: score.away
      });

      // matchesStore reste chargé en mémoire tout le temps que l'app est
      // ouverte — sans ce retrait immédiat, un scan lancé plus tard dans "Mes
      // paris" repartirait d'une liste de matchs encore périmée et
      // proposerait à nouveau ce match pourtant déjà réglé.
      matchesStore.removeMatch(group.matchId);

      for (const entry of group.entries) {
        const actual = deriveActualOutcome(entry, score.home, score.away);
        if (actual === null) continue;
        const status = actual === entry.predictedOutcome ? 'correct' : 'incorrect';
        if (entry.status !== status) await predictionsStore.updateStatus(entry.id, status);
      }

      // Règle aussi les paris réels du carnet sur ce même match — seulement les
      // sélections encore "en attente" : un statut déjà réglé à la main (ex.
      // annulé pour match reporté) n'est jamais écrasé automatiquement.
      let betsSettled = 0;
      for (const bet of betsStore.bets) {
        for (let legIndex = 0; legIndex < bet.legs.length; legIndex++) {
          const leg = bet.legs[legIndex];
          if (leg.matchId !== group.matchId) continue;
          const currentStatus = leg.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
          if (currentStatus !== 'pending') continue;
          const outcome = deriveBetLegOutcome(leg, score.home, score.away);
          if (outcome === null) continue;
          await betsStore.updateBetLegStatus(bet.id, legIndex, outcome);
          betsSettled++;
        }
      }

      toastStore.success(
        `Score ${group.homeName} ${score.home} - ${score.away} ${group.awayName} enregistré — pronostics réglés` +
          (betsSettled ? `, ${betsSettled} pari(s) réglé(s)` : '') +
          ' et moyennes mises à jour pour les prochaines analyses.'
      );
    } catch (error) {
      toastStore.error(`Réglage automatique impossible : ${error.message}`);
    } finally {
      settling[group.matchId] = false;
    }
  }

  async function setPredictionStatus(entry, status) {
    try {
      await predictionsStore.updateStatus(entry.id, status);
    } catch (error) {
      toastStore.error(`Mise à jour impossible : ${error.message}`);
    }
  }

  async function removePrediction(entry) {
    try {
      await predictionsStore.removeEntry(entry.id);
    } catch (error) {
      toastStore.error(`Suppression impossible : ${error.message}`);
    }
  }

  return { settling, settleMatch, setPredictionStatus, removePrediction };
}
