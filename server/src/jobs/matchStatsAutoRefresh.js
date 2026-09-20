/**
 * matchStatsAutoRefresh.js
 * -----------------------------------------------------------------------
 * Tient les statistiques de match à jour sans qu'on ait à le demander.
 *
 * À intervalle régulier, le serveur cherche les rencontres terminées dont
 * les statistiques manquent et va les chercher chez ESPN. La source étant
 * gratuite et sans clé, cette boucle ne consomme aucun quota : c'est ce qui
 * permet de la laisser tourner en permanence, contrairement aux fournisseurs
 * payants du projet.
 *
 * Une fois le retard comblé, chaque passage ne trouve que les rencontres
 * jouées depuis le précédent — quelques secondes, le plus souvent rien.
 *
 * Réglages (variables d'environnement) :
 *   MATCH_STATS_AUTO_REFRESH          "false" pour désactiver
 *   MATCH_STATS_REFRESH_INTERVAL_MIN  période en minutes (défaut : 180)
 *   MATCH_STATS_REFRESH_DELAY_MIN     attente au démarrage (défaut : 2)
 *   MATCH_STATS_REFRESH_BATCH         matchs par passage (défaut : 300)
 * -----------------------------------------------------------------------
 */

import { refreshMatchStats, withRefreshLock } from '../data/providers/espnMatchStatsRefresh.js';
import { refreshFromFotMob } from '../data/providers/fotMobRefresh.js';
import { refreshCalendarFromEspn, refreshStandingsFromEspn } from '../data/providers/espnScheduleRefresh.js';
import { env } from '../config/env.js';

let timer = null;

async function runOnce(reason) {
  const { batchSize, concurrency } = env.matchStatsRefresh;
  try {
    // Les deux passes s'enchaînent sous UN seul verrou : ESPN constitue les
    // rencontres (scores, feuilles de match), FotMob remplit ensuite les
    // cases qu'ESPN ne publie pas (xG, duels, notes, minutes). L'ordre
    // compte — FotMob ne fait que compléter ce qui existe déjà.
    const report = await withRefreshLock(async () => {
      // 1. Le calendrier d'abord : c'est lui qui dit quelles rencontres sont
      //    terminées, donc lesquelles ont des statistiques à récupérer.
      const calendar = await refreshCalendarFromEspn({ concurrency }).catch((e) => ({ error: e.message }));
      const standings = await refreshStandingsFromEspn().catch((e) => ({ error: e.message }));
      // 2. Puis les statistiques : ESPN constitue, FotMob complète.
      const espn = await refreshMatchStats({ limit: batchSize, concurrency });
      const fotMob = await refreshFromFotMob({ limit: batchSize, concurrency: Math.max(1, concurrency - 1) });
      return { calendar, standings, espn, fotMob };
    });

    if (report.skipped) {
      console.log(`[stats] rafraîchissement ${reason} reporté : ${report.skipped}.`);
      return;
    }
    const { calendar, standings, espn, fotMob } = report;
    const changedCalendar = Boolean(calendar?.merge?.created || calendar?.merge?.updated || calendar?.error);
    if (espn.considered === 0 && fotMob.considered === 0 && !changedCalendar) return; // Rien n'a bougé.
    console.log(
      `[stats] rafraîchissement ${reason} — calendrier : ` +
        `${calendar?.merge ? `${calendar.merge.created} créé(s), ${calendar.merge.updated} mis à jour, ${calendar.merge.conflicts} conflit(s)` : (calendar?.error ?? 'inchangé')}` +
        ` | classements : ${standings?.leagues ?? 0} championnat(s)` +
        `${standings?.staleKept?.length ? `, ${standings.staleKept.length} ligne(s) périmée(s) écartée(s)` : ''}` +
        ` | ESPN ${espn.merged} match(s), ${espn.playersMerged} ligne(s) joueur ` +
        `(${espn.unmatched} non apparié(s), ${espn.failed} échec(s)) — ` +
        `FotMob ${fotMob.merged} match(s) enrichi(s), ${fotMob.playersMerged} ligne(s) joueur ` +
        `(${fotMob.unmatched} non apparié(s), ${fotMob.failed} échec(s)).`
    );
  } catch (error) {
    // Une panne réseau ou un changement chez une source ne doit pas faire
    // tomber l'API : le prochain passage réessaiera.
    console.error(`[stats] rafraîchissement ${reason} en échec : ${error.message}`);
  }
}

/** Démarre la boucle. Sans effet si elle tourne déjà ou si elle est désactivée. */
export function startMatchStatsAutoRefresh() {
  const { enabled, intervalMinutes, startupDelayMinutes } = env.matchStatsRefresh;
  if (!enabled || timer) return false;

  const intervalMs = intervalMinutes * 60_000;
  setTimeout(() => {
    runOnce('au démarrage');
    timer = setInterval(() => runOnce('périodique'), intervalMs);
    // Le minuteur ne doit pas retenir le processus à l'arrêt.
    timer.unref?.();
  }, startupDelayMinutes * 60_000).unref?.();

  console.log(`[stats] rafraîchissement automatique toutes les ${intervalMinutes} min (premier passage dans ${startupDelayMinutes} min).`);
  return true;
}

export function stopMatchStatsAutoRefresh() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
